package com.dossier.api.service.onboarding;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.dto.OnboardingDTOs.CardState;
import com.dossier.api.service.onboarding.OnboardingCardRules.Decision;
import com.dossier.api.service.onboarding.OnboardingCardRules.Input;
import com.dossier.api.service.resume.ProfileMeta.OnboardingCard;
import java.time.Duration;
import java.time.Instant;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/** The dashboard card's show rules as a table (ONBOARDING-V2-DESIGN 6, DECISIONS #33e) with the defaults 40 / 20 / 14 days / 2. */
class OnboardingCardRulesTest {

    private static final Instant NOW = Instant.parse("2026-10-12T12:00:00Z");

    private static Instant ago(int days) {
        return NOW.minus(Duration.ofDays(days));
    }

    private static Instant ahead(int days) {
        return NOW.plus(Duration.ofDays(days));
    }

    private static OnboardingCard card(Instant dismissed, Instant snoozed, int count, Instant resurfaced) {
        return new OnboardingCard(dismissed, snoozed, count, resurfaced);
    }

    private static Input input(boolean enabled, boolean finished, int score, boolean draft, OnboardingCard card) {
        return new Input(enabled, finished, score, 40, 20, 14, 2, draft, card, NOW);
    }

    static Stream<Arguments> table() {
        OnboardingCard none = OnboardingCard.empty();
        return Stream.of(
            // name, input, show, state, resurfaced, startsNewShowing
            Arguments.of("new user, nothing yet", input(true, false, 0, false, none), true, CardState.NOT_STARTED, false, false),
            Arguments.of("a draft exists", input(true, false, 10, true, none), true, CardState.IN_PROGRESS, false, false),
            Arguments.of("feature switched off", input(false, false, 0, false, none), false, CardState.NOT_STARTED, false, false),
            Arguments.of("feature off with a draft", input(false, false, 0, true, none), false, CardState.IN_PROGRESS, false, false),
            Arguments.of("finished at the threshold hides", input(true, true, 40, false, none), false, CardState.NOT_STARTED, false, false),
            Arguments.of("finished above the threshold hides", input(true, true, 90, false, none), false, CardState.NOT_STARTED, false, false),
            Arguments.of("finished but thin brings it back", input(true, true, 39, false, none), true, CardState.NOT_STARTED, false, false),
            Arguments.of("not finished at a high score still shows", input(true, false, 90, false, none), true, CardState.NOT_STARTED, false, false),
            Arguments.of("snoozed hides", input(true, false, 0, false, card(null, ahead(2), 0, null)), false, CardState.NOT_STARTED, false, false),
            Arguments.of("snooze over shows", input(true, false, 0, false, card(null, ago(1), 0, null)), true, CardState.NOT_STARTED, false, false),
            Arguments.of("dismissed 5 days ago hides", input(true, false, 10, false, card(ago(5), null, 0, null)), false, CardState.NOT_STARTED, false, false),
            Arguments.of("dismissed 14 days ago and thin: first showing", input(true, false, 10, false, card(ago(14), null, 0, null)), true, CardState.NOT_STARTED, true, true),
            Arguments.of("dismissed long ago but the profile reached 20%", input(true, false, 20, false, card(ago(30), null, 0, null)), false, CardState.NOT_STARTED, false, false),
            Arguments.of("dismissed long ago at 19%", input(true, false, 19, false, card(ago(30), null, 0, null)), true, CardState.NOT_STARTED, true, true),
            Arguments.of("the same showing is not counted twice", input(true, false, 10, false, card(ago(20), null, 1, ago(6))), true, CardState.NOT_STARTED, true, false),
            Arguments.of("a second dismissal opens a second showing", input(true, false, 10, false, card(ago(15), null, 1, ago(40))), true, CardState.NOT_STARTED, true, true),
            Arguments.of("the cap stops a third showing", input(true, false, 10, false, card(ago(15), null, 2, ago(40))), false, CardState.NOT_STARTED, false, false),
            Arguments.of("the cap does not cut the showing in progress", input(true, false, 10, false, card(ago(20), null, 2, ago(6))), true, CardState.NOT_STARTED, true, false),
            Arguments.of("snooze beats a due resurface", input(true, false, 10, false, card(ago(30), ahead(1), 0, null)), false, CardState.NOT_STARTED, false, false),
            Arguments.of("a resurfaced card with a draft resumes it", input(true, false, 10, true, card(ago(30), null, 0, null)), true, CardState.IN_PROGRESS, true, true)
        );
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("table")
    void decides(String name, Input in, boolean show, CardState state, boolean resurfaced, boolean startsNew) {
        Decision d = OnboardingCardRules.decide(in);
        assertThat(d.show()).as("show").isEqualTo(show);
        assertThat(d.state()).as("state").isEqualTo(state);
        assertThat(d.resurfaced()).as("resurfaced").isEqualTo(resurfaced);
        assertThat(d.startsNewShowing()).as("startsNewShowing").isEqualTo(startsNew);
    }

    @Test
    void resurfaceBelowZeroNeverBringsADismissedCardBack() {
        Input in = new Input(true, false, 0, 40, 0, 14, 2, false, card(ago(300), null, 0, null), NOW);
        assertThat(OnboardingCardRules.decide(in).show()).isFalse();
    }

    @Test
    void maxResurfacesZeroNeverBringsADismissedCardBack() {
        Input in = new Input(true, false, 0, 40, 20, 14, 0, false, card(ago(300), null, 0, null), NOW);
        assertThat(OnboardingCardRules.decide(in).show()).isFalse();
    }

    @Test
    void aNullCardReadsAsEmpty() {
        assertThat(OnboardingCardRules.decide(input(true, false, 0, false, null)).show()).isTrue();
    }
}
