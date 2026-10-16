package com.dossier.api.service.billing.margin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.billing.margin.MarginInputs.Component;
import com.dossier.api.service.billing.margin.MarginInputs.PlanComposition;
import com.dossier.api.service.billing.margin.MarginInputs.Role;
import com.dossier.api.service.pricing.AnnualPrices;
import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * The margin guard against the worked examples of docs/subscriptions/03 section 8, docs/enterprise-v2/21 sections 5 and 6 and
 * docs/design/pay/fee-model-and-margin-guard.md section 3.
 */
class MarginCalculatorTest {

    static final String USD = "USD";
    final MarginCalculator simple = new MarginCalculator(() -> MarginSettings.DEFAULTS);
    final MarginCalculator schedule = new MarginCalculator(() -> MarginSettings.DEFAULTS.withFeeModel(FeeModelKind.SCHEDULE));

    static Component base(String key, long month, int aiPerMonth, Map<BillingInterval, Long> extra) {
        return component(key, Role.BASE, month, aiPerMonth, 1, extra);
    }

    static Component component(String key, Role role, long month, int aiPerMonth, int max, Map<BillingInterval, Long> extra) {
        java.util.HashMap<BillingInterval, Long> amounts = new java.util.HashMap<>(extra);
        amounts.put(BillingInterval.MONTH, month);
        return new Component(key, role, amounts, aiPerMonth, max, Set.of(), Map.of());
    }

    // ---- 03 section 8.1: individual monthly ------------------------------------------------------------------------------

    @Test
    void section81BaseCreditAndCompositionMargins() {
        assertThat(simple.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, 1999, 300).marginBp()).isEqualTo(8059);
        assertThat(simple.checkFeature("credits", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, 499, 75).marginBp()).isEqualTo(8216);
        PlanComposition pro = new PlanComposition(
            "PRO",
            Audience.INDIVIDUAL,
            USD,
            EnumSet.of(BillingInterval.MONTH),
            List.of(base("PRO", 1999, 300, Map.of()), component("credits", Role.OPTIONAL, 499, 75, 2, Map.of()))
        );
        MarginReport report = simple.checkPlan(pro);
        assertThat(report.checks()).extracting(MarginCheck::kind).containsExactly(CheckKind.BASE, CheckKind.OPTIONAL, CheckKind.COMPOSITION);
        MarginCheck composition = report.checks().get(2);
        assertThat(composition.marginBp()).isEqualTo(8108);
        assertThat(composition.amountMinor()).isEqualTo(2997);
        assertThat(composition.aiCostMinor()).isEqualTo(450);
        assertThat(composition.feeMinor()).isEqualTo(117); // 87 + 30: one fixed fee for the one invoice
        assertThat(report.ok()).isTrue();
    }

    @Test
    void quarterBaseUsesTheExplicitEightDollarBudget() {
        MarginCheck q = simple.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.QUARTER, USD, 4999, 800);
        assertThat(q.feeMinor()).isEqualTo(175); // 145 + 30
        assertThat(q.marginBp()).isEqualTo(8049); // 80.49 percent (03 section 8.1 prints 8050, rounded)
        assertThat(q.pass()).isTrue();
        // three months of the monthly cap (900) would not pass: the explicit quarterly budget is what keeps Pro quarterly alive
        assertThat(simple.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.QUARTER, USD, 4999, 900).pass()).isFalse();
    }

    // ---- 03 section 8.2: annual ------------------------------------------------------------------------------------------

    @Test
    void section82AnnualRowsAtTenAndFifteenPercent() {
        long base10 = AnnualPrices.derive(1999, 1000);
        MarginCheck b = simple.checkDiscountedPrice("PRO", Audience.INDIVIDUAL, BillingInterval.YEAR, USD, base10, 3600, true);
        assertThat(b.marginBp()).isEqualTo(8028);
        assertThat(b.pass()).isTrue();
        MarginCheck c = simple.checkDiscountedPrice("credits", Audience.INDIVIDUAL, BillingInterval.YEAR, USD, AnnualPrices.derive(499, 1000), 900, false);
        assertThat(c.marginBp()).isEqualTo(8040);
        MarginCheck bad = simple.checkDiscountedPrice("PRO", Audience.INDIVIDUAL, BillingInterval.YEAR, USD, AnnualPrices.derive(1999, 1500), 3600, true);
        assertThat(bad.marginBp()).isEqualTo(7929);
        assertThat(bad.pass()).isFalse();
        assertThat(bad.overridable()).isFalse();
        assertThat(bad.code()).isEqualTo("MARGIN_BELOW_FLOOR");
    }

    // ---- 21 section 6 org rows --------------------------------------------------------------------------------------------

    @Test
    void orgDraftRowsReproduceTheirMargins() {
        assertThat(simple.checkBase("base.consultant", Audience.ORG, BillingInterval.MONTH, USD, 1499, 0).feeMinor()).isEqualTo(79); // 49 + 30
        assertThat(simple.checkBase("base.consultant", Audience.ORG, BillingInterval.MONTH, USD, 1499, 0).marginBp()).isEqualTo(9472);
        long[][] features = { { 499, 75, 8176 }, { 799, 125, 8110 }, { 999, 150, 8168 }, { 699, 75, 8597 } };
        for (long[] f : features) {
            MarginCheck c = simple.checkFeature("f" + f[0], Audience.ORG, BillingInterval.MONTH, USD, f[0], f[1]);
            assertThat(c.marginBp()).as("org feature at %d", f[0]).isEqualTo(f[2]);
            assertThat(c.pass()).isTrue();
        }
    }

    // ---- boundary: 7999 fails, 8000 passes --------------------------------------------------------------------------------

    @Test
    void boundarySevenNineNineNineFailsEightThousandPasses() {
        // Pro YEAR (ai 3600, base): 21229 evaluates to 7999 bp and fails, 21230 to exactly 8000 bp and passes
        MarginCheck fail = simple.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.YEAR, USD, 21229, 3600);
        MarginCheck pass = simple.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.YEAR, USD, 21230, 3600);
        assertThat(fail.marginBp()).isEqualTo(7999);
        assertThat(fail.pass()).isFalse();
        assertThat(pass.marginBp()).isEqualTo(8000);
        assertThat(pass.pass()).isTrue();
        // and a coarser pair: 1000 with ai 171 is 8000, with ai 172 it is 7990
        assertThat(simple.checkFeature("x", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, 1000, 171).marginBp()).isEqualTo(8000);
        assertThat(simple.checkFeature("x", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, 1000, 172).pass()).isFalse();
    }

    @Test
    void marginMathForFreeAndDegenerateRows() {
        assertThat(MarginCalculator.marginBp(0, 0, 0)).isEqualTo(10_000);
        assertThat(MarginCalculator.marginBp(0, 0, 50)).isEqualTo(MarginCalculator.NO_REVENUE_BP);
        assertThat(MarginCalculator.marginBp(1000, 2000, 0)).isNegative();
    }

    // ---- SCHEDULE model flips Pro (fee model doc section 3.1) ------------------------------------------------------------

    @Test
    void scheduleModelPutsLaunchOnePricesBelowTheFloorAndLaunchTwoAbove() {
        assertThat(schedule.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, 1999, 300).marginBp()).isEqualTo(7903); // 79.0 percent
        assertThat(schedule.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, 1999, 300).pass()).isFalse();
        assertThat(schedule.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.QUARTER, USD, 4999, 800).marginBp()).isEqualTo(7907); // 79.1
        assertThat(schedule.checkBase("AUTOPILOT", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, 3999, 600).marginBp()).isEqualTo(7989); // 79.9
        assertThat(schedule.checkBase("AUTOPILOT", Audience.INDIVIDUAL, BillingInterval.QUARTER, USD, 9999, 1600).marginBp()).isEqualTo(7942); // 79.4
        assertThat(schedule.checkBase("PRO-L2", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, 2499, 300).marginBp()).isEqualTo(8239); // 82.4
        assertThat(schedule.checkBase("PRO-L2", Audience.INDIVIDUAL, BillingInterval.QUARTER, USD, 5499, 800).marginBp()).isEqualTo(8061); // 80.6
        // the same rows under the SIMPLE model all pass: the locked prices were set with it (decision S-11)
        assertThat(simple.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, 1999, 300).pass()).isTrue();
        assertThat(simple.checkBase("AUTOPILOT", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, 3999, 600).pass()).isTrue();
    }

    @Test
    void managedPaymentsAndTaxSwitchesChangeTheScheduleFees() {
        FeeSchedule d = FeeSchedule.DEFAULTS;
        FeeSchedule mor = new FeeSchedule(d.cardPctBp(), d.cardFixedCents(), d.billingPctBp(), true, d.morPctBp(), false, d.taxPctBp(), d.taxShareBp(), d.intlPctBp(), d.fxPctBp(), d.intlShareBp(), d.disputeRateBp(), d.disputeCents(), d.emailCents());
        MarginCalculator withMor = new MarginCalculator(() -> new MarginSettings(FeeModelKind.SCHEDULE, 290, 30, 40, mor, 80, 20, 25));
        MarginCheck c = withMor.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, 1999, 300);
        assertThat(c.feeMinor() + c.aiCostMinor()).isEqualTo(486); // fee model doc section 3.2: every locked price fails with MoR on
        assertThat(c.marginBp()).isEqualTo(7568);
        assertThat(c.feeLines()).extracting(FeeLine::key).contains("mor_pct").doesNotContain("dispute", "tax_pct");
        FeeSchedule tax = new FeeSchedule(d.cardPctBp(), d.cardFixedCents(), d.billingPctBp(), false, d.morPctBp(), true, d.taxPctBp(), d.taxShareBp(), d.intlPctBp(), d.fxPctBp(), d.intlShareBp(), d.disputeRateBp(), d.disputeCents(), d.emailCents());
        MarginCheck t = new MarginCalculator(() -> new MarginSettings(FeeModelKind.SCHEDULE, 290, 30, 40, tax, 80, 20, 25)).checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, 1999, 300);
        assertThat(t.feeLines()).extracting(FeeLine::key).contains("tax_pct");
        assertThat(t.feeMinor()).isEqualTo(119 + 3); // tax at its registered share: 0.5 percent x 30 percent of 1999
    }

    // ---- levers -----------------------------------------------------------------------------------------------------------

    @Test
    void leversAreExactAndDocumentedAgainstTheClosedForm() {
        // 03 section 8.3 prints minPrice(yr) PRO 21229, org RT 8982, org JM 5390. Under the real rounding of the guard the smallest
        // passing prices are 21230, 8980 and 5390: 21229 evaluates to 7999 bp. The lever returns the price that actually passes.
        MarginLevers pro = simple.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.YEAR, USD, 21000, 3600).levers();
        assertThat(pro.minPriceMinor()).isEqualTo(21230);
        assertThat(simple.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.YEAR, USD, 21229, 3600).marginBp()).isEqualTo(7999);
        assertThat(simple.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.YEAR, USD, 21230, 3600).pass()).isTrue();

        MarginLevers rt = simple.checkFeature("RT", Audience.ORG, BillingInterval.YEAR, USD, 8000, 1500).levers();
        assertThat(rt.minPriceMinor()).isEqualTo(8980);
        assertThat(simple.checkFeature("RT", Audience.ORG, BillingInterval.YEAR, USD, 8979, 1500).pass()).isFalse();
        assertThat(simple.checkFeature("RT", Audience.ORG, BillingInterval.YEAR, USD, 8980, 1500).pass()).isTrue();

        MarginLevers jm = simple.checkFeature("JM", Audience.ORG, BillingInterval.YEAR, USD, 5000, 900).levers();
        assertThat(jm.minPriceMinor()).isEqualTo(5390);
    }

    @Test
    void closedFormAndExactLeversNeverDisagreeByMoreThanAFewMinorUnits() {
        for (long ai : new long[] { 0, 75, 300, 900, 1500, 3600, 7200 }) {
            for (boolean base : new boolean[] { true, false }) {
                long fixed = base ? 30 : 0;
                long closed = (ai + fixed) * 10_000 / (10_000 - 290 - 8000) + 1;
                long exact = simple.levers(MarginSettings.DEFAULTS.feeModelInstance(), Audience.INDIVIDUAL, base, 100, ai, 8000, BillingInterval.MONTH, null).minPriceMinor();
                assertThat(Math.abs(exact - closed)).as("ai=%d base=%s", ai, base).isLessThanOrEqualTo(4);
            }
        }
    }

    @Test
    void maxAiBudgetLeverPassesAtTheValueAndFailsOneAbove() {
        MarginCheck failing = simple.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, 1999, 500);
        assertThat(failing.pass()).isFalse();
        long maxAi = failing.levers().maxAiBudgetCents();
        assertThat(simple.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, 1999, maxAi).pass()).isTrue();
        assertThat(simple.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, 1999, maxAi + 1).pass()).isFalse();
        assertThat(maxAi).isEqualTo(1999 - 88 - 1600); // 311: price less fee less ceil(80 percent of the price)
    }

    @Test
    void maxAnnualDiscountLeverIsTheLargestDiscountWhoseDerivedRowPasses() {
        // PRO: 1000 bp passes, 1500 fails, and the exact limit is 1149 (11.49 percent): 1150 derives 21229, which is 7999 bp
        MarginCheck fifteen = simple.checkDiscountedPrice("PRO", Audience.INDIVIDUAL, BillingInterval.YEAR, USD, AnnualPrices.derive(1999, 1500), 3600, true);
        assertThat(fifteen.levers().maxDiscountBp()).isNull(); // not given: the single-row API has no month price to derive from
        PlanComposition pro = new PlanComposition(
            "PRO",
            Audience.INDIVIDUAL,
            USD,
            EnumSet.of(BillingInterval.MONTH, BillingInterval.YEAR),
            List.of(new Component("PRO", Role.BASE, Map.of(BillingInterval.MONTH, 1999L, BillingInterval.YEAR, AnnualPrices.derive(1999, 1500)), 300, 1, Set.of(BillingInterval.YEAR), Map.of()))
        );
        MarginCheck yr = simple.checkPlan(pro).failures().get(0);
        assertThat(yr.kind()).isEqualTo(CheckKind.DISCOUNT);
        long max = yr.levers().maxDiscountBp();
        assertThat(max).isEqualTo(1149);
        assertThat(simple.checkDiscountedPrice("PRO", Audience.INDIVIDUAL, BillingInterval.YEAR, USD, AnnualPrices.derive(1999, (int) max), 3600, true).pass()).isTrue();
        assertThat(simple.checkDiscountedPrice("PRO", Audience.INDIVIDUAL, BillingInterval.YEAR, USD, AnnualPrices.derive(1999, (int) max + 1), 3600, true).pass()).isFalse();
    }

    @Test
    void whenNoPriceCanPassTheLeverIsNull() {
        MarginSettings tight = new MarginSettings(FeeModelKind.SIMPLE, 2000, 30, 0, FeeSchedule.DEFAULTS, 80, 20, 25); // fee 20 percent + floor 80 percent = 100
        MarginCheck c = new MarginCalculator(() -> tight).checkFeature("x", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, 1000, 10);
        assertThat(c.pass()).isFalse();
        assertThat(c.levers().minPriceMinor()).isNull();
    }
}
