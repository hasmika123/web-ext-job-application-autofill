package com.dossier.api.domain.enumeration;

import java.util.Optional;

/**
 * Whose records a permission reaches (docs/enterprise-v2/05-permission-model.md section 4). The constants are
 * <b>ordered</b> from narrowest to widest ({@code OWN < ASSIGNED < TEAM < DEPARTMENT < ORG}), so a member who holds a
 * permission through several roles has the widest one ({@link #widest}). The scope says which rows; consent says which
 * fields of those rows. It lives in {@code domain.enumeration} (not {@code service.ent}) because the persisted role rows
 * reference it and the domain layer may not depend on services.
 */
public enum PermissionScope {
    /** The actor's own records. */
    OWN,
    /** Consultants with an open assignment to the actor. */
    ASSIGNED,
    /** Members of the actor's team(s), including assignments held by those members. */
    TEAM,
    /** Members of the actor's department(s) and their teams. */
    DEPARTMENT,
    /** Everyone in the organization (never beyond the tenant). */
    ORG;

    /** True when this scope reaches at least as far as {@code other}. */
    public boolean covers(PermissionScope other) {
        return other != null && compareTo(other) >= 0;
    }

    /** The wider of two scopes; a null argument is ignored. */
    public static PermissionScope widest(PermissionScope a, PermissionScope b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.compareTo(b) >= 0 ? a : b;
    }

    /**
     * The mapping of the legacy {@link OrgScope} (05 section 4): ALL, MEMBER_ROLE_ONLY, BELOW_ADMIN_ROLES and
     * BILLING_AND_OPS_ROWS become ORG (the last three keep a narrowing attribute on the role row, see
     * {@code RoleTemplates}); OWN_MEMBERS, OWN_CONSULTANTS and PAIRED become ASSIGNED; SELF, SELF_AFTER_TRANSFER and
     * OWN_HOURS become OWN.
     */
    public static PermissionScope fromLegacy(OrgScope legacy) {
        return switch (legacy) {
            case ALL, MEMBER_ROLE_ONLY, BELOW_ADMIN_ROLES, BILLING_AND_OPS_ROWS -> ORG;
            case OWN_MEMBERS, OWN_CONSULTANTS, PAIRED -> ASSIGNED;
            case SELF, SELF_AFTER_TRANSFER, OWN_HOURS -> OWN;
        };
    }

    /** The scope for a stored value; empty for anything unknown (a bad row never widens: callers drop it). */
    public static Optional<PermissionScope> ofName(String name) {
        if (name == null) return Optional.empty();
        for (PermissionScope s : values()) if (s.name().equals(name)) return Optional.of(s);
        return Optional.empty();
    }
}
