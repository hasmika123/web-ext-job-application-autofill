package com.dossier.api.service.ent.consultant;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.consultant.ConProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.TreeSet;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The {@code workspaces[]} of {@code GET /api/profile/version} (doc 60 section 4): the organizations the signed-in person can work in, so the browser
 * extension can offer a Personal / organization chip without asking the caller to name an organization.
 *
 * <p>One entry per ACTIVE seat whose organization reads roles from data and has the marketing module on. {@code marketer} = the seat holds
 * {@code opportunities.manage}. {@code consultant} = the seat would pass {@link ConScope} (consultant jobs flag on, {@code opportunities.respond}, exactly one
 * ACTIVE {@code consultant_profile}); it is the same test, so the extension never shows a Jobs tab that answers 404. Both can be false: the entry is still
 * listed (the person is a member), and the extension offers nothing in it.
 *
 * <p>Read per request and NOT part of the profile {@code version} hash on purpose: that hash is "exactly what a pull of the bio and resumes returns" and
 * triggers the extension's mirror re-pull, which a change of membership does not need; the extension reads {@code workspaces} on every poll anyway.
 */
@Service
public class ProfileWorkspaces {

    /** One entry of {@code workspaces[]}. */
    public record Workspace(Long orgId, String name, boolean consultant, boolean marketer) {}

    /**
     * Who the signed-in account is, as the extension needs it (decision O4, doc 19 section 6.2): {@code kind} is {@code "PERSONAL"} or {@code "ENTERPRISE"};
     * an enterprise account adds its organization (id and name) and its two roles; a personal account has no organization and both flags are false.
     */
    public record Account(String kind, Long orgId, String name, boolean consultant, boolean marketer) {
        public static final Account PERSONAL = new Account("PERSONAL", null, null, false, false);
    }

    private final UserRepository users;
    private final OrgMemberRepository members;
    private final OrganizationRepository organizations;
    private final OrgAccessService access;
    private final OrgRoleService roles;
    private final TenantModules modules;
    private final EnterpriseFeatureFlag flags;
    private final ConProfileRepository profiles;

    public ProfileWorkspaces(
        UserRepository users, OrgMemberRepository members, OrganizationRepository organizations, OrgAccessService access, OrgRoleService roles,
        TenantModules modules, EnterpriseFeatureFlag flags, ConProfileRepository profiles
    ) {
        this.users = users;
        this.members = members;
        this.organizations = organizations;
        this.access = access;
        this.roles = roles;
        this.modules = modules;
        this.flags = flags;
        this.profiles = profiles;
    }

    /** The signed-in person's workspaces, ordered by organization id. Empty when nobody is signed in or the person has no seat anywhere. */
    @Transactional(readOnly = true)
    public List<Workspace> ofCurrentUser() {
        Optional<User> user = SecurityUtils.getCurrentUserLogin().flatMap(users::findOneByLogin);
        if (user.isEmpty()) return List.of();
        TreeSet<Long> orgIds = new TreeSet<>();
        for (OrgMember m : members.findMine(user.get().getId())) if (m.getStatus() == OrgMemberStatus.ACTIVE && m.getOrgId() != null) orgIds.add(m.getOrgId());
        List<Workspace> out = new ArrayList<>();
        for (Long orgId : orgIds) {
            if (!roles.rolesFromData(orgId) || !modules.isOn(TenantModule.MARKETING, orgId)) continue;
            Optional<OrgMembership> me = access.resolve(orgId);
            Optional<Organization> org = organizations.findByOrgId(orgId);
            if (me.isEmpty() || org.isEmpty()) continue;
            out.add(new Workspace(orgId, name(org.get()), consultant(me.get()), me.get().canKey("opportunities.manage")));
        }
        return out;
    }

    /**
     * The signed-in account (see {@link Account}). An enterprise account (its row has an {@code org_id}) reports its own organization even when the
     * marketing module or role data is off there (then both flags are false and the extension offers nothing beyond the plain drawer); anything else,
     * or any failure to look, is the personal account.
     */
    @Transactional(readOnly = true)
    public Account accountOfCurrentUser() {
        Optional<User> user = SecurityUtils.getCurrentUserLogin().flatMap(users::findOneByLogin);
        if (user.isEmpty()) return Account.PERSONAL;
        Long orgId = user.get().getOrgId();
        // A seeded enterprise DEMO member (shared-mode login, no org on its user row) is the enterprise account of the tenant its token is bound to.
        if (orgId == null && EnterpriseDemoSeeder.isEnterpriseDemoLogin(user.get().getLogin())) orgId = SecurityUtils.getCurrentTenantId().orElse(null);
        if (orgId == null) return Account.PERSONAL;
        Optional<Organization> org = organizations.findByOrgId(orgId);
        if (org.isEmpty()) return Account.PERSONAL;
        boolean consultant = false;
        boolean marketer = false;
        if (roles.rolesFromData(orgId) && modules.isOn(TenantModule.MARKETING, orgId)) {
            Optional<OrgMembership> me = access.resolve(orgId);
            if (me.isPresent()) {
                consultant = consultant(me.get());
                marketer = me.get().canKey("opportunities.manage");
            }
        }
        return new Account("ENTERPRISE", orgId, name(org.get()), consultant, marketer);
    }

    private boolean consultant(OrgMembership me) {
        if (!flags.isEnabled(EnterpriseSettingKeys.FLAG_CONSULTANT_JOBS, me.orgId()) || !me.canKey(ConScope.PERMISSION)) return false;
        var mine = profiles.findByOrgIdAndMemberId(me.orgId(), me.memberId());
        return mine.size() == 1 && "ACTIVE".equals(mine.get(0).getStatus());
    }

    private static String name(Organization org) {
        return org.getDisplayName() != null && !org.getDisplayName().isBlank() ? org.getDisplayName() : org.getName();
    }
}
