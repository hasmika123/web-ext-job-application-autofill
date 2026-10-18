package com.dossier.api.service.ai.engines;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;

/**
 * What a Resume Builder AI call answers with (DESIGN 9.5): a {@code status} and, for {@code ok} / {@code cached},
 * the checked proposal. The refusals are statuses, not errors, so the UI can show its own copy: Free is the
 * only 402. {@code usage} is the meter (percent of the period budget, never dollars), or the daily count when
 * {@code cap} is {@code "daily"}.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProposalResult(String status, ProposalView proposal, UsageView usage, String cap, Integer dropped) {

    public static final String OK = "ok";
    public static final String CACHED = "cached";
    public static final String DISABLED = "disabled";
    public static final String CONSENT_REQUIRED = "consentRequired";
    public static final String QUOTA_EXCEEDED = "quotaExceeded";
    public static final String NOTHING_TO_CHANGE = "nothingToChange";
    public static final String ERROR = "error";

    /** {@code cap} when the daily call cap (not the period budget) is what ran out. */
    public static final String CAP_DAILY = "daily";

    /**
     * One proposal. {@code stale}: the document has changed since it was made (it can no longer be applied).
     * {@code kind}, {@code title} and {@code body} are the suggestion-card fields (R4.6).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ProposalView(
        Long id,
        String task,
        String mode,
        boolean stale,
        Instant createdAt,
        List<ChangeView> changes,
        List<String> suggestions,
        String kind,
        String title,
        String body,
        String model,
        Long aiCallId
    ) {}

    /**
     * One proposed change to one line. {@code after} is the first alternative; {@code alternatives} is present
     * (all of them, the first included) only when there is more than one to choose from. {@code formatted}:
     * the line has inline formatting that applying the change resets. {@code sources}: refs the change draws on.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ChangeView(
        String ref,
        String section,
        String before,
        String after,
        List<String> alternatives,
        String reason,
        List<String> sources,
        boolean formatted
    ) {}

    public record UsageView(int used, int limit, Instant resetsAt, boolean economy) {}

    static ProposalResult refusal(String status, UsageView usage) {
        return new ProposalResult(status, null, usage, null, null);
    }
}
