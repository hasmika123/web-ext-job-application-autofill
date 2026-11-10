package com.dossier.api.service.usage;

import com.dossier.api.service.entitlement.EntitlementSet;
import com.dossier.api.service.entitlement.PlanData.FeatureDef;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;

/**
 * What a service may be used, and over which window (docs/subscriptions/06-entitlements-and-enforcement.md section 5, story K7.5). Pure functions over a
 * resolved {@link EntitlementSet}: the plan's own number (a component override) wins over the service default, add-on quantities multiply the default,
 * and an additive service ({@code resume.extra_pack}) is added to the plan's limit instead of replacing it - all of that is already folded into
 * {@link EntitlementSet#limits()} and the per-feature grant, so this class only has to pick the right one and name the period.
 */
public final class AllowanceResolver {

    /** The limit key a service without a secondary limit is counted under. */
    public static final String DEFAULT_LIMIT = "default";

    /** A usage window: the key stored on counters and events, and its bounds. */
    public record PeriodWindow(String key, Instant start, Instant end) {}

    private AllowanceResolver() {}

    /**
     * The allowance for {@code def} in {@code set}: the effective limit when a {@code limitKey} is asked for (or the service defines one), else the
     * granted allowance of the service, else 0 (not granted).
     */
    public static long allowance(EntitlementSet set, FeatureDef def, String limitKey) {
        if (limitKey != null && !DEFAULT_LIMIT.equals(limitKey)) return set.limit(limitKey);
        if (def != null && def.limitKey() != null && set.limits().containsKey(def.limitKey())) return set.limit(def.limitKey());
        EntitlementSet.Grant g = set.features().get(def == null ? null : def.key());
        return g == null ? 0 : g.allowance();
    }

    /**
     * The window an allowance period names. DAY is the UTC day, MONTH the UTC calendar month ({@code M:yyyy-MM}). PERIOD is the paid term
     * ({@code P:yyyy-MM-dd} of its start); a Free account has no term and so counts calendar months, and on a YEARLY term PERIOD becomes the monthly
     * sub-window inside the term ({@code M:yyyy-MM}, decision S-10) so a year's allowance is never spendable in the first month.
     */
    public static PeriodWindow window(String allowancePeriod, EntitlementSet set, Instant now) {
        String p = allowancePeriod == null ? "MONTH" : allowancePeriod.toUpperCase();
        if ("DAY".equals(p)) {
            LocalDate d = now.atZone(ZoneOffset.UTC).toLocalDate();
            return new PeriodWindow("D:" + d, d.atStartOfDay(ZoneOffset.UTC).toInstant(), d.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant());
        }
        boolean term = "PERIOD".equals(p) && set.periodStart() != null && set.periodEnd() != null && !"YEAR".equals(set.interval());
        if (term) {
            return new PeriodWindow("P:" + set.periodStart().atZone(ZoneOffset.UTC).toLocalDate(), set.periodStart(), set.periodEnd());
        }
        YearMonth m = YearMonth.from(now.atZone(ZoneOffset.UTC));
        return new PeriodWindow("M:" + m, m.atDay(1).atStartOfDay(ZoneOffset.UTC).toInstant(), m.plusMonths(1).atDay(1).atStartOfDay(ZoneOffset.UTC).toInstant());
    }
}
