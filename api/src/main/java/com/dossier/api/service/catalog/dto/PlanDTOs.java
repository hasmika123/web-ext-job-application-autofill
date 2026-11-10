package com.dossier.api.service.catalog.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * The wire shapes of the plan builder API (docs/subscriptions/09-apis.md sections 1.3 and 1.4; stories K2.2 to K2.5). Records; money is {@code *Minor}
 * longs plus a currency; timestamps are ISO UTC. JSON-valued columns (eligibility, presets, seat rules, limit overrides) travel as JSON.
 */
public final class PlanDTOs {

    private PlanDTOs() {}

    /** One price a version sells (or would sell): {@code source} is ACTIVE (in force), DRAFT (publishing the version publishes it) or DERIVED (a yearly row publishing will create). */
    public record PriceView(Long priceId, String interval, String currency, long amountMinor, String source, boolean derived, String stripePriceId, Integer marginBp, Boolean ok) {}

    public record ProductView(Long id, String code, List<PriceView> prices) {}

    public record ComponentDTO(
        String featureKey,
        String role,
        String name,
        String category,
        String unit,
        Long productId,
        String productCode,
        Long allowance,
        Long allowanceOverride,
        String limitKey,
        JsonNode limitOverrides,
        int defaultQuantity,
        Integer maxQuantity,
        Integer componentDiscountBp,
        int sortOrder,
        String marketingLabel,
        int aiBudgetCents,
        List<PriceView> prices
    ) {}

    public record PlanVersionDTO(
        String planKey,
        int version,
        String status,
        String audience,
        List<String> intervals,
        Integer annualDiscountBp,
        int aiBudgetCapCents,
        Map<String, Long> aiWindows,
        ProductView baseProduct,
        List<ComponentDTO> components,
        JsonNode presets,
        JsonNode seatRules,
        String snapshotHash,
        Instant effectiveFrom,
        Instant effectiveUntil,
        Integer catalogVersion,
        String summary,
        Instant publishedAt,
        String publishedBy,
        Instant updatedAt
    ) {}

    public record PlanDTO(
        String planKey,
        String name,
        String audience,
        String status,
        boolean publicPlan,
        String description,
        String badge,
        int sortOrder,
        JsonNode eligibility,
        String successorPlanKey,
        Instant createdAt,
        Instant updatedAt,
        String updatedBy,
        List<PlanVersionDTO> versions
    ) {}

    public record LiveVersion(int version, Instant effectiveFrom) {}

    public record PlanSummaryDTO(
        String planKey,
        String name,
        String audience,
        String status,
        boolean publicPlan,
        LiveVersion liveVersion,
        Integer draftVersion,
        Map<String, Long> subscribersByVersion,
        Map<String, Long> pricesByInterval,
        Long marginWorstBp,
        String successorPlanKey
    ) {}

    // ---- requests -------------------------------------------------------------------------------------------------------

    /** POST /plans (HIGH). {@code reason} is required; the plan starts with version 1 in DRAFT. */
    public record CreatePlanRequest(
        String planKey,
        String name,
        String audience,
        String description,
        String badge,
        Boolean publicPlan,
        Integer sortOrder,
        JsonNode eligibility,
        String reason
    ) {}

    /** PUT /plans/{planKey} (HIGH): key and audience are immutable. {@code expectedUpdatedAt} (optional) makes a stale write a 409 VERSION_CONFLICT. */
    public record UpdatePlanRequest(
        String name,
        String description,
        String badge,
        Boolean publicPlan,
        Integer sortOrder,
        JsonNode eligibility,
        Instant expectedUpdatedAt,
        String reason
    ) {}

    /** POST /plans/{planKey}/versions (HIGH): a new DRAFT copied from {@code from} (default: the live version). */
    public record NewVersionRequest(Integer from, String reason) {}

    /** One row of PUT .../components (a full replacement). */
    public record ComponentRequest(
        String featureKey,
        String role,
        Long productId,
        Long allowanceOverride,
        JsonNode limitOverrides,
        Integer defaultQuantity,
        Integer maxQuantity,
        Integer componentDiscountBp,
        Integer sortOrder,
        String marketingLabel
    ) {}

    public record ComponentsRequest(List<ComponentRequest> components, Instant expectedUpdatedAt) {}

    /** POST .../publish (HIGH, typed confirmation = the version number). */
    public record PublishPlanRequest(Instant effectiveFrom, String overrideReason, Integer confirmVersion, String reason) {}

    /** POST .../discard. */
    public record DiscardRequest(String reason) {}

    // ---- compare, subscribers --------------------------------------------------------------------------------------------

    public record DiffRow(String path, Object a, Object b) {}

    public record CompareDTO(String planKey, int a, int b, List<DiffRow> diff, Map<String, Long> subscribers, Map<String, Long> marginByIntervalA, Map<String, Long> marginByIntervalB) {}

    public record SubscriberRow(String login, Instant since, String interval, List<String> addons, String state) {}

    public record SubscribersDTO(String planKey, Integer version, long total, Map<String, Long> byVersion, List<SubscriberRow> rows, int page, int size) {}
}
