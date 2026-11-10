package com.dossier.api.service.ent.authz;

/**
 * Whose data or entitlement an operation touches, besides the actor's (docs/enterprise-v2/05-permission-model.md sections 5-6).
 * ONE enum shared by {@code @OrgPermissionRequired} (X1.7) and {@code @RequiresFeature} (X5.16): there is no {@code @ActFor}.
 * The interceptor resolves it once and both checks see the same member id.
 */
public enum Beneficiary {
    /** No beneficiary: an organization-level record. Steps 5 and 9 have nothing to compare; the decision carries the effective scope for the service to filter rows by. */
    NONE,
    /** The actor is the beneficiary (a consultant working on their own records). Steps 9 and 10 are skipped. */
    SELF,
    /** The path variable {@code {memberId}} (or the one named by {@code scopeTarget}). */
    PATH_MEMBER,
    /** The body field {@code beneficiaryMemberId}. The interceptor cannot read a body before the handler: it needs the id from a request attribute set by a body-caching component and refuses (404) without it. */
    BODY_MEMBER,
    /** The query parameter {@code ?for=} or {@code ?memberId=}; absent means the actor themself. */
    QUERY_MEMBER,
}
