package com.dossier.api.service.ent.authz;

import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.service.org.OrgMembership;
import java.util.Map;
import java.util.Optional;

/**
 * A hook for one of the steps {@link AuthorizationService} does not implement itself: 6 (module availability), 7 (beneficiary
 * feature entitlement), 8 (allowance), 10 (consent / delegated authority) and 11 (subscription state). X5.6 and X7.6 register
 * beans of this type; the service runs them in step order at the right place of the evaluation order (6-8 before the assignment
 * check of step 9, 10-11 after it) and applies the skip rules of 05 section 2 (7, 8 and 11 only when the request names a
 * feature; 10 only when the actor is not the beneficiary). The first refusal stops the evaluation. With no bean registered the
 * steps are simply absent, which is the state of the platform until those stories ship.
 */
public interface AuthzStep {
    /** Which step this hook implements: 6, 7, 8, 10 or 11 (anything else fails the application start). */
    int step();

    /** Empty = this step passes. */
    Optional<AuthzReason> check(Context context);

    /**
     * What a hook may look at: the request, the resolved caller, the scope they hold each permission at and the beneficiary
     * (the actor's own id for SELF).
     */
    record Context(AuthzRequest request, OrgMembership actor, Map<String, PermissionScope> scopes, Long beneficiaryMemberId) {}
}
