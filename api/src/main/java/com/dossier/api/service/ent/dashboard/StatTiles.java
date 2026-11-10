package com.dossier.api.service.ent.dashboard;

import com.dossier.api.service.dto.ent.DashboardDTO.StatTile;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Builds a tile (value, real change over 30 days, eight weekly points) from seat dates. Nothing here invents a number. */
final class StatTiles {

    static final int COMPARE_DAYS = 30;
    static final int SPARK_POINTS = 8;

    private StatTiles() {}

    /** The count of {@code seats} that were active at {@code t}. */
    static long activeAt(Collection<DashboardContext.Seat> seats, Instant t) {
        return seats.stream().filter(s -> s.activeAt(t)).count();
    }

    static StatTile of(Collection<DashboardContext.Seat> seats, Instant now, Map<String, Long> counts) {
        long value = activeAt(seats, now);
        long previous = activeAt(seats, now.minus(Duration.ofDays(COMPARE_DAYS)));
        List<Long> spark = new ArrayList<>();
        for (int i = SPARK_POINTS - 1; i >= 0; i--) spark.add(activeAt(seats, now.minus(Duration.ofDays(7L * i))));
        Double pct = previous > 0 ? Math.round((value - previous) * 1000.0 / previous) / 10.0 : null;
        return new StatTile(value, previous, pct, spark, COMPARE_DAYS + "d", counts == null ? new LinkedHashMap<>() : counts);
    }
}
