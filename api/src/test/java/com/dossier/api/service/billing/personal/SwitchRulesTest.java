package com.dossier.api.service.billing.personal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.BillingException;
import com.dossier.api.service.billing.personal.SwitchRules.Kind;
import com.dossier.api.service.pricing.BillingInterval;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/** K5.6 / K9.2: the switch table of docs/subscriptions/03 section 6.2 as pure rules (SubscriptionSwitchTest, IntervalSwitchRulesTest, ProrationIntervalTest annual rows). */
class SwitchRulesTest {

    private static final Instant START = Instant.parse("2026-01-01T00:00:00Z");
    private static final Instant END = Instant.parse("2027-01-01T00:00:00Z");

    @Test
    void sameIntervalDearerBaseIsAnUpgradeNowAndCheaperIsADowngradeAtPeriodEnd() {
        assertThat(SwitchRules.classify(true, BillingInterval.MONTH, BillingInterval.MONTH, 1999, 3999)).isEqualTo(Kind.UPGRADE_PLAN);
        assertThat(SwitchRules.classify(true, BillingInterval.MONTH, BillingInterval.MONTH, 3999, 1999)).isEqualTo(Kind.DOWNGRADE_PLAN);
        assertThat(SwitchRules.classify(true, BillingInterval.YEAR, BillingInterval.YEAR, 21589, 43179)).isEqualTo(Kind.UPGRADE_PLAN);
        assertThat(Kind.UPGRADE_PLAN.immediate()).isTrue();
        assertThat(Kind.DOWNGRADE_PLAN.immediate()).isFalse();
        assertThat(Kind.CHANGE_INTERVAL.immediate()).isFalse();
    }

    @Test
    void anyIntervalChangeWaitsEvenWithAPlanChangeAndNothingChangingIsRefused() {
        assertThat(SwitchRules.classify(false, BillingInterval.MONTH, BillingInterval.QUARTER, 1999, 4999)).isEqualTo(Kind.CHANGE_INTERVAL);
        assertThat(SwitchRules.classify(true, BillingInterval.MONTH, BillingInterval.YEAR, 1999, 43179)).isEqualTo(Kind.CHANGE_INTERVAL);
        assertThat(SwitchRules.classify(false, BillingInterval.YEAR, BillingInterval.MONTH, 21589, 1999)).isEqualTo(Kind.CHANGE_INTERVAL);
        assertThatThrownBy(() -> SwitchRules.classify(false, BillingInterval.MONTH, BillingInterval.MONTH, 1999, 1999)).isInstanceOf(BillingException.class);
    }

    @Test
    void yearlyNeedsAnnualOnAndLeavingAYearIsOnlyAtTermEnd() {
        assertThatThrownBy(() -> SwitchRules.requireAllowed(BillingInterval.MONTH, BillingInterval.YEAR, false, "AT_TERM_END")).isInstanceOfSatisfying(BillingException.class, e -> assertThat(e.getCode()).isEqualTo("INTERVAL_NOT_AVAILABLE"));
        SwitchRules.requireAllowed(BillingInterval.MONTH, BillingInterval.YEAR, true, "AT_TERM_END");
        SwitchRules.requireAllowed(BillingInterval.YEAR, BillingInterval.MONTH, false, "AT_TERM_END"); // an existing term runs to its end even with annual off
        assertThatThrownBy(() -> SwitchRules.requireAllowed(BillingInterval.YEAR, BillingInterval.MONTH, true, "NOW")).isInstanceOf(BillingException.class);
        SwitchRules.requireAllowed(BillingInterval.MONTH, BillingInterval.MONTH, false, "NOW");
    }

    @Test
    void effectiveAtIsNowForAnUpgradeAndThePeriodOrTermEndOtherwise() {
        Instant now = Instant.parse("2026-04-11T00:00:00Z");
        assertThat(SwitchRules.effectiveAt(Kind.UPGRADE_PLAN, now, END)).isEqualTo(now);
        assertThat(SwitchRules.effectiveAt(Kind.DOWNGRADE_PLAN, now, END)).isEqualTo(END);
        assertThat(SwitchRules.effectiveAt(Kind.CHANGE_INTERVAL, now, END)).isEqualTo(END);
    }

    @Test
    void annualUpgradeProratesTheNewAnnualBaseOverTheRemainingTermSeconds() {
        // the golden of docs/subscriptions/03: 23787 on day 100 of 365 leaves 265 days, 17270 (half-even to the minor unit)
        Instant now = START.plusSeconds(100L * 86_400);
        Instant end = START.plusSeconds(365L * 86_400);
        assertThat(SwitchRules.upgradeProration(SwitchRules.PRORATION_NEW_BASE, 23787, 0, START, end, now)).isEqualTo(17270);
        assertThat(SwitchRules.upgradeProration(SwitchRules.PRORATION_NEW_BASE, 23787, 21589, START, end, now)).as("the old base is not credited").isEqualTo(17270);
        long diff = SwitchRules.upgradeProration(SwitchRules.PRORATION_DIFFERENCE, 23787, 21589, START, end, now);
        assertThat(diff).isEqualTo(1596); // 2198 * 265 / 365
        assertThat(SwitchRules.upgradeProration(SwitchRules.PRORATION_DIFFERENCE, 1999, 3999, START, end, now)).as("never negative").isZero();
        assertThat(SwitchRules.upgradeProration(SwitchRules.PRORATION_NEW_BASE, 23787, 0, START, end, end)).as("nothing left of the term").isZero();
    }

    @Test
    void prorationOnAMonthlyPeriodUsesTheMonthlyUnit() {
        Instant start = Instant.parse("2026-04-01T00:00:00Z");
        Instant end = Instant.parse("2026-05-01T00:00:00Z");
        Instant now = Instant.parse("2026-04-11T00:00:00Z"); // 20 of 30 days left
        assertThat(SwitchRules.upgradeProration(SwitchRules.PRORATION_NEW_BASE, 3999, 1999, start, end, now)).isEqualTo(2666);
    }
}
