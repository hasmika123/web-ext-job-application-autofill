package com.dossier.api.service.ent.members;

import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.service.ent.OrgRoleWriteService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The protections every people lifecycle action shares (X4.3 / X4.4, 15 section 2): nobody acts on their own seat, only an owner acts on an
 * owner and only an administrator acts on an administrator (a rank rule, so the people-operations role cannot suspend the people who
 * administer it), and the organization always keeps an Owner and an administrator. The role-assignment write has its own copy of the last-admin
 * rule (X1.14); this one answers the same question for suspend and offboard with the same templates and the same counting query.
 */
@Component
public class MemberGuards {

    public static final String CODE_SELF = "SELF";
    public static final String CODE_LAST_ADMIN = "LAST_ADMIN";
    public static final String CODE_OWNER_MUST_TRANSFER = "OWNER_MUST_TRANSFER";

    private static final Set<String> ADMIN_TEMPLATES = Set.of(RoleTemplates.OWNER, RoleTemplates.ORG_ADMIN);
    private static final Set<String> OWNER_TEMPLATES = Set.of(RoleTemplates.OWNER);

    private final OrgMemberRoleRepository memberRoles;
    private final OrgRoleRepository roles;

    public MemberGuards(OrgMemberRoleRepository memberRoles, OrgRoleRepository roles) {
        this.memberRoles = memberRoles;
        this.roles = roles;
    }

    /** 409 SELF: nobody suspends, reinstates or offboards their own seat (a person leaves through their own "leave" action). */
    public void requireNotSelf(OrgMembership me, OrgMember seat) {
        if (seat.getId().equals(me.memberId())) {
            throw OrgException.coded(409, CODE_SELF, "You cannot do this to your own seat", Map.of("reason", CODE_SELF));
        }
    }

    /** 422 ROLE_CEILING (reason TARGET_RANK): an owner needs an owner, an administrator needs an administrator. */
    @Transactional(readOnly = true)
    public void requireRank(OrgMembership me, OrgMember seat) {
        if (isOwner(seat) && !callerIsOwner(me)) throw rank();
        if (isAdmin(seat) && !callerIsAdmin(me)) throw rank();
    }

    /** True when the rank rule would refuse this caller for this seat (for previews, which report instead of throwing). */
    @Transactional(readOnly = true)
    public boolean rankRefuses(OrgMembership me, OrgMember seat) {
        return (isOwner(seat) && !callerIsOwner(me)) || (isAdmin(seat) && !callerIsAdmin(me));
    }

    /** 409 LAST_ADMIN when taking this seat out of service would leave the organization without an Owner or an administrator. */
    @Transactional(readOnly = true)
    public void requireNotLastAdmin(Long orgId, OrgMember seat) {
        if (lastAdminProblem(orgId, seat) != null) throw lastAdminProblem(orgId, seat);
    }

    /** The LAST_ADMIN refusal for this seat, or {@code null} when the organization keeps its owner and administrator without it. */
    @Transactional(readOnly = true)
    public OrgException lastAdminProblem(Long orgId, OrgMember seat) {
        boolean owner = isOwner(seat);
        if (owner && memberRoles.countOtherActiveSeatsHolding(orgId, seat.getId(), OWNER_TEMPLATES, Set.of(OrgRole.OWNER)) == 0) {
            return OrgException.coded(409, CODE_LAST_ADMIN, "The organization needs at least one Owner", Map.of("role", RoleTemplates.OWNER));
        }
        boolean admin = owner || isAdmin(seat);
        if (admin && memberRoles.countOtherActiveSeatsHolding(orgId, seat.getId(), ADMIN_TEMPLATES, Set.of(OrgRole.OWNER, OrgRole.ADMIN)) == 0) {
            return OrgException.coded(409, CODE_LAST_ADMIN, "The organization needs at least one administrator", Map.of("role", RoleTemplates.ORG_ADMIN));
        }
        return null;
    }

    /** The legacy enum mirror says Owner, or a live role is (a copy of) the Owner template. */
    @Transactional(readOnly = true)
    public boolean isOwner(OrgMember seat) {
        return seat.getRole() == OrgRole.OWNER || holds(seat, OWNER_TEMPLATES);
    }

    /** Administrator level: the enum says Owner or Admin, or a live role is (a copy of) the Owner or Organization Admin template. */
    @Transactional(readOnly = true)
    public boolean isAdmin(OrgMember seat) {
        return seat.getRole() == OrgRole.OWNER || seat.getRole() == OrgRole.ADMIN || holds(seat, ADMIN_TEMPLATES);
    }

    static boolean callerIsOwner(OrgMembership me) {
        return me.role() == OrgRole.OWNER || me.roles().stream().anyMatch(r -> RoleTemplates.OWNER.equals(r.key()));
    }

    static boolean callerIsAdmin(OrgMembership me) {
        return me.role() == OrgRole.OWNER || me.role() == OrgRole.ADMIN || me.canKey(OrgRoleWriteService.PERM_MEMBERS_ROLE_SET);
    }

    private boolean holds(OrgMember seat, Set<String> templateKeys) {
        List<OrgMemberRole> live = memberRoles.findLiveByOrgIdAndMemberId(seat.getOrgId(), seat.getId());
        if (live.isEmpty()) return false;
        Map<Long, OrgRoleDefinition> defs = roles
            .findVisibleByOrgIdAndIdIn(seat.getOrgId(), live.stream().map(OrgMemberRole::getRoleId).collect(Collectors.toSet()))
            .stream()
            .collect(Collectors.toMap(OrgRoleDefinition::getId, d -> d));
        for (OrgMemberRole row : live) {
            OrgRoleDefinition d = defs.get(row.getRoleId());
            if (d == null) continue;
            String template = d.getTemplateKey() != null ? d.getTemplateKey() : d.isSystem() ? d.getRoleKey() : null;
            if (template != null && templateKeys.contains(template)) return true;
        }
        return false;
    }

    private static OrgException rank() {
        return OrgException.coded(422, OrgRoleWriteService.CODE_ROLE_CEILING, "Your role may not do this to that person", Map.of("reason", "TARGET_RANK"));
    }
}
