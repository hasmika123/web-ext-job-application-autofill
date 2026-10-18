package com.dossier.api.service.ent.authz;

import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The ONE place a refusal of {@link AuthorizationService} becomes an HTTP answer (05-permission-model.md section 2): every 404
 * reason is the same generic {@link OrgNotFoundException} (no code, message or timing says which step refused), and the few
 * reasons that are allowed to say something carry their own status and code: 402 for entitlement and subscription failures, 403
 * for a missing consent (the consultant must be able to see the request), 409 for an explicit state action.
 */
public final class ReasonToHttp {

    private ReasonToHttp() {}

    /** The exception for a denied decision; {@code IllegalArgumentException} for an allowed one (a programming error, not a refusal). */
    public static RuntimeException toException(AuthzDecision decision) {
        if (decision == null || decision.allowed()) throw new IllegalArgumentException("only a refusal has an HTTP form");
        return toException(decision.reason(), decision.details());
    }

    public static RuntimeException toException(AuthzReason reason, Map<String, Object> details) {
        if (reason.httpStatus() == 404) return new OrgNotFoundException();
        Map<String, Object> extra = new LinkedHashMap<>(details == null ? Map.of() : details);
        return new OrgException(reason.httpStatus(), reason.name(), message(reason), extra);
    }

    /** The status for a reason (the table of section 2 and this enum are diffed by a test). */
    public static int status(AuthzReason reason) {
        return reason.httpStatus();
    }

    private static String message(AuthzReason reason) {
        return switch (reason) {
            case ORG_STATE -> "The organization is not in a state that allows this";
            case FEATURE_NOT_LICENSED -> "This feature is not part of the licence";
            case FEATURE_ALLOWANCE_EXHAUSTED -> "The allowance for this feature is used up";
            case CONSENT_REQUIRED -> "The person has not shared this with you yet";
            case SUBSCRIPTION_STATE -> "The subscription does not allow this right now";
            default -> "Not found";
        };
    }
}
