package com.dossier.api.service.org;

import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.RoleTemplates;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The ceiling rule for invitations (05-permission-model.md section 3, 42-threat-model.md T32): an inviter can only put someone into a
 * role that gives no more than the inviter holds. Asked twice, with the SAME code: when the invitation is made (against the caller),
 * and again when it is accepted (against the inviter's rights AS THEY ARE THEN, so a person whose own rights shrank in between cannot
 * have granted what they no longer could).
 *
 * <p>A role is grantable by an inviter when ALL of these hold:
 * <ol>
 *   <li>the inviter is an ACTIVE seat that still holds {@code members.invite};</li>
 *   <li>it is not OWNER (an owner is never invited: transfer ownership) and not reserved;</li>
 *   <li>the inviter's {@code members.invite} ceiling allows the role's legacy mirror: {@code MEMBER} (staff) only MEMBER, {@code BELOW_ADMIN}
 *       nothing admin-like, none = anything but OWNER;</li>
 *   <li>an admin-like role (ORG_ADMIN or a clone) is granted by an OWNER only (the legacy "only an owner can invite another admin");</li>
 *   <li>every permission of the role with a scope wider than OWN is held by the inviter at the same or a wider scope. Permissions at
 *       OWN scope are about the invitee themself (their own resumes, their own hours), so they raise nothing and are not compared:
 *       an HR specialist may invite a consultant but not a marketing specialist.</li>
 * </ol>
 *
 * <p>The inviter's rights come from their role rows when they have valid ones, else from the legacy enum, and are read without regard
 * to the roles feature flag: what someone may GRANT is what their actual roles hold. Read-only: this class never writes a role.
 */
@Service
public class InviteCeilingChecker {

    static final String INVITE_KEY = "members.invite";
    static final String ROLE_SET_KEY = "members.role.set";

    private final OrgMemberRepository members;
    private final OrgMemberRoleRepository memberRoles;
    private final OrgRoleRepository roles;
    private final OrgRolePermissionRepository permissions;

    public InviteCeilingChecker(OrgMemberRepository members, OrgMemberRoleRepository memberRoles, OrgRoleRepository roles, OrgRolePermissionRepository permissions) {
        this.members = members;
        this.memberRoles = memberRoles;
        this.roles = roles;
        this.permissions = permissions;
    }

    /** What an inviter may grant. {@code mayInvite} false (gone, suspended, lost members.invite) grants nothing at all. */
    public record Rights(boolean mayInvite, Map<String, PermissionScope> grants, String inviteCeiling, boolean owner, boolean holdsRoleSet, String roleSetCeiling) {
        public static final Rights NONE = new Rights(false, Map.of(), "MEMBER", false, false, "MEMBER");
    }

    /** A role as the invitation sees it: the definition, its template and the legacy enum it mirrors, and its permission rows. */
    public record RoleView(OrgRoleDefinition def, String templateKey, OrgRole mirror, List<OrgRolePermission> permissions) {
        public Long id() {
            return def.getId();
        }

        public String key() {
            return def.getRoleKey();
        }

        public boolean adminLike() {
            return mirror == OrgRole.ADMIN || mirror == OrgRole.OWNER;
        }
    }

    // ---- the inviter -----------------------------------------------------------------------------------------------------

    /** The CURRENT rights of an inviter seat; {@link Rights#NONE} when the seat is missing, not ACTIVE, or no longer holds members.invite. */
    @Transactional(readOnly = true)
    public Rights rightsOf(Long orgId, Long memberId) {
        if (orgId == null || memberId == null) return Rights.NONE;
        OrgMember seat = members.findByOrgIdAndId(orgId, memberId).orElse(null);
        if (seat == null || seat.getStatus() != OrgMemberStatus.ACTIVE || seat.getRole() == null || seat.getRole().isReserved()) return Rights.NONE;

        Map<String, PermissionScope> grants = new LinkedHashMap<>();
        List<String> ceilings = new ArrayList<>();
        List<String> roleSetCeilings = new ArrayList<>();
        boolean owner = false;
        List<OrgMemberRole> live = memberRoles.findLiveByOrgIdAndMemberId(orgId, memberId);
        if (!live.isEmpty()) {
            List<Long> ids = live.stream().map(OrgMemberRole::getRoleId).toList();
            List<OrgRoleDefinition> defs = roles.findVisibleByOrgIdAndIdIn(orgId, ids);
            if (defs.size() == ids.stream().distinct().count()) { // a row pointing outside the organization is untrusted: fall back to the enum
                for (OrgRolePermission p : permissions.findForRoles(orgId, ids)) {
                    if (p.getScope() == null || p.getPermissionKey() == null) continue;
                    grants.merge(p.getPermissionKey(), p.getScope(), PermissionScope::widest);
                    if (INVITE_KEY.equals(p.getPermissionKey())) ceilings.add(p.getCeilingRoleKey());
                    if (ROLE_SET_KEY.equals(p.getPermissionKey()) && p.getScope() == PermissionScope.ORG) roleSetCeilings.add(p.getCeilingRoleKey());
                }
                owner = defs.stream().anyMatch(d -> RoleTemplates.OWNER.equals(templateOf(d)));
            }
        }
        if (grants.isEmpty()) {
            seat.getRole().grants().forEach((perm, scope) -> grants.put(perm.key(), PermissionScope.fromLegacy(scope)));
            ceilings.clear();
            roleSetCeilings.clear();
            seat.getRole().scopeOf(com.dossier.api.domain.enumeration.OrgPermission.MEMBERS_ROLE_SET).ifPresent(s -> roleSetCeilings.add(s == com.dossier.api.domain.enumeration.OrgScope.BELOW_ADMIN_ROLES ? "BELOW_ADMIN" : null));
            seat.getRole().scopeOf(com.dossier.api.domain.enumeration.OrgPermission.MEMBERS_INVITE).ifPresent(s -> ceilings.add(s == com.dossier.api.domain.enumeration.OrgScope.MEMBER_ROLE_ONLY ? "MEMBER" : null));
            owner = seat.getRole() == OrgRole.OWNER;
        }
        if (!grants.containsKey(INVITE_KEY)) return Rights.NONE;
        return new Rights(true, grants, widestCeiling(ceilings), owner, !roleSetCeilings.isEmpty(), widestCeiling(roleSetCeilings));
    }

    /** No ceiling on any role that holds the permission wins; else the wider of BELOW_ADMIN and MEMBER. */
    static String widestCeiling(List<String> ceilings) {
        if (ceilings.isEmpty() || ceilings.stream().anyMatch(c -> c == null)) return null;
        return ceilings.contains(com.dossier.api.domain.ent.OrgRolePermission.CEILING_BELOW_ADMIN) ? com.dossier.api.domain.ent.OrgRolePermission.CEILING_BELOW_ADMIN : com.dossier.api.domain.ent.OrgRolePermission.CEILING_MEMBER;
    }

    // ---- the roles -------------------------------------------------------------------------------------------------------

    /** The roles with these ids that this organization may use (a system template or its own), in the order given; empty when any id is foreign or unknown. */
    @Transactional(readOnly = true)
    public Optional<List<RoleView>> resolve(Long orgId, List<Long> ids) {
        if (ids == null || ids.isEmpty()) return Optional.of(List.of());
        Map<Long, OrgRoleDefinition> byId = new LinkedHashMap<>();
        for (OrgRoleDefinition d : roles.findVisibleByOrgIdAndIdIn(orgId, ids)) byId.put(d.getId(), d);
        if (byId.size() != ids.stream().distinct().count()) return Optional.empty();
        Map<Long, List<OrgRolePermission>> perms = new LinkedHashMap<>();
        for (OrgRolePermission p : permissions.findForRoles(orgId, ids)) perms.computeIfAbsent(p.getRoleId(), k -> new ArrayList<>()).add(p);
        List<RoleView> out = new ArrayList<>();
        for (Long id : ids) {
            OrgRoleDefinition d = byId.get(id);
            out.add(new RoleView(d, templateOf(d), LegacyRoleMirror.toEnum(templateOf(d)).orElse(OrgRole.MEMBER), perms.getOrDefault(id, List.of())));
        }
        return Optional.of(out);
    }

    /** The system template with this key (ORG_ADMIN, MEMBER, CONSULTANT...). */
    @Transactional(readOnly = true)
    public Optional<RoleView> systemTemplate(Long orgId, String templateKey) {
        return roles.findSystemByRoleKey(templateKey).flatMap(d -> resolve(orgId, List.of(d.getId())).flatMap(l -> l.stream().findFirst()));
    }

    static String templateOf(OrgRoleDefinition d) {
        return d.getTemplateKey() != null ? d.getTemplateKey() : d.getRoleKey();
    }

    // ---- the rule --------------------------------------------------------------------------------------------------------

    /** True when {@code rights} may grant {@code role}. */
    public boolean grantable(Rights rights, RoleView role) {
        if (!headOk(rights, role.templateKey(), role.mirror())) return false;
        if (rights.holdsRoleSet()) return roleSetAllows(rights, role.mirror()); // see the class comment: the role-setting authority is bounded by its ceiling
        for (OrgRolePermission p : role.permissions()) {
            if (p.getScope() == null || p.getScope() == PermissionScope.OWN) continue;
            PermissionScope held = rights.grants().get(p.getPermissionKey());
            if (held == null || !held.covers(p.getScope())) return false;
        }
        return true;
    }

    /**
     * The same rule for a seat whose role is only the legacy enum (the system templates are not present, so there are no permission
     * rows to compare): the inviter's ceilings and the owner-only-for-admins rule decide, which is the pre-Enterprise-V2 behaviour.
     */
    public boolean grantableMirror(Rights rights, OrgRole mirror) {
        if (!headOk(rights, null, mirror)) return false;
        return !rights.holdsRoleSet() || roleSetAllows(rights, mirror);
    }

    private static boolean headOk(Rights rights, String templateKey, OrgRole mirror) {
        if (rights == null || !rights.mayInvite()) return false;
        if (RoleTemplates.OWNER.equals(templateKey) || mirror == OrgRole.OWNER || mirror.isReserved()) return false;
        boolean adminLike = mirror == OrgRole.ADMIN;
        if (OrgRolePermission.CEILING_MEMBER.equals(rights.inviteCeiling()) && mirror != OrgRole.MEMBER) return false;
        if (OrgRolePermission.CEILING_BELOW_ADMIN.equals(rights.inviteCeiling()) && adminLike) return false;
        return !adminLike || rights.owner();
    }

    private static boolean roleSetAllows(Rights rights, OrgRole mirror) {
        if (OrgRolePermission.CEILING_MEMBER.equals(rights.roleSetCeiling()) && mirror != OrgRole.MEMBER) return false;
        return !(OrgRolePermission.CEILING_BELOW_ADMIN.equals(rights.roleSetCeiling()) && mirror == OrgRole.ADMIN);
    }

    /** The ids of the roles {@code rights} may NOT grant, in order (empty = all grantable). */
    public List<Long> refused(Rights rights, Collection<RoleView> wanted) {
        List<Long> out = new ArrayList<>();
        for (RoleView r : wanted) if (!grantable(rights, r)) out.add(r.id());
        return out;
    }
}

