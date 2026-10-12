package com.dossier.api.domain.enumeration;

/**
 * A member's role inside one organization (tenant-model.md section 4). A fixed enum, not custom roles.
 * {@link #COACH} is reserved and rejected by validation. The permission set of each role is added with the
 * access service (O1.2).
 */
public enum OrgRole {
    OWNER,
    ADMIN,
    /** Looks after a subset of members (their "support owner"). */
    STAFF,
    MEMBER,
    /** Consultancy marketer (Phase 22): prepares, never submits and never signs in as a consultant. */
    MARKETER,
    /** Billing and ops finance (Phase 23): records money, never moves it. */
    FINANCE,
    /** Reserved (tenant-model.md decision 10). */
    COACH;

    /** True for a value the product does not accept yet. */
    public boolean isReserved() {
        return this == COACH;
    }
}
