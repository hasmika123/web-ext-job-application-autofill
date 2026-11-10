package com.dossier.api.service.pricing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.EnumSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Annual derivation and interval policy (docs/subscriptions/03 sections 2, 5). */
class AnnualDerivationTest {

    @Test
    void derivedPricesMatchTheWorkedExamples() {
        assertThat(AnnualPrices.derive(1999, 1000)).isEqualTo(21589);
        assertThat(AnnualPrices.derive(499, 1000)).isEqualTo(5389);
        assertThat(AnnualPrices.derive(499, 900)).isEqualTo(5449);
        assertThat(AnnualPrices.derive(799, 600)).isEqualTo(9013);
        assertThat(AnnualPrices.derive(1499, 1000)).isEqualTo(16189);
        assertThat(AnnualPrices.derive(699, 1000)).isEqualTo(7549);
        assertThat(AnnualPrices.derive(999, 1000)).isEqualTo(10789);
        assertThat(AnnualPrices.derive(1999, 0)).isEqualTo(1999 * 12);
        assertThat(AnnualPrices.derive(1999, 10_000)).isZero();
    }

    @Test
    void discountPrecedenceIsComponentThenPlanThenGlobal() {
        assertThat(AnnualPrices.resolveDiscountBp(900, 1200, 1000)).isEqualTo(900);
        assertThat(AnnualPrices.resolveDiscountBp(null, 1200, 1000)).isEqualTo(1200);
        assertThat(AnnualPrices.resolveDiscountBp(null, null, 1000)).isEqualTo(1000);
        assertThat(AnnualPrices.resolveDiscountBp(0, 1200, 1000)).isZero(); // an explicit zero is a value, not absence
    }

    @Test
    void impliedDiscountOfAnExplicitYearPrice() {
        assertThat(AnnualPrices.impliedDiscountBp(1999, 21589)).isEqualTo(1000);
        assertThat(AnnualPrices.impliedDiscountBp(1999, 1999 * 12)).isZero();
        assertThat(AnnualPrices.impliedDiscountBp(1999, 1999 * 12 + 100)).isNegative();
        assertThat(AnnualPrices.impliedDiscountBp(0, 0)).isZero();
    }

    @Test
    void invalidDiscountsAreRefused() {
        assertThatThrownBy(() -> AnnualPrices.derive(1999, -1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AnnualPrices.derive(1999, 10_001)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void intervalPolicyDefaultsAndSwitches() {
        IntervalPolicy p = IntervalPolicy.DEFAULTS;
        assertThat(p.allows(Audience.INDIVIDUAL, BillingInterval.MONTH)).isTrue();
        assertThat(p.allows(Audience.INDIVIDUAL, BillingInterval.QUARTER)).isTrue();
        assertThat(p.allows(Audience.INDIVIDUAL, BillingInterval.YEAR)).isTrue();
        assertThat(p.allows(Audience.ORG, BillingInterval.MONTH)).isTrue();
        assertThat(p.allows(Audience.ORG, BillingInterval.YEAR)).isTrue();
        assertThat(p.allows(Audience.ORG, BillingInterval.QUARTER)).isFalse();
        // even when an admin lists QUARTER for orgs, E17 still refuses it
        IntervalPolicy listed = new IntervalPolicy(EnumSet.allOf(BillingInterval.class), EnumSet.allOf(BillingInterval.class), true);
        assertThat(listed.allows(Audience.ORG, BillingInterval.QUARTER)).isFalse();
        IntervalPolicy noAnnual = new IntervalPolicy(p.individual(), p.org(), false);
        assertThat(noAnnual.allows(Audience.INDIVIDUAL, BillingInterval.YEAR)).isFalse();
        assertThat(noAnnual.allows(Audience.INDIVIDUAL, BillingInterval.ONE_TIME)).isTrue();
        IntervalPolicy monthlyOnly = new IntervalPolicy(Set.of(BillingInterval.MONTH), Set.of(BillingInterval.MONTH), true);
        assertThat(monthlyOnly.allows(Audience.INDIVIDUAL, BillingInterval.QUARTER)).isFalse();
    }

    @Test
    void intervalFactors() {
        assertThat(BillingInterval.MONTH.factor()).isEqualTo(1);
        assertThat(BillingInterval.QUARTER.factor()).isEqualTo(3);
        assertThat(BillingInterval.YEAR.factor()).isEqualTo(12);
        assertThat(BillingInterval.ONE_TIME.isRecurring()).isFalse();
    }
}
