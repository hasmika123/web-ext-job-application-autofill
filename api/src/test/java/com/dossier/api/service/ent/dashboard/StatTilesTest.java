package com.dossier.api.service.ent.dashboard;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.service.dto.ent.DashboardDTO.StatTile;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** The tile arithmetic: values and deltas are replayed from seat dates, and never invented. */
class StatTilesTest {

    private static final Instant NOW = Instant.parse("2026-10-13T10:00:00Z");

    private static Instant ago(int days) {
        return NOW.minus(Duration.ofDays(days));
    }

    private static DashboardContext.Seat seat(long id, OrgMemberStatus status, Instant joined, Instant left) {
        return new DashboardContext.Seat(id, status, joined, left, joined, null);
    }

    @Test
    void valueIsTheSeatsActiveNowAndPreviousIsThoseActiveThirtyDaysAgo() {
        StatTile t = StatTiles.of(
            List.of(
                seat(1, OrgMemberStatus.ACTIVE, ago(90), null),
                seat(2, OrgMemberStatus.ACTIVE, ago(10), null), // joined inside the window
                seat(3, OrgMemberStatus.LEFT, ago(90), ago(5)), // left inside the window: was there 30 days ago
                seat(4, OrgMemberStatus.REMOVED, ago(90), ago(60)), // gone before the window
                seat(5, OrgMemberStatus.SUSPENDED, ago(90), null) // suspension is not dated: not counted either time
            ),
            NOW,
            Map.of()
        );
        assertThat(t.value()).isEqualTo(2);
        assertThat(t.previous()).isEqualTo(2);
        assertThat(t.deltaPct()).isEqualTo(0.0);
        assertThat(t.comparedTo()).isEqualTo("30d");
    }

    @Test
    void deltaIsRoundedToOneDecimalAndNullWhenThereWasNothingBefore() {
        StatTile up = StatTiles.of(
            List.of(seat(1, OrgMemberStatus.ACTIVE, ago(90), null), seat(2, OrgMemberStatus.ACTIVE, ago(90), null), seat(3, OrgMemberStatus.ACTIVE, ago(90), null), seat(4, OrgMemberStatus.ACTIVE, ago(2), null)),
            NOW,
            Map.of()
        );
        assertThat(up.deltaPct()).isEqualTo(33.3);

        StatTile fresh = StatTiles.of(List.of(seat(1, OrgMemberStatus.ACTIVE, ago(2), null)), NOW, Map.of());
        assertThat(fresh.previous()).isEqualTo(0);
        assertThat(fresh.deltaPct()).isNull();
    }

    @Test
    void sparklineIsEightWeeklyPointsOldestFirstEndingAtTheValue() {
        StatTile t = StatTiles.of(List.of(seat(1, OrgMemberStatus.ACTIVE, ago(30), null), seat(2, OrgMemberStatus.ACTIVE, ago(8), null)), NOW, Map.of());
        assertThat(t.sparkline()).hasSize(8);
        assertThat(t.sparkline().get(7)).isEqualTo(t.value()).isEqualTo(2);
        assertThat(t.sparkline().get(0)).isEqualTo(0); // 49 days ago neither had joined
        assertThat(t.sparkline().get(5)).isEqualTo(1); // 14 days ago only the first had joined
        assertThat(t.sparkline().get(6)).isEqualTo(2); // 7 days ago the second had too (joined 8 days ago)
    }

    @Test
    void aSeatThatStartsInTheFutureNeverCounts() {
        StatTile t = StatTiles.of(List.of(seat(1, OrgMemberStatus.ACTIVE, NOW.plusSeconds(3600), null)), NOW, Map.of());
        assertThat(t.value()).isZero();
    }
}
