package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.service.dto.ApplicationDTO.NextStep;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/** "Ghosted" and "next step" are derived, never stored: the boundaries are pinned here. */
class GhostedDerivationTest {

    private static final Instant NOW = Instant.parse("2026-10-13T12:00:00Z");

    private static boolean ghosted(ApplicationStatus s, Duration quiet) {
        return ApplicationDerivations.isGhosted(s, false, NOW.minus(quiet), null, NOW, 21);
    }

    @Test
    void theBoundaryIsStrictlyMoreThanTwentyOneDays() {
        assertThat(ghosted(ApplicationStatus.APPLIED, Duration.ofDays(21))).as("exactly 21 days").isFalse();
        assertThat(ghosted(ApplicationStatus.APPLIED, Duration.ofDays(21).plusSeconds(1))).as("21 days and a second").isTrue();
        assertThat(ghosted(ApplicationStatus.APPLIED, Duration.ofDays(20))).isFalse();
    }

    @Test
    void onlyAppliedAndInReviewCanBeGhosted() {
        Duration longAgo = Duration.ofDays(90);
        assertThat(ghosted(ApplicationStatus.APPLIED, longAgo)).isTrue();
        assertThat(ghosted(ApplicationStatus.IN_REVIEW, longAgo)).isTrue();
        for (ApplicationStatus s : new ApplicationStatus[] {
            ApplicationStatus.DRAFT,
            ApplicationStatus.SAVED,
            ApplicationStatus.INTERVIEW,
            ApplicationStatus.OFFER,
            ApplicationStatus.REJECTED,
            ApplicationStatus.WITHDRAWN,
        }) {
            assertThat(ghosted(s, longAgo)).as(s + " is never ghosted").isFalse();
        }
    }

    @Test
    void archivedEntriesAreNotGhosted() {
        assertThat(ApplicationDerivations.isGhosted(ApplicationStatus.APPLIED, true, NOW.minus(Duration.ofDays(60)), null, NOW, 21)).isFalse();
    }

    @Test
    void theRowsLastUpdateStandsInWhenNoEventWasRecorded() {
        assertThat(ApplicationDerivations.isGhosted(ApplicationStatus.APPLIED, false, null, NOW.minus(Duration.ofDays(40)), NOW, 21)).isTrue();
        assertThat(ApplicationDerivations.isGhosted(ApplicationStatus.APPLIED, false, null, null, NOW, 21)).isFalse();
    }

    @Test
    void theWindowIsAParameter() {
        assertThat(ApplicationDerivations.isGhosted(ApplicationStatus.APPLIED, false, NOW.minus(Duration.ofDays(10)), null, NOW, 7)).isTrue();
        assertThat(ApplicationDerivations.isGhosted(ApplicationStatus.APPLIED, false, NOW.minus(Duration.ofDays(10)), null, NOW, 14)).isFalse();
    }

    @Test
    void nextStepIsTheSoonestInterviewThenReviewOfferThenTheUsersOwnAction() {
        Instant at = NOW.plus(Duration.ofDays(2));
        assertThat(ApplicationDerivations.nextStep(ApplicationStatus.OFFER, "Call back", NOW, at, "VIDEO")).isEqualTo(new NextStep("Video interview", at));
        assertThat(ApplicationDerivations.nextStep(ApplicationStatus.OFFER, "Call back", NOW, null, null)).isEqualTo(new NextStep("Review offer", null));
        assertThat(ApplicationDerivations.nextStep(ApplicationStatus.APPLIED, " Follow up ", NOW, null, null)).isEqualTo(new NextStep("Follow up", NOW));
        assertThat(ApplicationDerivations.nextStep(ApplicationStatus.APPLIED, "  ", null, null, null)).isNull();
        assertThat(ApplicationDerivations.nextStep(ApplicationStatus.APPLIED, null, null, null, null)).isNull();
        assertThat(ApplicationDerivations.interviewLabel("PANEL")).isEqualTo("Panel interview");
        assertThat(ApplicationDerivations.interviewLabel("OTHER")).isEqualTo("Interview");
    }
}
