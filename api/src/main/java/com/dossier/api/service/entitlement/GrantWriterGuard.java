package com.dossier.api.service.entitlement;

import com.dossier.api.domain.billing.EntitlementGrant;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * The only door through which an {@code entitlement_grant} row may be built (docs/subscriptions/06-entitlements-and-enforcement.md section 7, story
 * K7.1). Grants are narrowed to ADMIN_COMP, REFERRAL and SERVICE_ORDER. A Stripe subscription or an organization assignment is never a grant: the
 * subscription row (with its plan version and add-ons) and the licenses are the truth, so a grant source of {@code STRIPE_SUBSCRIPTION} or
 * {@code ORG_ASSIGNMENT} is refused (this supersedes the grant-based design of B1.2/B1.3).
 */
@Component
public class GrantWriterGuard {

    static final Set<String> ALLOWED = Set.of(EntitlementGrant.ADMIN_COMP, EntitlementGrant.REFERRAL, EntitlementGrant.SERVICE_ORDER);

    /** Refuses with 422 unless {@code source} is one of the three allowed ones. */
    public void requireAllowedSource(String source) {
        if (source == null || !ALLOWED.contains(source)) {
            throw new ResponseStatusException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "GRANT_SOURCE_REFUSED: a grant is a comp, referral or service order; subscriptions and licenses are never grants"
            );
        }
    }

    /** Validates then builds a grant of plan version {@code planVersionId} for a personal account. */
    public EntitlementGrant build(Long userId, Long planVersionId, String source, java.time.Instant startsAt, java.time.Instant endsAt, String grantedBy, String reason) {
        requireAllowedSource(source);
        if (userId == null || planVersionId == null || startsAt == null) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "A grant needs a user, a plan version and a start");
        }
        if (endsAt != null && !endsAt.isAfter(startsAt)) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "A grant must end after it starts");
        }
        EntitlementGrant g = new EntitlementGrant();
        g.setUserId(userId);
        g.setPlanVersionId(planVersionId);
        g.setSource(source);
        g.setStartsAt(startsAt);
        g.setEndsAt(endsAt);
        g.setGrantedBy(grantedBy);
        g.setReason(reason);
        return g;
    }
}
