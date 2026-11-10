package com.dossier.api.domain.enumeration;

/**
 * The qualifier on a granted permission in the matrix of tenant-model.md section 4 (the parenthesised words
 * and the footnote). Holding a permission {@link #ALL} means no narrowing; every other value is a limit the
 * service that uses the permission must apply to the rows it touches. Narrowing is never skipped by checking
 * only {@code can(permission)}: call {@code OrgMembership#scopeOf}.
 */
public enum OrgScope {
    /** No narrowing. */
    ALL,
    /** STAFF may invite and import, but only people who will be MEMBERs. */
    MEMBER_ROLE_ONLY,
    /** ADMIN may set roles, but never to or from OWNER or ADMIN. */
    BELOW_ADMIN_ROLES,
    /** STAFF: only the members whose {@code support_owner_member_id} is theirs. */
    OWN_MEMBERS,
    /** MARKETER: only the consultants they are assigned to. */
    OWN_CONSULTANTS,
    /** MARKETER: only the consultant they are paired with, and only while that consultant's scope is FULL. */
    PAIRED,
    /** FINANCE: only the billing and ops rows of the audit trail. */
    BILLING_AND_OPS_ROWS,
    /** MEMBER: their own hours, nobody else's. */
    OWN_HOURS,
    /** An action on one's own membership. */
    SELF,
    /** As {@link #SELF}, but an OWNER must transfer ownership first. */
    SELF_AFTER_TRANSFER,
}
