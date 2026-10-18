package com.dossier.api.service.billing.margin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.pricing.Audience;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

/** The fee model binding from settings: SIMPLE (default) and SCHEDULE, floors, and live re-reading. */
class FeeModelSettingsTest {

    @Test
    void defaultsAreTheSimpleModelOfTheLockedPrices() {
        MarginSettings s = MarginSettings.DEFAULTS;
        assertThat(s.feeModel()).isEqualTo(FeeModelKind.SIMPLE);
        assertThat(s.stripePctBp()).isEqualTo(290);
        assertThat(s.stripeFixedCents()).isEqualTo(30);
        assertThat(s.invoicingBp()).isEqualTo(40);
        assertThat(s.floorSubscriptionBp()).isEqualTo(8000);
        assertThat(s.floorServiceBp()).isEqualTo(2000);
        assertThat(s.orgAboveIndividualPct()).isEqualTo(25);
        assertThat(s.feeModelInstance()).isInstanceOf(SimpleFeeModel.class);
        assertThat(s.withFeeModel(FeeModelKind.SCHEDULE).feeModelInstance()).isInstanceOf(ScheduleFeeModel.class);
    }

    @Test
    void simpleFeesMatchTheDocFormulas() {
        FeeModel m = MarginSettings.DEFAULTS.feeModelInstance();
        assertThat(m.feeBase(1999, Audience.INDIVIDUAL)).isEqualTo(58 + 30);
        assertThat(m.feeFeature(499, Audience.INDIVIDUAL)).isEqualTo(14);
        assertThat(m.feeBase(1499, Audience.ORG)).isEqualTo(49 + 30); // 330 bp: the invoicing fee only applies to organizations
        assertThat(m.feeFeature(499, Audience.ORG)).isEqualTo(16);
        assertThat(m.feeOneTime(49_900, Audience.ORG)).isEqualTo(1677); // setup fee: 330 bp + 30
    }

    @Test
    void scheduleBaseFeesListEveryComponent() {
        FeeModel m = MarginSettings.DEFAULTS.withFeeModel(FeeModelKind.SCHEDULE).feeModelInstance();
        assertThat(m.baseFees(1999, Audience.INDIVIDUAL))
            .extracting(FeeLine::key, FeeLine::cents)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("card_pct", 58L),
                org.assertj.core.groups.Tuple.tuple("billing_pct", 14L),
                org.assertj.core.groups.Tuple.tuple("intl_fx_blend", 12L),
                org.assertj.core.groups.Tuple.tuple("card_fixed", 30L),
                org.assertj.core.groups.Tuple.tuple("dispute", 3L),
                org.assertj.core.groups.Tuple.tuple("email", 2L)
            );
        assertThat(m.feeBase(1999, Audience.INDIVIDUAL)).isEqualTo(119);
        // a feature never carries the per-invoice fixed, dispute or email fees
        assertThat(m.feeFeature(499, Audience.INDIVIDUAL)).isEqualTo(14 + 3 + 3); // card 14.47, billing 3.49, blend 3.12
        // a one-time charge has no recurring billing fee and no email
        assertThat(m.oneTimeFees(7110, Audience.INDIVIDUAL)).extracting(FeeLine::key).doesNotContain("billing_pct", "email");
    }

    @Test
    void theFingerprintChangesWithTheModelAndItsNumbers() {
        String simple = MarginSettings.DEFAULTS.feeModelInstance().fingerprint();
        String schedule = MarginSettings.DEFAULTS.withFeeModel(FeeModelKind.SCHEDULE).feeModelInstance().fingerprint();
        String other = new MarginSettings(FeeModelKind.SIMPLE, 300, 30, 40, FeeSchedule.DEFAULTS, 80, 20, 25).feeModelInstance().fingerprint();
        assertThat(simple).isNotEqualTo(schedule).isNotEqualTo(other);
        assertThat(MarginSettings.DEFAULTS.feeModelInstance().fingerprint()).isEqualTo(simple);
    }

    @Test
    void thePortIsReadOnEveryCallSoAnAdminChangeTakesEffectImmediately() {
        AtomicReference<MarginSettings> live = new AtomicReference<>(MarginSettings.DEFAULTS);
        MarginCalculator calc = new MarginCalculator(live::get);
        assertThat(calc.checkBase("PRO", Audience.INDIVIDUAL, com.dossier.api.service.pricing.BillingInterval.MONTH, "USD", 1999, 300).pass()).isTrue();
        live.set(MarginSettings.DEFAULTS.withFeeModel(FeeModelKind.SCHEDULE));
        assertThat(calc.checkBase("PRO", Audience.INDIVIDUAL, com.dossier.api.service.pricing.BillingInterval.MONTH, "USD", 1999, 300).pass()).isFalse();
        live.set(new MarginSettings(FeeModelKind.SIMPLE, 290, 30, 40, FeeSchedule.DEFAULTS, 70, 20, 25)); // an admin lowered the floor
        assertThat(calc.checkBase("PRO", Audience.INDIVIDUAL, com.dossier.api.service.pricing.BillingInterval.MONTH, "USD", 1999, 450).pass()).isTrue();
    }

    @Test
    void nonsenseSettingsAreRefusedAtConstruction() {
        assertThatThrownBy(() -> new MarginSettings(FeeModelKind.SIMPLE, 290, 30, 40, FeeSchedule.DEFAULTS, 101, 20, 25)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SimpleFeeModel(-1, 30, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new FeeSchedule(290, 30, 70, false, 350, false, 50, 10_001, 150, 100, 2500, 20, 1500, 2)).isInstanceOf(IllegalArgumentException.class);
    }
}
