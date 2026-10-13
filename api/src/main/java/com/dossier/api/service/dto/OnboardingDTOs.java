package com.dossier.api.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.Map;

/**
 * The shapes of {@code /api/profile/onboarding} (Onboarding v2 R1.8, ONBOARDING-V2-DESIGN 9). Request
 * records are bound directly by {@code OnboardingResource}; the rest are what it returns.
 */
public final class OnboardingDTOs {

    private OnboardingDTOs() {}

    /** {@code NONE} no draft and not finished, {@code DRAFT} a live draft, {@code FINISHED} finished (a finished user may also hold a new draft). */
    public enum Status {
        NONE,
        DRAFT,
        FINISHED,
    }

    /** What the dashboard card is asked to show: not started, or resuming a draft. */
    public enum CardState {
        NOT_STARTED,
        IN_PROGRESS,
    }

    /** {@code GET /api/profile/onboarding}. {@code persona} is {@code student | first_job | switching | experienced | null}. */
    public record StatusDTO(Status status, String persona, Instant finishedAt, DraftDTO draft, CardDTO card, CompletenessDTO completeness) {}

    /** The draft's summary; {@code state} is present only for {@code ?include=state}. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record DraftDTO(String step, int stepsDone, int stepsTotal, Instant updatedAt, JsonNode state) {}

    /**
     * The dashboard card's server-evaluated decision (DESIGN 6): {@code show} and {@code state}, the markers behind
     * them, and {@code resurfaced} (a dismissed card that came back, which adds the honest "{score}%" line).
     */
    public record CardDTO(Instant dismissedAt, Instant snoozedUntil, int resurfaceCount, boolean show, CardState state, boolean resurfaced) {}

    /** The profile meter's score and the two thresholds the card compares it with. */
    public record CompletenessDTO(int score, int promptBelow, int resurfaceBelow) {}

    /** {@code PUT /api/profile/onboarding/draft}. {@code baseUpdatedAt} is the {@code updatedAt} the client last saw; {@code force} overrides a conflict. */
    public record DraftRequest(
        Integer v,
        String step,
        String persona,
        Integer stepsDone,
        Integer stepsTotal,
        @Schema(type = "object", description = "The web's SetupState (candidates, decisions, cursor); never the file or the raw text.") JsonNode state,
        Instant baseUpdatedAt,
        Boolean force
    ) {}

    /** {@code PUT /draft} 200: the new conflict token and when the draft expires. */
    public record DraftSavedDTO(Instant updatedAt, Instant expiresAt) {}

    /** What {@code PATCH} may do to the card. */
    public enum CardAction {
        SNOOZE,
        DISMISS,
        RESET,
    }

    /** {@code action} is a {@link CardAction} name; a string so a wrong one is a 422 {@code DRAFT_INVALID}, not a 400. */
    public record CardPatch(@Schema(allowableValues = { "SNOOZE", "DISMISS", "RESET" }) String action) {}

    /**
     * {@code PATCH /api/profile/onboarding}. {@code persona}: absent leaves it, JSON {@code null} clears it, a string sets it
     * (declared as a JsonNode so absent and null differ).
     */
    public record PatchRequest(@Schema(type = "string", nullable = true, description = "student | first_job | switching | experienced, or null to clear.") JsonNode persona, CardPatch card) {}

    /** The honest field count of the payoff (DESIGN 10) and its per-group split. */
    public record CoverageDTO(int fields, Map<String, Integer> groups) {}

    /** {@code POST /api/profile/onboarding/finish}: idempotent. */
    public record FinishDTO(Instant finishedAt, CompletenessDTO completeness, CoverageDTO coverage) {}
}
