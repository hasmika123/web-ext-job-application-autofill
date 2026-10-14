package com.dossier.api.service.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Tile;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The tile math of the Consultant Home: value now, value a week ago (items stamped before now-7d), cumulative weekly sparkline. */
class ConsultantHomeServiceTileTest {

    private static final Instant NOW = Instant.parse("2026-10-13T12:00:00Z");

    private static Instant ago(long days) {
        return NOW.minus(Duration.ofDays(days));
    }

    @Test
    void deltaIsRoundedToOneDecimalAgainstTheValueAWeekAgo() {
        // 3 of the 4 existed a week ago: (4 - 3) / 3 = +33.3 %
        Tile t = ConsultantHomeService.tile(4, List.of(ago(20), ago(10), ago(10), ago(1)), NOW, false);
        assertThat(t.value()).isEqualTo(4);
        assertThat(t.previous()).isEqualTo(3);
        assertThat(t.deltaPct()).isEqualTo(33.3);
        assertThat(t.sample()).isFalse();
    }

    @Test
    void deltaIsNullNeverZeroOrInfiniteWhenNothingExistedAWeekAgo() {
        Tile t = ConsultantHomeService.tile(2, List.of(ago(1), ago(2)), NOW, false);
        assertThat(t.previous()).isZero();
        assertThat(t.deltaPct()).isNull();
    }

    @Test
    void deltaCanBeNegativeWhenTheValueFell() {
        // 4 stamped before last week, only 3 left now: -25 %
        Tile t = ConsultantHomeService.tile(3, List.of(ago(30), ago(30), ago(30), ago(30)), NOW, false);
        assertThat(t.previous()).isEqualTo(4);
        assertThat(t.deltaPct()).isEqualTo(-25.0);
    }

    @Test
    void anItemStampedExactlyAWeekAgoIsNotYetPrevious() {
        Tile t = ConsultantHomeService.tile(1, List.of(ago(7)), NOW, false);
        assertThat(t.previous()).as("previous counts strictly-before now-7d").isZero();
        assertThat(t.deltaPct()).isNull();
    }

    @Test
    void nullStampsAreIgnoredAndTheSparklineIsSixCumulativeWeeklyPoints() {
        List<Instant> stamps = new ArrayList<>(Arrays.asList(ago(20), ago(10), ago(10), ago(1), null));
        Tile t = ConsultantHomeService.tile(4, stamps, NOW, false);
        assertThat(t.sparkline()).containsExactly(0L, 0L, 0L, 1L, 3L, 4L);
        assertThat(t.previous()).isEqualTo(3);
    }

    @Test
    void emptyStampsGiveZerosAndASampleFlagIsCarriedThrough() {
        Tile t = ConsultantHomeService.tile(0, List.of(), NOW, true);
        assertThat(t.value()).isZero();
        assertThat(t.previous()).isZero();
        assertThat(t.deltaPct()).isNull();
        assertThat(t.sparkline()).containsExactly(0L, 0L, 0L, 0L, 0L, 0L);
        assertThat(t.sample()).isTrue();
    }
}
