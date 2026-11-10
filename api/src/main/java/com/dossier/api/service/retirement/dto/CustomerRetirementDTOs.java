package com.dossier.api.service.retirement.dto;

import com.dossier.api.service.dto.PlanQuoteDTO;
import com.dossier.api.service.retirement.SuccessorAdvisor.Suggestion;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;

/**
 * What the signed-in subscriber sees and sends about a retirement of their plan (docs/subscriptions/11 sections 6 and 12; story K10.4). The page "Your plan is changing" and
 * the lock banner render these as they are: every number comes from the server, every date is the subscriber's own.
 */
public final class CustomerRetirementDTOs {

    private CustomerRetirementDTOs() {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record UsedDTO(String featureKey, String name, boolean covered) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record LockDTO(String featureKey, String name, Instant lockedSince) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PreviewLockDTO(String featureKey, String name) {}

    /** What the subscriber chose (the last confirmed choice), if anything. {@code planKey} and {@code effectiveAt} are set for a switch. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ChoiceDTO(String kind, Instant decidedAt, String planKey, Instant effectiveAt) {}

    /** After a fallback: when it happened and which services are read-only now. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record FallbackDTO(Instant appliedAt, List<LockDTO> locks) {}

    /**
     * {@code state}: CHANGING (the date is ahead), FELL_BACK (moved to Free, services locked read-only) or SWITCHED (moved to a successor). {@code itemStatus} is the
     * item's own status (PENDING, SWITCH_SCHEDULED, CANCELLED, FELL_BACK, MIGRATED, SWITCHED_NOW). {@code suggestion} is the closest match, {@code alternatives} the other
     * ranked candidates (Free included, each with its own gaps and price difference).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RetirementMeDTO(
        Long retirementId,
        String state,
        String subjectKind,
        String planKey,
        String planName,
        Integer planVersion,
        String featureKey,
        Instant effectiveAt,
        String itemStatus,
        String interval,
        String currency,
        long currentRecurringMinor,
        String defaultOutcome,
        String message,
        List<UsedDTO> used,
        Suggestion suggestion,
        List<Suggestion> alternatives,
        List<PreviewLockDTO> lockPreview,
        ChoiceDTO choice,
        FallbackDTO fallback
    ) {}

    /**
     * {@code kind}: SWITCH_NOW, SWITCH_AT_RENEWAL, PICK, LATER or CANCEL. A switch names the {@code quoteId} the subscriber saw; PICK names {@code planKey} (and optionally
     * {@code interval} and {@code addons}) and only creates a fresh quote.
     */
    public record ChoiceRequest(String kind, Long quoteId, String planKey, String interval, List<AddonRequest> addons) {
        public record AddonRequest(String featureKey, Integer quantity) {}
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ChangeDTO(Long id, String kind, Instant effectiveAt, String status) {}

    /**
     * What happened. {@code scheduled} is true when the switch will be applied at {@code effectiveAt} (an equal or lower price always is); {@code quote} is set for PICK.
     * {@code cancelAtPeriodEnd} is true after CANCEL.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ChoiceResultDTO(String state, String itemStatus, Instant effectiveAt, boolean scheduled, PlanQuoteDTO quote, ChangeDTO change, Boolean cancelAtPeriodEnd) {}
}
