package com.dossier.api.service.ent.authz;

import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.org.OrgMembership;
import java.util.List;

/**
 * One question for {@link AuthorizationService}: may the caller do {@code permissionKeys} in {@code orgId}, to
 * {@code beneficiaryMemberId} (05-permission-model.md section 5)?
 *
 * @param orgId              the organization named by the route (never read from a body); null is refused
 * @param permissionKeys     ALL must be held (a handler that needs two); empty = any ACTIVE member
 * @param beneficiary        how {@code beneficiaryMemberId} was derived; {@link Beneficiary#SELF} substitutes the actor
 * @param beneficiaryMemberId the member whose records or entitlement are touched, already resolved by the caller; null for NONE and SELF
 * @param operation          READ or WRITE (what a non-ACTIVE organization still allows; whether a wide scope may skip step 9)
 * @param stateAction        an explicit organization state action: a step-3 refusal is 409 ORG_STATE rather than 404
 * @param tenant             what the host resolved to (step 1); null = not a tenant-aware caller (a scheduler, a legacy request)
 * @param tokenTenantId      the {@code tid} claim of the caller's token when it has one (step 1); null = none
 * @param featureKey         the licensed feature the operation consumes (steps 7, 8, 11 run only when set; hooks arrive with X5.6)
 * @param quantity           how much of the feature (step 8)
 * @param actor              an already-resolved membership (a service caller with no security context, or a test); null = resolve the signed-in caller through {@code OrgAccessService}
 */
public record AuthzRequest(
    Long orgId,
    List<String> permissionKeys,
    Beneficiary beneficiary,
    Long beneficiaryMemberId,
    AuthzOperation operation,
    boolean stateAction,
    TenantContext tenant,
    Long tokenTenantId,
    String featureKey,
    int quantity,
    OrgMembership actor
) {
    public AuthzRequest {
        permissionKeys = permissionKeys == null ? List.of() : List.copyOf(permissionKeys);
        if (beneficiary == null) beneficiary = Beneficiary.NONE;
        if (operation == null) operation = AuthzOperation.WRITE; // the stricter reading when a caller forgets
    }

    /** The common case: signed-in caller, these permissions, this beneficiary. */
    public static AuthzRequest of(Long orgId, List<String> permissionKeys, Beneficiary beneficiary, Long beneficiaryMemberId, AuthzOperation operation) {
        return new AuthzRequest(orgId, permissionKeys, beneficiary, beneficiaryMemberId, operation, false, null, null, null, 0, null);
    }

    public AuthzRequest withTenant(TenantContext tenant) {
        return new AuthzRequest(orgId, permissionKeys, beneficiary, beneficiaryMemberId, operation, stateAction, tenant, tokenTenantId, featureKey, quantity, actor);
    }

    public AuthzRequest withTokenTenant(Long tokenTenantId) {
        return new AuthzRequest(orgId, permissionKeys, beneficiary, beneficiaryMemberId, operation, stateAction, tenant, tokenTenantId, featureKey, quantity, actor);
    }

    public AuthzRequest withStateAction(boolean stateAction) {
        return new AuthzRequest(orgId, permissionKeys, beneficiary, beneficiaryMemberId, operation, stateAction, tenant, tokenTenantId, featureKey, quantity, actor);
    }

    public AuthzRequest withFeature(String featureKey, int quantity) {
        return new AuthzRequest(orgId, permissionKeys, beneficiary, beneficiaryMemberId, operation, stateAction, tenant, tokenTenantId, featureKey, quantity, actor);
    }

    public AuthzRequest withActor(OrgMembership actor) {
        return new AuthzRequest(orgId, permissionKeys, beneficiary, beneficiaryMemberId, operation, stateAction, tenant, tokenTenantId, featureKey, quantity, actor);
    }
}
