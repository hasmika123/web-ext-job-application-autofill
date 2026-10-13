package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgScope;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The resolved caller of an org endpoint: their seat in one organization and what their roles allow. Produced only
 * by {@link OrgAccessService}; an endpoint that holds one has already been through the 404 gate.
 *
 * <p>Since Enterprise V2 (X1.6) a member can hold several roles stored as data. {@code grants} is the union of their
 * permissions as {@code key -> scope}, the widest scope winning when two roles grant the same key; {@code roles} says which
 * roles they are (the primary first). {@code role} stays the legacy enum mirror of the primary role, for the callers that still
 * read it. When the roles are NOT read from data (the roles flag is off, or the member has no role rows yet) both are derived
 * from the enum with {@link PermissionScope#fromLegacy}, so {@link #can} answers exactly what it always did.
 *
 * @param orgId     the organization the check was made against
 * @param memberId  the caller's {@code org_member} row
 * @param userId    the caller's account id
 * @param login     the caller's login (the audit trail is keyed by it)
 * @param role      the legacy enum role in this org (mirrors the primary role)
 * @param status    the seat state; only ACTIVE seats are ever resolved
 * @param orgStatus the organization's lifecycle state (a CLOSED org is read-only)
 * @param roles     the roles held, primary first (one derived entry when read from the enum)
 * @param grants    permission key to the widest scope any role grants it
 */
public record OrgMembership(
    Long orgId,
    Long memberId,
    Long userId,
    String login,
    OrgRole role,
    OrgMemberStatus status,
    OrgStatus orgStatus,
    List<RoleRef> roles,
    Map<String, PermissionScope> grants
) {
    /** One role of the seat. {@code roleId} is null for the entry derived from the enum. */
    public record RoleRef(Long roleId, String key, String name, boolean primary) {}

    public OrgMembership {
        roles = List.copyOf(roles);
        grants = Collections.unmodifiableMap(new LinkedHashMap<>(grants));
    }

    /** The legacy form: roles and grants derived from the enum role alone (what every caller before X1.6 built). */
    public OrgMembership(Long orgId, Long memberId, Long userId, String login, OrgRole role, OrgMemberStatus status, OrgStatus orgStatus) {
        this(orgId, memberId, userId, login, role, status, orgStatus, legacyRoles(role), legacyGrants(role));
    }

    public boolean can(OrgPermission permission) {
        return permission != null && grants.containsKey(permission.key());
    }

    /** True when the seat holds the permission with this wire key (new keys have no enum constant). */
    public boolean canKey(String permissionKey) {
        return permissionKey != null && grants.containsKey(permissionKey);
    }

    /** The scope the seat holds {@code permissionKey} at (the widest across its roles); empty when it does not hold it. */
    public Optional<PermissionScope> scopeFor(String permissionKey) {
        return Optional.ofNullable(permissionKey == null ? null : grants.get(permissionKey));
    }

    /**
     * The narrowing the service must apply when it uses {@code permission}; empty when the seat does not hold it. For a
     * permission the legacy role holds this is exactly the legacy value (including MEMBER_ROLE_ONLY and BELOW_ADMIN_ROLES, which
     * {@link PermissionScope} cannot express); for one that only another role grants it is the closest legacy value that is
     * never wider than the granted scope.
     */
    public Optional<OrgScope> scopeOf(OrgPermission permission) {
        PermissionScope granted = permission == null ? null : grants.get(permission.key());
        if (granted == null) return Optional.empty();
        Optional<OrgScope> legacy = role.scopeOf(permission);
        if (legacy.isPresent()) return legacy;
        return Optional.of(switch (granted) {
            case ORG -> OrgScope.ALL;
            case DEPARTMENT, TEAM -> OrgScope.OWN_MEMBERS;
            case ASSIGNED -> OrgScope.OWN_CONSULTANTS;
            case OWN -> OrgScope.SELF;
        });
    }

    /** Wire form of every permission the seat holds (the web gates its UI on this list): the union across its roles. */
    public List<String> permissionKeys() {
        return List.copyOf(grants.keySet());
    }

    /** The key of the primary role, or empty when none is recorded. */
    public Optional<String> primaryRoleKey() {
        return roles.stream().filter(RoleRef::primary).map(RoleRef::key).findFirst();
    }

    private static List<RoleRef> legacyRoles(OrgRole role) {
        return List.of(new RoleRef(null, role.name(), role.name(), true));
    }

    private static Map<String, PermissionScope> legacyGrants(OrgRole role) {
        Map<String, PermissionScope> out = new LinkedHashMap<>();
        for (Map.Entry<OrgPermission, OrgScope> e : role.grants().entrySet()) {
            out.put(e.getKey().key(), PermissionScope.fromLegacy(e.getValue()));
        }
        return out;
    }
}
