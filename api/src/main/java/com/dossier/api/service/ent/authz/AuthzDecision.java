package com.dossier.api.service.ent.authz;

import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.service.org.OrgMembership;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The answer of {@link AuthorizationService}: allowed, or the first refusal ({@link #reason()}). An allowed decision records
 * who acted for whom with which permission and scope, so audit and usage commit (X5.7) read it instead of re-deriving it; it is
 * attached to the request as {@link #ATTRIBUTE} next to the legacy membership attribute. A refusal carries no membership: nothing
 * about the caller is exposed once a step failed.
 *
 * @param orgId              the organization the question named
 * @param reason             null when allowed
 * @param membership         the resolved caller (allowed decisions only)
 * @param beneficiaryMemberId the member the operation touched (null for NONE; the actor's own id for SELF)
 * @param permissionKeys     what was asked
 * @param scopes             permission key to the scope the caller holds it at (the widest across their roles); the service filters rows with it when there is no beneficiary
 * @param details            extra facts for the response of a non-404 refusal (CONSENT_REQUIRED names the beneficiary and the consent kind)
 */
public record AuthzDecision(
    Long orgId,
    AuthzReason reason,
    OrgMembership membership,
    Long beneficiaryMemberId,
    List<String> permissionKeys,
    Map<String, PermissionScope> scopes,
    Map<String, Object> details
) {
    /** Request attribute under which the interceptor stores the decision. */
    public static final String ATTRIBUTE = "com.dossier.api.authz.decision";

    public AuthzDecision {
        permissionKeys = permissionKeys == null ? List.of() : List.copyOf(permissionKeys);
        scopes = scopes == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(scopes));
        details = details == null ? Map.of() : Map.copyOf(details);
    }

    public boolean allowed() {
        return reason == null;
    }

    public Long actorMemberId() {
        return membership == null ? null : membership.memberId();
    }

    public static AuthzDecision allow(Long orgId, OrgMembership membership, Long beneficiaryMemberId, List<String> keys, Map<String, PermissionScope> scopes) {
        return new AuthzDecision(orgId, null, membership, beneficiaryMemberId, keys, scopes, Map.of());
    }

    public static AuthzDecision deny(Long orgId, AuthzReason reason, List<String> keys) {
        return new AuthzDecision(orgId, reason, null, null, keys, Map.of(), Map.of());
    }

    public static AuthzDecision deny(Long orgId, AuthzReason reason, List<String> keys, Map<String, Object> details) {
        return new AuthzDecision(orgId, reason, null, null, keys, Map.of(), details);
    }
}
