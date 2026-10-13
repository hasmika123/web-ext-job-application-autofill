package com.dossier.api.service.ent.dashboard;

import com.dossier.api.service.dto.ent.DashboardDTO.StatTile;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/** Shared arithmetic of the talent widgets (talent-foundation.md section 5): month marks, deltas and tiles. Invents nothing. */
final class TalentTiles {

    static final int MARKS = 6;

    private TalentTiles() {}

    /** Six marks 30 days apart, oldest first, the last being {@code now}. */
    static List<Instant> monthlyMarks(Instant now) {
        List<Instant> out = new ArrayList<>();
        for (int i = MARKS - 1; i >= 0; i--) out.add(now.minus(Duration.ofDays(30L * i)));
        return out;
    }

    static LocalDate day(Instant t) {
        return t.atOffset(ZoneOffset.UTC).toLocalDate();
    }

    /** The {@code n} calendar months ending with the one that holds {@code now}, oldest first. */
    static List<YearMonth> lastMonths(Instant now, int n) {
        YearMonth current = YearMonth.from(day(now));
        List<YearMonth> out = new ArrayList<>();
        for (int i = n - 1; i >= 0; i--) out.add(current.minusMonths(i));
        return out;
    }

    static Instant startOf(YearMonth m) {
        return m.atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
    }

    /** Percent change to one decimal; null when there was nothing to compare with. */
    static Double pct(long value, long previous) {
        return previous > 0 ? Math.round((value - previous) * 1000.0 / previous) / 10.0 : null;
    }

    /** The sparkline of a count at each monthly mark, the last point replaced by the headline value so the two always agree. */
    static List<Long> spark(List<Instant> marks, long value, Function<Instant, Long> at) {
        List<Long> out = new ArrayList<>();
        for (int i = 0; i < marks.size() - 1; i++) out.add(at.apply(marks.get(i)));
        out.add(value);
        return out;
    }

    static StatTile tile(long value, long previous, List<Long> spark, String comparedTo, Map<String, Long> counts) {
        return new StatTile(value, previous, pct(value, previous), spark, comparedTo, counts);
    }

    static boolean allZero(List<Long> values) {
        return values.stream().allMatch(v -> v == 0);
    }
}
