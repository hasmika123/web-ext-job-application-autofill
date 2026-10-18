package com.dossier.api.service.onboarding;

import com.dossier.api.service.dto.OnboardingDTOs.CardState;
import com.dossier.api.service.resume.ProfileMeta.OnboardingCard;
import java.time.Duration;
import java.time.Instant;

/**
 * When the dashboard shows the "Finish your profile" card (Onboarding v2 DESIGN 6, DECISIONS #33e). Pure.
 *
 * <pre>
 * hidden  if feature.onboarding_v2.enabled = false
 * hidden  if finished AND score &gt;= profile.setup.promptBelowPercent        (a thin finished profile brings the card back)
 * hidden  if snoozedUntil &gt; now
 * hidden  if dismissed AND (score &gt;= onboarding.card.resurfaceBelowPercent
 *                         OR now &lt; dismissedAt + onboarding.card.resurfaceAfterDays
 *                         OR the showing is new AND resurfaceCount &gt;= onboarding.card.maxResurfaces)
 * shown   otherwise: IN_PROGRESS with a draft, else NOT_STARTED
 * </pre>
 *
 * "Once per showing": a dismissed card that comes back is one <em>showing</em> until the user dismisses it
 * again. The first GET of a showing counts it ({@link Decision#startsNewShowing}: {@code resurfaceCount + 1},
 * {@code resurfacedAt = now}); the following GETs of the same showing (a {@code resurfacedAt} after the dismissal)
 * show the card without counting again, and the cap only stops a <em>new</em> showing. So with a cap of 2 the card
 * comes back twice, each time staying until it is dismissed.
 */
public final class OnboardingCardRules {

    /** Everything the rule reads. {@code score} is the profile completeness (0-100). */
    public record Input(
        boolean featureEnabled,
        boolean finished,
        int score,
        int promptBelowPercent,
        int resurfaceBelowPercent,
        int resurfaceAfterDays,
        int maxResurfaces,
        boolean hasDraft,
        OnboardingCard card,
        Instant now
    ) {}

    /** {@code show}; the card's {@code state}; {@code resurfaced} = a dismissed card came back; {@code startsNewShowing} = count it. */
    public record Decision(boolean show, CardState state, boolean resurfaced, boolean startsNewShowing) {}

    private OnboardingCardRules() {}

    public static Decision decide(Input in) {
        CardState state = in.hasDraft() ? CardState.IN_PROGRESS : CardState.NOT_STARTED;
        Decision hidden = new Decision(false, state, false, false);
        OnboardingCard card = in.card() == null ? OnboardingCard.empty() : in.card();

        if (!in.featureEnabled()) return hidden;
        if (in.finished() && in.score() >= in.promptBelowPercent()) return hidden;
        if (card.snoozedUntil() != null && card.snoozedUntil().isAfter(in.now())) return hidden;

        if (card.dismissedAt() != null) {
            if (in.score() >= in.resurfaceBelowPercent()) return hidden;
            if (in.now().isBefore(card.dismissedAt().plus(Duration.ofDays(in.resurfaceAfterDays())))) return hidden;
            boolean alreadyCounted = card.resurfacedAt() != null && card.resurfacedAt().isAfter(card.dismissedAt());
            if (!alreadyCounted && card.resurfaceCount() >= in.maxResurfaces()) return hidden;
            return new Decision(true, state, true, !alreadyCounted);
        }
        return new Decision(true, state, false, false);
    }
}
