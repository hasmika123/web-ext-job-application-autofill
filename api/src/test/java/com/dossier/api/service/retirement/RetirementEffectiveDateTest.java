package com.dossier.api.service.retirement;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.Subscription;
import com.dossier.api.service.retirement.RetirementEffectiveDateService.Facts;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;

/** K10.1 (docs/subscriptions/11 section 3): each subscriber's effective date, from the paid period, the interval, the minimum notice and the clock. */
class RetirementEffectiveDateTest {

    private static final Instant START = Instant.parse("2026-11-01T10:00:00Z");
    private final RetirementEffectiveDateService dates = new RetirementEffectiveDateService();

    private static Instant in(long days) {
        return START.plus(days, ChronoUnit.DAYS);
    }

    @Test
    void aMonthlySubscriberWithTenDaysLeftAndThirtyDaysNoticeRenewsOnceMoreOnTheOldPlan() {
        Instant end = in(10);
        Instant effective = dates.compute(new Facts("MONTH", end, false, "active"), START, 30);
        assertThat(effective).isEqualTo(end.atZone(ZoneOffset.UTC).plusMonths(1).toInstant());
        assertThat(effective).isAfter(START.plus(30, ChronoUnit.DAYS));
    }

    @Test
    void aMonthlySubscriberWhoseNoticeFitsInThePaidPeriodKeepsThePeriodEnd() {
        Instant end = in(31);
        assertThat(dates.compute(new Facts("MONTH", end, false, "active"), START, 30)).isEqualTo(end);
    }

    @Test
    void aQuarterlySubscriberKeepsThePeriodEndWhenItIsFarEnoughAndOtherwiseRenewsByAQuarter() {
        Instant far = in(80);
        assertThat(dates.compute(new Facts("QUARTER", far, false, "active"), START, 30)).isEqualTo(far);
        Instant near = in(12);
        assertThat(dates.compute(new Facts("QUARTER", near, false, "active"), START, 30)).isEqualTo(near.atZone(ZoneOffset.UTC).plusMonths(3).toInstant());
    }

    @Test
    void aYearlySubscriberIsMovedAtTheNextRenewalNeverMidTermAndGetsOneMoreYearWhenItIsTooClose() {
        Instant renewal = in(200);
        assertThat(dates.compute(new Facts("YEAR", renewal, false, "active"), START, 30)).isEqualTo(renewal);
        Instant close = in(20);
        assertThat(dates.compute(new Facts("YEAR", close, false, "active"), START, 30)).isEqualTo(close.atZone(ZoneOffset.UTC).plusMonths(12).toInstant());
    }

    @Test
    void aCancelPendingSubscriberKeepsTheirPeriodEndHoweverShortAndItIsNeverShortened() {
        Instant end = in(5);
        assertThat(dates.compute(new Facts("MONTH", end, true, "active"), START, 30)).isEqualTo(end);
        assertThat(dates.compute(new Facts("YEAR", end, false, "canceled"), START, 30)).isEqualTo(end);
    }

    @Test
    void aPastDueSubscriberStillEntitledNeverGetsADateBeforeTheirPaidThroughDate() {
        Instant end = in(20);
        Instant effective = dates.compute(new Facts("MONTH", end, false, "past_due"), START, 30);
        assertThat(effective).isAfterOrEqualTo(end);
    }

    @Test
    void anUnknownOrPastPeriodEndFallsBackToTheEarliestTheNoticeAllows() {
        assertThat(dates.compute(new Facts("MONTH", null, false, "active"), START, 30)).isEqualTo(in(30));
        assertThat(dates.compute(new Facts("MONTH", START.minusSeconds(60), false, "active"), START, 45)).isEqualTo(in(45));
    }

    @Test
    void theDateDoesNotDriftTheDayOfTheMonthAcrossSeveralRenewals() {
        Instant end = Instant.parse("2026-11-30T00:00:00Z");
        Instant effective = dates.compute(new Facts("MONTH", end, false, "active"), Instant.parse("2026-11-29T00:00:00Z"), 100);
        // 100 days from Nov 29 is Mar 9; the first period end from the Nov 30 anchor that clears it is Mar 30 (not Mar 28, which a month-by-month walk from Feb 28 would give)
        assertThat(effective).isEqualTo(Instant.parse("2027-03-30T00:00:00Z"));
    }

    @Test
    void aRenewalBeforeADecisionMovesTheDateLaterAndNothingEverMovesItEarlier() {
        Instant stored = in(40);
        Subscription renewed = new Subscription();
        renewed.setCurrentPeriodEnd(in(70));
        assertThat(dates.moveLater(stored, renewed)).isEqualTo(in(70));
        Subscription same = new Subscription();
        same.setCurrentPeriodEnd(in(10));
        assertThat(dates.moveLater(stored, same)).as("a period end before the stored date changes nothing").isEqualTo(stored);
        Subscription none = new Subscription();
        assertThat(dates.moveLater(stored, none)).isEqualTo(stored);
    }

    @Test
    void monthlyEquivalentRoundsHalfUpAndIntervalsMapToMonths() {
        assertThat(RetirementMoney.monthlyEquivalent(4999, "QUARTER")).isEqualTo(1666);
        assertThat(RetirementMoney.monthlyEquivalent(1999, "MONTH")).isEqualTo(1999);
        assertThat(RetirementMoney.monthlyEquivalent(21589, "YEAR")).isEqualTo(1799);
        assertThat(RetirementEffectiveDateService.months(null)).isEqualTo(1);
    }
}
