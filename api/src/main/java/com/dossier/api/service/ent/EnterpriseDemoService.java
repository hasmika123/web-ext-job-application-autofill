package com.dossier.api.service.ent;

import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.DemoException;
import com.dossier.api.service.TokenIssuer;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The one-click demo sign-in of the Enterprise V2 demo tenants (X1.12): what the tenant login's "Demo accounts" tab lists, and
 * the sign-in itself. It reuses the demo machinery ({@code dossier.demo.enabled}, the demo namespace, {@link TokenIssuer}) and
 * the tenant-bound session rule of X1.5 ({@link TenantSessionService}); it adds no way in that the password path does not have
 * except "no password".
 *
 * <p>Both calls are tenant-host only and config-gated ({@link EnterpriseDemoSeeder#refusal()}): off, the list is empty and the
 * login is {@code DEMO_DISABLED}. A login is accepted only on the host of the organization whose roster it belongs to (a member
 * of Acme on Beta's host is {@code NOT_A_MEMBER}, exactly as with a password), only while the seat is ACTIVE, and the tokens it
 * issues carry {@code tid}/{@code hid} like any tenant session.
 */
@Service
public class EnterpriseDemoService {

    /** One row of the tab. Never a password. {@code canSignIn} is false for a suspended or invited member. */
    public record DemoMember(String login, String name, String primaryRole, List<String> roles, String status, boolean canSignIn) {}

    /** The tab's whole payload. */
    public record Directory(boolean enabled, String org, List<DemoMember> accounts) {
        static Directory off() {
            return new Directory(false, null, List.of());
        }
    }

    private final EnterpriseDemoSeeder seeder;
    private final OrganizationRepository orgs;
    private final OrgMemberRepository members;
    private final OrgMemberRoleRepository memberRoles;
    private final OrgRoleRepository roleRows;
    private final UserRepository users;
    private final TenantSessionService sessions;
    private final TokenIssuer tokenIssuer;

    public EnterpriseDemoService(
        EnterpriseDemoSeeder seeder,
        OrganizationRepository orgs,
        OrgMemberRepository members,
        OrgMemberRoleRepository memberRoles,
        OrgRoleRepository roleRows,
        UserRepository users,
        TenantSessionService sessions,
        TokenIssuer tokenIssuer
    ) {
        this.seeder = seeder;
        this.orgs = orgs;
        this.members = members;
        this.memberRoles = memberRoles;
        this.roleRows = roleRows;
        this.users = users;
        this.sessions = sessions;
        this.tokenIssuer = tokenIssuer;
    }

    /** True when the demo members can be offered at all: demo on, enterprise seed on, not prod. */
    public boolean enabled() {
        return seeder.refusal() == null;
    }

    private EnterpriseDemoSeeder.Tenant rosterOf(TenantContext c) {
        if (c == null || !c.isTenant() || c.orgId() == null) return null;
        Organization org = orgs.findByOrgId(c.orgId()).orElse(null);
        return org == null ? null : EnterpriseDemoSeeder.bySlug(org.getSlug()).orElse(null);
    }

    @Transactional(readOnly = true)
    public Directory directory(TenantContext c) {
        if (!enabled()) return Directory.off();
        EnterpriseDemoSeeder.Tenant t = rosterOf(c);
        if (t == null) return Directory.off();
        Long orgId = c.orgId();
        List<DemoMember> out = new ArrayList<>();
        for (EnterpriseDemoSeeder.Person p : t.people()) {
            String name = p.first() + " " + p.last();
            if (p.status() == OrgMemberStatus.INVITED) {
                boolean pending = !members.findByOrgIdAndInviteEmailAndStatusIn(orgId, p.email(t.orgKey()), List.of(OrgMemberStatus.INVITED)).isEmpty();
                if (pending) {
                    List<String> roles = labels(orgId, null, p);
                    out.add(new DemoMember(null, name, roles.get(0), roles, "INVITED", false));
                }
                continue;
            }
            User u = users.findOneByLogin(p.login(t.orgKey())).orElse(null);
            if (u == null) continue;
            OrgMember seat = members.findByOrgIdAndUserIdAndStatusIn(orgId, u.getId(), List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.SUSPENDED)).stream().findFirst().orElse(null);
            if (seat == null) continue;
            List<String> roles = labels(orgId, seat, p);
            boolean active = seat.getStatus() == OrgMemberStatus.ACTIVE;
            out.add(new DemoMember(u.getLogin(), name, roles.isEmpty() ? null : roles.get(0), roles, seat.getStatus().name(), active));
        }
        return new Directory(true, t.name(), out);
    }

    /** The member's live role names, primary first (from the role rows); the roster only backs a seat that has no rows (an invitation). */
    private List<String> labels(Long orgId, OrgMember seat, EnterpriseDemoSeeder.Person p) {
        if (seat != null) {
            List<OrgMemberRole> live = memberRoles.findLiveByOrgIdAndMemberId(orgId, seat.getId());
            if (!live.isEmpty()) {
                Map<Long, String> names = roleRows
                    .findVisibleByOrgIdAndIdIn(orgId, live.stream().map(OrgMemberRole::getRoleId).toList())
                    .stream()
                    .collect(Collectors.toMap(OrgRoleDefinition::getId, OrgRoleDefinition::getName, (a, b) -> a));
                return live.stream().map(r -> names.get(r.getRoleId())).filter(x -> x != null).toList();
            }
        }
        return p.roles().stream().map(k -> RoleTemplates.find(k).map(RoleTemplates.Template::name).orElse(k)).toList();
    }

    /**
     * The tokens for {@code login} on the current tenant host. 403 DEMO_DISABLED while the demo (or the enterprise seed) is off; 404
     * on a platform or unserved host and for a login that is not a demo member; 403 NOT_A_MEMBER for a member of another tenant or a
     * seat that is not active.
     */
    @Transactional
    public TokenIssuer.TokenPair login(String rawLogin, TenantContext c) {
        if (!enabled()) throw DemoException.disabled();
        String login = rawLogin == null ? "" : rawLogin.trim().toLowerCase(Locale.ENGLISH);
        if (c == null || !c.isTenant()) throw new OrgNotFoundException();
        User user = users.findOneWithAuthoritiesByLogin(login).orElse(null);
        if (user == null || !user.isActivated() || !EnterpriseDemoSeeder.isEnterpriseDemoLogin(login)) throw new OrgNotFoundException();
        if (rosterOf(c) == null) throw new OrgNotFoundException(); // a tenant that is not one of the demo tenants has no demo members
        // The X1.5 rule: an ACTIVE seat in THIS host's organization (else 403 NOT_A_MEMBER plus its audit row), then bind the session.
        TenantBinding binding = sessions.bindingForLogin(user.getId(), login).orElseThrow(OrgException::notAMember);
        String authorities = user.getAuthorities().stream().map(Authority::getName).collect(Collectors.joining(" "));
        return tokenIssuer.issue(user.getLogin(), authorities, user.getId(), binding);
    }
}
