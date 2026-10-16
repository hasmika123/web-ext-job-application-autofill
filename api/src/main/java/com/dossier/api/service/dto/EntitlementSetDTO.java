package com.dossier.api.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.io.Serializable;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * What a personal account may use, built from the plan version it bought plus its live add-ons (docs/subscriptions/09-apis.md section 3.4;
 * story K5.7). The SHAPE is final; the source is provisional until the plan resolver (K7.1) takes over the same builder. {@code used}, {@code remaining} and
 * {@code resetsAt} are null until the personal usage ledger (K7.5) exists; {@code aiPct} likewise. {@code state}: FREE, ACTIVE, PAST_DUE or CANCEL_PENDING.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record EntitlementSetDTO(
    String planKey,
    Integer planVersion,
    String interval,
    Instant periodStart,
    Instant periodEnd,
    List<FeatureEntry> features,
    List<String> capabilities,
    Map<String, Long> limits,
    Integer aiPct,
    String state
) implements Serializable {
    /** {@code source} is PLAN (included in the plan) or ADDON (bought on top); {@code quantity} is 1 for a plan feature. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record FeatureEntry(
        String featureKey,
        String name,
        String source,
        int quantity,
        Long allowance,
        Long used,
        Long remaining,
        Instant resetsAt,
        List<String> limits
    ) implements Serializable {}

    /** The answer of {@code GET /api/entitlements/check}: a UI hint, never a reservation. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Check(boolean allowed, String reasonCode, Map<String, Object> details, Map<String, Object> upgrade) implements Serializable {}
}
