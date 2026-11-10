package com.dossier.api.service.retirement.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * The admin retirement API's request and response shapes (docs/subscriptions/11-plan-retirement.md; epic K10; the contract section at the top of that document is
 * the reference the web wizard builds against). Money is {@code *Minor} longs; timestamps are ISO UTC; absent values are omitted.
 */
public final class RetirementDTOs {

    private RetirementDTOs() {}

    // ---- requests -------------------------------------------------------------------------------------------------------------

    /** A ranked replacement: a plan key (for a plan retirement) or a feature key (for an add-on retirement). {@code rank} defaults to the list position (1-based). */
    public record SuccessorRequest(String planKey, String featureKey, Integer rank, String note) {}

    /**
     * Create a DRAFT retirement. {@code kind} PLAN or ADDON (PRICE answers 422 KIND_NOT_SUPPORTED). PLAN names {@code planKey} and optionally {@code version}
     * (a SUPERSEDED version); ADDON names {@code featureKey}. Everything else defaults from the settings registry: {@code mode} RETIRE_AT_RENEWAL,
     * {@code defaultOutcome} FREE, the notice schedule, the minimum notice (hard minimum 30) and the channels.
     */
    public record CreateRequest(
        String kind,
        String planKey,
        Integer version,
        String featureKey,
        String mode,
        String defaultOutcome,
        List<Integer> noticeScheduleDays,
        Integer minNoticeDays,
        List<String> channels,
        String messageMd,
        String reason,
        List<SuccessorRequest> successors
    ) {}

    /** Edit a DRAFT: only the fields that are present change. */
    public record UpdateRequest(
        String mode,
        String defaultOutcome,
        List<Integer> noticeScheduleDays,
        Integer minNoticeDays,
        List<String> channels,
        String messageMd,
        String reason
    ) {}

    public record SuccessorsRequest(List<SuccessorRequest> successors, String reason) {}

    /** {@code reason} at least 20 characters; {@code confirmKey} is the typed plan key (or feature key). */
    public record StartRequest(String reason, String confirmKey) {}

    public record CancelRequest(String reason, String confirmKey) {}

    public record CompleteRequest(String reason) {}

    // ---- responses ------------------------------------------------------------------------------------------------------------

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record SuccessorDTO(String planKey, String planName, String featureKey, int rank, String note) {}

    /** What a retirement touches, computed at start (and previewed for a DRAFT). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ImpactDTO(
        int subscribers,
        Map<String, Integer> byInterval,
        Map<String, Integer> byStatus,
        long mrrMinor,
        Instant earliestEffectiveAt,
        Instant latestEffectiveAt
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RetirementDTO(
        Long id,
        String kind,
        String planKey,
        String planName,
        Integer version,
        String featureKey,
        String audience,
        String status,
        String mode,
        String defaultOutcome,
        List<Integer> noticeScheduleDays,
        int minNoticeDays,
        List<String> channels,
        String messageMd,
        String reason,
        List<SuccessorDTO> successors,
        Map<String, Long> itemCounts,
        ImpactDTO impact,
        Instant startedAt,
        String startedBy,
        Instant cancelledAt,
        Instant completedAt,
        Instant createdAt,
        String createdBy
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RetirementPage(List<RetirementDTO> items, long total, int page, int size) {}

    /** One affected subscription as the admin sees it ({@code login} is the admin's alone). {@code suggestion} is the SuccessorAdvisor output (K10.2). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ItemDTO(
        Long id,
        Long retirementId,
        String login,
        Long subscriptionId,
        String interval,
        Instant retireEffectiveAt,
        String status,
        String choiceKind,
        long monthlyMinor,
        JsonNode suggestion,
        Long suggestedQuoteId,
        Integer lastNoticeDays,
        Instant decidedAt,
        Instant appliedAt,
        String note
    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ItemPage(List<ItemDTO> items, long total, int page, int size) {}
}
