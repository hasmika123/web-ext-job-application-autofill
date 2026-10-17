package com.dossier.api.service.catalog.plan;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.catalog.plan.PriceBook.Entry;
import com.dossier.api.service.catalog.plan.PriceBook.Source;
import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import org.junit.jupiter.api.Test;

/** K9.1: the yearly price a plan version would publish, and which source wins (explicit row, component discount, plan version discount, global default). */
class AnnualPriceDeriverTest {

    private static Entry month(long amount) {
        return new Entry(11L, "PRO", Audience.INDIVIDUAL, BillingInterval.MONTH, "USD", amount, Source.ACTIVE, null, null, null, false);
    }

    private static Entry year(long amount, Source source, boolean derived) {
        return new Entry(12L, "PRO", Audience.INDIVIDUAL, BillingInterval.YEAR, "USD", amount, source, null, 11L, derived ? 1000 : null, derived);
    }

    @Test
    void theGlobalDefaultDerivesProsYearlyPrice() {
        Entry y = AnnualPriceDeriver.yearFor(month(1999), null, null, null, 1000).orElseThrow();
        assertThat(y.amountMinor()).isEqualTo(21589); // 1999 x 12 less 10 percent
        assertThat(y.source()).isEqualTo(Source.DERIVED);
        assertThat(y.priceId()).as("a projection has no row yet").isNull();
        assertThat(y.derivedFromPriceId()).isEqualTo(11L);
        assertThat(y.derivedDiscountBp()).isEqualTo(1000);
        assertThat(y.interval()).isEqualTo(BillingInterval.YEAR);
    }

    @Test
    void theComponentDiscountBeatsThePlanDiscountWhichBeatsTheGlobalOne() {
        assertThat(AnnualPriceDeriver.yearFor(month(1999), null, 500, 1500, 1000).orElseThrow().derivedDiscountBp()).isEqualTo(500);
        assertThat(AnnualPriceDeriver.yearFor(month(1999), null, null, 1500, 1000).orElseThrow().derivedDiscountBp()).isEqualTo(1500);
        assertThat(AnnualPriceDeriver.yearFor(month(1999), null, null, null, 1000).orElseThrow().derivedDiscountBp()).isEqualTo(1000);
    }

    @Test
    void anExplicitYearlyRowOutranksEveryDiscount() {
        Entry typedDraft = year(20000, Source.DRAFT, false);
        assertThat(AnnualPriceDeriver.yearFor(month(1999), typedDraft, 500, 1500, 1000)).contains(typedDraft);
        Entry explicitActive = year(20500, Source.ACTIVE, false);
        assertThat(AnnualPriceDeriver.yearFor(month(1999), explicitActive, 500, 1500, 1000)).contains(explicitActive);
    }

    @Test
    void anActiveDerivedRowIsReusedWhenTheDerivationIsUnchangedAndReplacedWhenTheDiscountChanged() {
        Entry active = year(21589, Source.ACTIVE, true);
        assertThat(AnnualPriceDeriver.yearFor(month(1999), active, null, null, 1000)).contains(active);
        Entry replaced = AnnualPriceDeriver.yearFor(month(1999), active, null, 1200, 1000).orElseThrow();
        assertThat(replaced.source()).isEqualTo(Source.DERIVED);
        assertThat(replaced.amountMinor()).isEqualTo(21109); // 23988 less 12 percent, rounded once half-even
    }

    @Test
    void withoutAMonthlyPriceThereIsNothingToDerive() {
        assertThat(AnnualPriceDeriver.yearFor(null, null, null, null, 1000)).isEmpty();
    }
}
