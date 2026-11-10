package com.dossier.api.service.ent.authz;

/**
 * Why {@link AuthorizationService} refused, one code per failure of the evaluation order in
 * docs/enterprise-v2/05-permission-model.md section 2 (the table there and this enum are diffed by
 * {@code AuthorizationOrderDocSyncTest}). {@link #step()} is the step that produces it and {@link #httpStatus()} what
 * {@link ReasonToHttp} answers. Everything on an org route is a 404 on purpose: an outsider cannot tell "does not exist" from
 * "not yours". 402 is only ever produced after membership and permission passed, so it leaks nothing about other tenants; 403
 * {@code CONSENT_REQUIRED} is the single non-404 refusal because the consultant must be able to see the request.
 */
public enum AuthzReason {
    /** The host was given and no tenant answers it. */
    TENANT_UNKNOWN(1, 404),
    /** The tenant host, the token's tenant or the path organization differ. */
    TENANT_MISMATCH(1, 404),
    /** No ACTIVE seat of the caller in this organization. */
    NOT_MEMBER(2, 404),
    /** The organization's state does not allow this operation (404 on org routes). */
    ORG_INACTIVE(3, 404),
    /** The same step on an explicit state action (close, reinstate): the caller may know the organization exists, so say what is wrong. */
    ORG_STATE(3, 409),
    /** The effective permission set lacks the key. */
    PERMISSION_DENIED(4, 404),
    /** The target record is outside the actor's scope for that permission. */
    OUT_OF_SCOPE(5, 404),
    /** The module behind the operation is off for this organization. */
    MODULE_OFF(6, 404),
    /** The beneficiary's licence does not carry the feature. */
    FEATURE_NOT_LICENSED(7, 402),
    /** The beneficiary's allowance for the feature is used up. */
    FEATURE_ALLOWANCE_EXHAUSTED(8, 402),
    /** The actor has no effective assignment to the beneficiary (also what an ASSIGNED-scope miss reports). */
    NOT_ASSIGNED(9, 404),
    /** The beneficiary has not consented to this actor / feature. */
    CONSENT_REQUIRED(10, 403),
    /** A pending suspension or cancellation of the licence or the organization's billing. */
    SUBSCRIPTION_STATE(11, 402);

    private final int step;
    private final int httpStatus;

    AuthzReason(int step, int httpStatus) {
        this.step = step;
        this.httpStatus = httpStatus;
    }

    /** The step (1-11) of the evaluation order that produces this refusal. */
    public int step() {
        return step;
    }

    public int httpStatus() {
        return httpStatus;
    }
}
