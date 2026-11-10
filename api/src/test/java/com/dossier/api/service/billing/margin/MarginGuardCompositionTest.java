package com.dossier.api.service.billing.margin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.billing.margin.MarginInputs.Component;
import com.dossier.api.service.billing.margin.MarginInputs.PlanComposition;
import com.dossier.api.service.billing.margin.MarginInputs.Preset;
import com.dossier.api.service.billing.margin.MarginInputs.PresetItem;
import com.dossier.api.service.billing.margin.MarginInputs.Role;
import com.dossier.api.service.billing.margin.MarginInputs.Tier;
import com.dossier.api.service.pricing.AnnualPrices;
import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Checks 1 to 5 of docs/subscriptions/03 section 7.2, the publish rule, services, presets, tiers and the discount refusal. */
class MarginGuardCompositionTest {

    static final String USD = "USD";
    final MarginCalculator simple = new MarginCalculator(() -> MarginSettings.DEFAULTS);

    static Component org(String key, Role role, long month, int ai) {
        return new Component(key, role, Map.of(BillingInterval.MONTH, month), ai, 1, Set.of(), Map.of());
    }

    /** The org seat configuration of 21 section 6 (base plus the six features) at MONTH. */
    PlanComposition seat() {
        return new PlanComposition(
            "seat",
            Audience.ORG,
            USD,
            EnumSet.of(BillingInterval.MONTH),
            List.of(
                org("base.consultant", Role.BASE, 1499, 0),
                org("ai.job_matching", Role.OPTIONAL, 499, 75),
                org("ai.resume_tailoring", Role.OPTIONAL, 799, 125),
                org("inbox.monitoring", Role.OPTIONAL, 499, 60),
                org("marketing.assisted_applications", Role.OPTIONAL, 699, 75),
                org("interview.ai_prep", Role.OPTIONAL, 999, 150)
            )
        );
    }

    @Test
    void aSeatPassesEveryCheckAndTheCompositionUsesOneBaseFee() {
        MarginReport r = simple.checkPlan(seat());
        assertThat(r.ok()).isTrue();
        MarginCheck comp = r.checks().stream().filter(c -> c.kind() == CheckKind.COMPOSITION).findFirst().orElseThrow();
        assertThat(comp.amountMinor()).isEqualTo(1499 + 499 + 799 + 499 + 699 + 999);
        assertThat(comp.aiCostMinor()).isEqualTo(75 + 125 + 60 + 75 + 150);
        assertThat(comp.feeMinor()).isEqualTo(Math.round(comp.amountMinor() * 0.033) + 30);
    }

    @Test
    void aThinFeatureCannotHideBehindAFatBaseButTheCompositionStillCountsIt() {
        PlanComposition p = new PlanComposition(
            "seat",
            Audience.ORG,
            USD,
            EnumSet.of(BillingInterval.MONTH),
            List.of(org("base.consultant", Role.BASE, 1499, 0), org("ai.thin", Role.OPTIONAL, 300, 150))
        );
        MarginReport r = simple.checkPlan(p);
        assertThat(r.failures()).extracting(MarginCheck::featureKey).contains("ai.thin");
        assertThat(r.failures()).allMatch(MarginCheck::overridable);
        MarginCheck comp = r.checks().stream().filter(c -> c.kind() == CheckKind.COMPOSITION).findFirst().orElseThrow();
        assertThat(comp.pass()).isTrue(); // the whole passes, the row alone does not: both are reported
    }

    @Test
    void stackableOptionalsAreCheckedAtMaxQuantityInTheComposition() {
        PlanComposition p = new PlanComposition(
            "PRO",
            Audience.INDIVIDUAL,
            USD,
            EnumSet.of(BillingInterval.MONTH),
            List.of(org("PRO", Role.BASE, 1999, 300), new Component("credits", Role.OPTIONAL, Map.of(BillingInterval.MONTH, 499L), 75, 4, Set.of(), Map.of()))
        );
        MarginCheck comp = simple.checkPlan(p).checks().stream().filter(c -> c.kind() == CheckKind.COMPOSITION).findFirst().orElseThrow();
        assertThat(comp.amountMinor()).isEqualTo(1999 + 4 * 499);
        assertThat(comp.aiCostMinor()).isEqualTo(300 + 4 * 75);
    }

    @Test
    void anIntervalWithoutAPriceIsSkippedNotFailed() {
        PlanComposition p = new PlanComposition(
            "PRO",
            Audience.INDIVIDUAL,
            USD,
            EnumSet.of(BillingInterval.MONTH, BillingInterval.YEAR),
            List.of(
                new Component("PRO", Role.BASE, Map.of(BillingInterval.MONTH, 1999L, BillingInterval.YEAR, AnnualPrices.derive(1999, 1000)), 300, 1, Set.of(BillingInterval.YEAR), Map.of()),
                org("credits", Role.OPTIONAL, 499, 75) // no YEAR row: not offered annually
            )
        );
        List<MarginCheck> year = simple.checkPlan(p).checks().stream().filter(c -> c.interval() == BillingInterval.YEAR).toList();
        assertThat(year).extracting(MarginCheck::featureKey).containsExactly("PRO");
        assertThat(year.get(0).pass()).isTrue();
    }

    // ---- publish rule ---------------------------------------------------------------------------------------------------

    private MarginReport failingBase() {
        PlanComposition p = new PlanComposition("thin", Audience.INDIVIDUAL, USD, EnumSet.of(BillingInterval.MONTH), List.of(org("thin", Role.BASE, 1500, 300)));
        return simple.checkPlan(p);
    }

    @Test
    void aFailingBaseNeedsAReasonOfTwentyCharactersAndTheCallerAuditsTheOverride() {
        MarginReport r = failingBase();
        assertThat(r.failures()).singleElement().satisfies(c -> {
            assertThat(c.marginBp()).isEqualTo(7506);
            assertThat(c.levers().minPriceMinor()).isNotNull();
        });
        assertThatThrownBy(() -> simple.requirePublishable(r, null)).isInstanceOfSatisfying(MarginBelowFloorException.class, e -> {
            assertThat(e.overrideAllowed()).isTrue();
            assertThat(e.reasonMissing()).isTrue();
            assertThat(e.first().code()).isEqualTo("MARGIN_BELOW_FLOOR");
        });
        assertThatThrownBy(() -> simple.requirePublishable(r, "too short")).isInstanceOf(MarginBelowFloorException.class);
        assertThatThrownBy(() -> simple.requirePublishable(r, "                    ")).isInstanceOf(MarginBelowFloorException.class);
        assertThat(simple.requirePublishable(r, "Approved by finance for the spring campaign")).isTrue();
    }

    @Test
    void aPassingReportNeedsNoReasonAndReportsNoOverride() {
        assertThat(simple.requirePublishable(simple.checkPlan(seat()), null)).isFalse();
    }

    @Test
    void derivedAnnualRowsAreRefusedEvenWithAReason() {
        PlanComposition p = new PlanComposition(
            "PRO",
            Audience.INDIVIDUAL,
            USD,
            EnumSet.of(BillingInterval.YEAR),
            List.of(new Component("PRO", Role.BASE, Map.of(BillingInterval.MONTH, 1999L, BillingInterval.YEAR, AnnualPrices.derive(1999, 1500)), 300, 1, Set.of(BillingInterval.YEAR), Map.of()))
        );
        MarginReport r = simple.checkPlan(p);
        assertThat(r.hardFailures()).hasSize(1);
        assertThatThrownBy(() -> simple.requirePublishable(r, "Marketing wants a big annual discount, approved by the board")).isInstanceOfSatisfying(MarginBelowFloorException.class, e -> {
            assertThat(e.overrideAllowed()).isFalse();
            assertThat(e.first().kind()).isEqualTo(CheckKind.DISCOUNT);
        });
    }

    @Test
    void anOrgDiscountBelowTheFloorIsRefusedEvenWithAReason() {
        // job matching 499 with a 15 percent discount: net 424, fee 14, ai 75 -> 7900 bp
        long net = com.dossier.api.service.pricing.Minor.pctOff(499, 1500);
        MarginCheck c = simple.checkDiscountedPrice("ai.job_matching", Audience.ORG, BillingInterval.MONTH, USD, net, 75, false);
        assertThat(c.marginBp()).isEqualTo(7900);
        MarginReport r = new MarginReport(List.of(c), List.of());
        assertThatThrownBy(() -> simple.requirePublishable(r, "A very good reason that is long enough to count")).isInstanceOfSatisfying(MarginBelowFloorException.class, e -> assertThat(e.overrideAllowed()).isFalse());
        // the same row at 5 percent off passes (10 percent would already be 7995 bp)
        assertThat(simple.checkDiscountedPrice("ai.job_matching", Audience.ORG, BillingInterval.MONTH, USD, com.dossier.api.service.pricing.Minor.pctOff(499, 500), 75, false).pass()).isTrue();
    }

    @Test
    void promoOnProFailsAtLaunchOnePrices() {
        // fee model doc section 3.5 under the SIMPLE model: 10 percent off Pro 1999 -> net 1799, fee 52 + 30, ai 300 -> 7871 bp
        MarginCheck c = simple.checkDiscountedPrice("PRO", Audience.INDIVIDUAL, BillingInterval.MONTH, USD, com.dossier.api.service.pricing.Minor.pctOff(1999, 1000), 300, true);
        assertThat(c.pass()).isFalse();
        assertThat(c.overridable()).isFalse();
    }

    // ---- presets ---------------------------------------------------------------------------------------------------------

    @Test
    void presetMustBeTwentyFivePercentAboveItsMirroredIndividualPlan() {
        Preset resume = new Preset("RESUME_AI_SUPPORT", USD, BillingInterval.MONTH, List.of(new PresetItem("base", 1499, 0), new PresetItem("rt", 799, 125), new PresetItem("opt", 399, 50), new PresetItem("ver", 199, 0)), 1999L, true);
        MarginReport ok = simple.checkPreset(resume);
        assertThat(ok.ok()).isTrue();
        assertThat(ok.checks().get(0).amountMinor()).isEqualTo(2896);
        Preset thin = new Preset("THIN", USD, BillingInterval.MONTH, List.of(new PresetItem("base", 1499, 0), new PresetItem("alr", 199, 0)), 1999L, true);
        MarginReport bad = simple.checkPreset(thin);
        assertThat(bad.presetFindings()).singleElement().satisfies(f -> {
            assertThat(f.code()).isEqualTo("PRESET_BELOW_INDIVIDUAL");
            assertThat(f.sumMinor()).isEqualTo(1698);
            assertThat(f.requiredMinor()).isEqualTo(2499); // 1999 x 1.25 = 2498.75
            assertThat(f.hard()).isTrue();
        });
        assertThatThrownBy(() -> simple.requirePublishable(bad, "A long enough reason does not help a mirrored preset")).isInstanceOf(MarginBelowFloorException.class);
    }

    @Test
    void anUnmirroredPresetBelowIndividualOnlyWarns() {
        Preset p = new Preset("LOW", USD, BillingInterval.MONTH, List.of(new PresetItem("base", 1499, 0), new PresetItem("alr", 199, 0)), 1999L, false);
        MarginReport r = simple.checkPreset(p);
        assertThat(r.presetFindings()).singleElement().satisfies(f -> assertThat(f.hard()).isFalse());
        assertThat(r.ok()).isTrue();
        assertThat(simple.requirePublishable(r, null)).isFalse();
    }

    @Test
    void presetMarginIsCheckedOnTheWholeWithOneBaseFee() {
        Preset heavy = new Preset("HEAVY", USD, BillingInterval.MONTH, List.of(new PresetItem("base", 1499, 0), new PresetItem("ai", 600, 500)), null, false);
        MarginCheck c = simple.checkPreset(heavy).checks().get(0);
        assertThat(c.kind()).isEqualTo(CheckKind.PRESET);
        assertThat(c.pass()).isFalse();
        assertThat(c.feeMinor()).isEqualTo(Math.round(2099 * 0.033) + 30);
    }

    // ---- tiers -----------------------------------------------------------------------------------------------------------

    @Test
    void aTierThatPushesAnyRowUnderTheFloorIsRefusedOutright() {
        MarginReport mild = simple.checkTier(seat(), new Tier(1, 500, Set.of()));
        assertThat(mild.ok()).isTrue();
        MarginReport deep = simple.checkTier(seat(), new Tier(2, 3000, Set.of()));
        assertThat(deep.failures()).isNotEmpty();
        assertThat(deep.failures()).allSatisfy(c -> {
            assertThat(c.kind()).isEqualTo(CheckKind.TIER);
            assertThat(c.code()).isEqualTo("TIER_BELOW_FLOOR");
            assertThat(c.overridable()).isFalse();
        });
        assertThatThrownBy(() -> simple.requirePublishable(deep, "Strategic customer segment, approved by the founders")).isInstanceOfSatisfying(MarginBelowFloorException.class, e -> assertThat(e.overrideAllowed()).isFalse());
    }

    @Test
    void aProductScopedTierOnlyChecksItsOwnProducts() {
        MarginReport scoped = simple.checkTier(seat(), new Tier(3, 3000, Set.of("ai.job_matching")));
        assertThat(scoped.checks()).extracting(MarginCheck::featureKey).contains("ai.job_matching").doesNotContain("ai.resume_tailoring");
    }

    // ---- services --------------------------------------------------------------------------------------------------------

    @Test
    void servicesAreCheckedAgainstTheTwentyPercentFloor() {
        MarginCalculator sched = new MarginCalculator(() -> MarginSettings.DEFAULTS.withFeeModel(FeeModelKind.SCHEDULE));
        MarginCheck review = sched.checkService("resume.review", Audience.INDIVIDUAL, USD, 7900, 1000, 5000, 0);
        assertThat(review.amountMinor()).isEqualTo(7110);
        assertThat(review.feeMinor()).isEqualTo(283); // card 236 + blend 44 + dispute 3
        assertThat(review.marginBp()).isEqualTo(2569);
        assertThat(review.pass()).isTrue();
        MarginCheck mock = sched.checkService("mock.interview", Audience.INDIVIDUAL, USD, 12900, 1000, 8500, 0);
        assertThat(mock.marginBp()).isEqualTo(2297);
        MarginCheck coaching = sched.checkService("coaching", Audience.INDIVIDUAL, USD, 11900, 1000, 8000, 0);
        assertThat(coaching.pass()).isTrue();
        MarginCheck raised = sched.checkService("coaching", Audience.INDIVIDUAL, USD, 11900, 1000, 8500, 0);
        assertThat(raised.pass()).isFalse(); // a payout raise to 85 dollars fails
        assertThat(raised.overridable()).isFalse(); // a discounted service is a discount row
        assertThat(raised.levers().minPriceMinor()).isGreaterThan(10710);
        assertThat(sched.checkService("coaching", Audience.INDIVIDUAL, USD, 11900, 0, 9500, 0).overridable()).isTrue();
    }

    // ---- re-evaluation when the fee model changes --------------------------------------------------------------------------

    @Test
    void changingTheFeeModelListsTheRowsThatFallBelowTheFloor() {
        PlanComposition pro = new PlanComposition(
            "PRO",
            Audience.INDIVIDUAL,
            USD,
            EnumSet.of(BillingInterval.MONTH, BillingInterval.QUARTER),
            List.of(new Component("PRO", Role.BASE, Map.of(BillingInterval.MONTH, 1999L, BillingInterval.QUARTER, 4999L), 300, 1, Set.of(), Map.of(BillingInterval.QUARTER, 800L)))
        );
        MarginSettings before = MarginSettings.DEFAULTS;
        List<MarginCalculator.Reevaluation> list = MarginCalculator.reevaluate(List.of(pro), before, before.withFeeModel(FeeModelKind.SCHEDULE));
        assertThat(list).hasSize(2);
        assertThat(list).allMatch(MarginCalculator.Reevaluation::passedBefore);
        assertThat(list).extracting(r -> r.after().interval()).containsExactlyInAnyOrder(BillingInterval.MONTH, BillingInterval.QUARTER);
        assertThat(MarginCalculator.reevaluate(List.of(pro), before, before)).isEmpty();
        assertThatCode(() -> MarginCalculator.reevaluate(List.of(), before, before)).doesNotThrowAnyException();
    }
}
