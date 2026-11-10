package com.dossier.api.service.ent.placements;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.dto.ent.PlacementDTO;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/** The pure rules of the Placements board: the status a row shows, the Next Action pill, the engagement timeline, availability and initials. */
class PlacementRulesTest {

    private final LocalDate today = LocalDate.of(2026, 10, 13);

    @Test
    void theStatusAPlacementShowsFollowsItsDatesWithoutAJob() {
        assertThat(PlacementRules.effectiveStatus("ENDED", today.minusDays(100), today)).isEqualTo("ENDED");
        assertThat(PlacementRules.effectiveStatus("ACTIVE", today.plusDays(1), today)).isEqualTo("UPCOMING");
        assertThat(PlacementRules.effectiveStatus("PENDING_START", today.plusDays(10), today)).isEqualTo("UPCOMING");
        assertThat(PlacementRules.effectiveStatus("PENDING_START", today, today)).as("the start date arrived: it is active, no job flipped it").isEqualTo("ACTIVE");
        assertThat(PlacementRules.effectiveStatus("ACTIVE", today.minusDays(5), today)).isEqualTo("ACTIVE");
    }

    private PlacementDTO.NextAction next(String eff, LocalDate start, LocalDate end, boolean pool, boolean pending) {
        return PlacementRules.nextAction(eff, start, end, pool, pending, today, 45, 14, 30);
    }

    @Test
    void endingSoonIsAmberThenRedInsideTheUrgentWindow() {
        PlacementDTO.NextAction amber = next("ACTIVE", today.minusDays(100), today.plusDays(45), false, false);
        assertThat(amber.label()).isEqualTo("Ends in 45 days");
        assertThat(amber.tone()).isEqualTo("amber");
        assertThat(next("ACTIVE", today.minusDays(100), today.plusDays(15), false, false).tone()).isEqualTo("amber");
        PlacementDTO.NextAction red = next("ACTIVE", today.minusDays(100), today.plusDays(14), false, false);
        assertThat(red.tone()).isEqualTo("red");
        assertThat(red.kind()).isEqualTo("ENDS_IN");
        assertThat(next("ACTIVE", today.minusDays(100), today.plusDays(1), false, false).label()).isEqualTo("Ends in 1 day");
        assertThat(next("ACTIVE", today.minusDays(100), today, false, false).label()).isEqualTo("Ends today");
        assertThat(next("ACTIVE", today.minusDays(100), today.plusDays(46), false, false).kind()).as("outside the window").isEqualTo("NONE");
    }

    @Test
    void anEndDateInThePastStillNeedsCompleting() {
        PlacementDTO.NextAction a = next("ACTIVE", today.minusDays(100), today.minusDays(3), false, false);
        assertThat(a.kind()).isEqualTo("ENDED_AGO");
        assertThat(a.label()).isEqualTo("Ended 3 days ago");
        assertThat(a.tone()).isEqualTo("red");
        assertThat(next("ACTIVE", today.minusDays(100), today.minusDays(1), false, false).label()).isEqualTo("Ended 1 day ago");
    }

    @Test
    void aWaitingExtensionReadsScheduleReviewUnlessTheEndIsClose() {
        assertThat(next("ACTIVE", today.minusDays(10), today.plusDays(200), false, true).label()).isEqualTo("Schedule review");
        assertThat(next("ACTIVE", today.minusDays(10), today.plusDays(200), false, true).tone()).isEqualTo("blue");
        assertThat(next("ACTIVE", today.minusDays(10), today.plusDays(5), false, true).kind()).as("ending soon wins").isEqualTo("ENDS_IN");
        assertThat(next("ACTIVE", today.minusDays(10), null, false, false).kind()).as("open-ended").isEqualTo("NONE");
    }

    @Test
    void upcomingAndCompletedPlacementsHaveTheirOwnPills() {
        PlacementDTO.NextAction soon = next("UPCOMING", today.plusDays(10), today.plusDays(200), false, false);
        assertThat(soon.label()).isEqualTo("Starts in 10 days");
        assertThat(soon.tone()).isEqualTo("blue");
        assertThat(next("UPCOMING", today.plusDays(31), today.plusDays(200), false, false).kind()).isEqualTo("NONE");
        assertThat(next("ENDED", today.minusDays(100), today.minusDays(20), false, false).label()).isEqualTo("No action");
        assertThat(next("ENDED", today.minusDays(100), today.minusDays(20), true, false).label()).isEqualTo("In redeployment pool");
    }

    @Test
    void theEngagementTimelineHasAMidpointAndHowFarTodayIs() {
        PlacementDTO.Engagement e = PlacementRules.engagement(today.minusDays(100), today.plusDays(100), today);
        assertThat(e.midpoint()).isEqualTo(today);
        assertThat(e.percent()).isEqualTo(50);
        assertThat(e.daysLeft()).isEqualTo(100);
        assertThat(e.totalDays()).isEqualTo(200);
        assertThat(PlacementRules.engagement(today.plusDays(5), today.plusDays(50), today).percent()).as("not started").isZero();
        assertThat(PlacementRules.engagement(today.minusDays(50), today.minusDays(5), today).percent()).as("over").isEqualTo(100);
        PlacementDTO.Engagement open = PlacementRules.engagement(today.minusDays(5), null, today);
        assertThat(open.end()).isNull();
        assertThat(open.midpoint()).isNull();
        assertThat(open.percent()).isNull();
    }

    @Test
    void availabilityIsTheChosenDateOtherwiseTheDayAfterTheEnd() {
        assertThat(PlacementRules.availableFrom(null, today.plusDays(45))).isEqualTo(today.plusDays(46));
        assertThat(PlacementRules.availableFrom(today.plusDays(5), today.plusDays(45))).isEqualTo(today.plusDays(5));
        assertThat(PlacementRules.availableFrom(null, null)).isNull();
    }

    @Test
    void clientInitialsAndLabels() {
        assertThat(PlacementRules.clientInitials("Global Media")).isEqualTo("GM");
        assertThat(PlacementRules.clientInitials("TechCorp")).isEqualTo("TE");
        assertThat(PlacementRules.clientInitials("A")).isEqualTo("A");
        assertThat(PlacementRules.clientInitials("  ")).isEqualTo("?");
        assertThat(PlacementRules.typeLabel("FTE")).isEqualTo("Full-time");
        assertThat(PlacementRules.typeLabel("C2C")).isEqualTo("Corp-to-corp");
        assertThat(PlacementRules.typeLabel(null)).isEqualTo("Contract");
        assertThat(PlacementRules.STATUS_FILTERS).hasSize(6);
        assertThat(PlacementRules.statusFilterLabel("ENDING_SOON")).isEqualTo("Ending soon");
    }
}
