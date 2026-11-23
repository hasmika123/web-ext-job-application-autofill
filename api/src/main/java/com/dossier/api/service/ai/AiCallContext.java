package com.dossier.api.service.ai;

import java.util.Objects;

/**
 * Attribution carried by one organization AI call (enterprise-v2 24 section 7).
 *
 * <p>The actor is who initiated the work; the beneficiary is whose licensed data and allowance
 * paid for it. Keeping both values together prevents an enterprise caller from accidentally
 * falling back to the signed-in personal identity when the call is metered.</p>
 */
public record AiCallContext(
    String actorLogin,
    String beneficiaryLogin,
    Long orgId,
    String featureKey,
    Long usageEventId
) {
    public AiCallContext {
        if (orgId != null && orgId <= 0) throw new IllegalArgumentException("orgId must be positive");
        if (usageEventId != null && usageEventId <= 0) throw new IllegalArgumentException("usageEventId must be positive");
        if (orgId == null && (beneficiaryLogin != null || featureKey != null || usageEventId != null)) {
            throw new IllegalArgumentException("personal AI context cannot carry organization attribution");
        }
    }

    /** Context used by the existing personal callers. */
    public static AiCallContext personal(String login) {
        return new AiCallContext(login, null, null, null, null);
    }

    /** Context used by an organization call after entitlement reserved usage. */
    public static AiCallContext organization(
        String actorLogin,
        String beneficiaryLogin,
        Long orgId,
        String featureKey,
        Long usageEventId
    ) {
        return new AiCallContext(
            Objects.requireNonNull(actorLogin, "actorLogin"),
            Objects.requireNonNull(beneficiaryLogin, "beneficiaryLogin"),
            Objects.requireNonNull(orgId, "orgId"),
            Objects.requireNonNull(featureKey, "featureKey"),
            Objects.requireNonNull(usageEventId, "usageEventId")
        );
    }

    public boolean organizationCall() {
        return orgId != null;
    }
}
