package com.dossier.api.service.retirement;

import com.dossier.api.domain.Subscription;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import org.springframework.stereotype.Service;

/**
 * Each subscriber's effective date: the first moment a retirement may change anything for them (docs/subscriptions/11-plan-retirement.md section 3; story K10.1).
 * Pure functions of the paid period, the interval, the minimum notice and the clock, so the whole table is unit-testable.
 *
 * <ul>
 *   <li>Monthly or quarterly: the end of the period already paid, unless the minimum notice (default 30 days) reaches past it, in which case the subscriber renews
 *       once more on the old plan and the date becomes that period's end (again, until the notice fits).</li>
 *   <li>Yearly: the next renewal, never mid-term; closer than the minimum notice means one more annual renewal on the old plan (decision S-23 a).</li>
 *   <li>Cancel-pending: their period end. Nothing changes and the retirement never shortens it.</li>
 *   <li>Past due and still entitled: the paid-through date is the period end, so the date cannot precede it.</li>
 * </ul>
 * The stored date only ever moves later: a renewal that happens before the subscriber decides pushes it to the new period end ({@link #moveLater}).
 */
@Service
public class RetirementEffectiveDateService {

    /** What the date depends on, taken from the subscription mirror. */
    public record Facts(String interval, Instant currentPeriodEnd, boolean cancelAtPeriodEnd, String status) {
        public static Facts of(Subscription s) {
            return new Facts(s.getBillingInterval(), s.getCurrentPeriodEnd(), s.isCancelAtPeriodEnd(), s.getStatus());
        }
    }

    /** Months an interval covers (a missing or unknown interval counts as monthly). */
    public static int months(String interval) {
        if (interval == null) return 1;
        return switch (interval.trim().toUpperCase(java.util.Locale.ROOT)) {
            case "QUARTER" -> 3;
            case "YEAR" -> 12;
            default -> 1;
        };
    }

    /** {@code anchor} plus {@code months} calendar months, in UTC (Stripe renews on the same day of the month). */
    public static Instant plusMonths(Instant anchor, int months) {
        return anchor.atZone(ZoneOffset.UTC).plusMonths(months).toInstant();
    }

    /** True when the subscription has been told to end (or has ended) at its period end. */
    public static boolean endsAtPeriodEnd(Facts f) {
        return f.cancelAtPeriodEnd() || "canceled".equalsIgnoreCase(f.status());
    }

    /**
     * The effective date for a retirement started at {@code start} with {@code minNoticeDays} of notice. A missing or already-past period end (a stale mirror)
     * counts as unknown: the date is then the earliest the notice allows.
     */
    public Instant compute(Facts f, Instant start, int minNoticeDays) {
        Instant earliest = start.plus(minNoticeDays, ChronoUnit.DAYS);
        Instant end = f.currentPeriodEnd();
        if (end == null || !end.isAfter(start)) return earliest;
        if (endsAtPeriodEnd(f)) return end; // they chose to stop: the date is their period end, however short the notice
        int step = months(f.interval());
        Instant e = end;
        int k = 0;
        while (e.isBefore(earliest)) {
            k++;
            e = plusMonths(end, step * k); // from the original anchor, so the day of the month never drifts
        }
        return e;
    }

    /**
     * The stored date, moved later when the subscription has renewed past it. Never earlier: a date that is already later than the period end stays.
     */
    public Instant moveLater(Instant stored, Subscription sub) {
        Instant end = sub.getCurrentPeriodEnd();
        if (end != null && end.isAfter(stored)) return end;
        return stored;
    }
}
