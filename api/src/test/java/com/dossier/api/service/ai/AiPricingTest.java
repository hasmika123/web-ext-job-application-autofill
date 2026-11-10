package com.dossier.api.service.ai;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The runtime price overlay (I1.10): admin rows win over code defaults, partial rows are ignored, costing is unchanged. */
class AiPricingTest {

    private FakeSettings fake;
    private AiPricing pricing;

    @BeforeEach
    void setUp() {
        fake = new FakeSettings();
        pricing = new AiPricing();
        new AiRuntimeSettings(fake.settings, AiEnv.defaults(), new AiPolicy(), pricing, fake.mapper); // attaches itself to the pricing
    }

    private void price(String model, long in, long cached, long out) {
        fake.put("ai.price." + model + ".input_per_mtok_micros", String.valueOf(in));
        fake.put("ai.price." + model + ".cached_per_mtok_micros", String.valueOf(cached));
        fake.put("ai.price." + model + ".output_per_mtok_micros", String.valueOf(out));
    }

    @Test
    void withNoRowsTheCodeDefaultsApplyAndCostIsUnchanged() {
        assertThat(pricing.costMicros("gemini-2.5-flash-lite", 1000, 0, 100)).isEqualTo(140);
        assertThat(pricing.costMicros("gemini-2.5-flash-lite", 400, 600, 50)).isEqualTo(66);
        assertThat(pricing.isPriced("gemini-2.5-flash-lite-001")).isTrue();
    }

    @Test
    void anAdminRowBeatsTheCodeDefault() {
        price("gemini-2.5-flash-lite", 200_000, 20_000, 800_000); // double the default
        assertThat(pricing.rateFor("gemini-2.5-flash-lite").getInput()).isEqualTo(0.2);
        assertThat(pricing.rateFor("gemini-2.5-flash-lite-001").getOutput()).as("a served version matches the row").isEqualTo(0.8);
        assertThat(pricing.costMicros("gemini-2.5-flash-lite", 1000, 0, 100)).isEqualTo(280);
        assertThat(pricing.defaultRateFor("gemini-2.5-flash-lite").getOutput()).as("the reset target is untouched").isEqualTo(0.40);
    }

    @Test
    void aPartialRowSetIsIgnored() {
        fake.put("ai.price.gemini-2.5-flash-lite.input_per_mtok_micros", "999999");
        fake.put("ai.price.gemini-2.5-flash-lite.output_per_mtok_micros", "999999");
        assertThat(pricing.rateFor("gemini-2.5-flash-lite").getInput()).isEqualTo(0.10);
        assertThat(pricing.costMicros("gemini-2.5-flash-lite", 1000, 0, 100)).isEqualTo(140);
    }

    @Test
    void aLocalModelCanBePricedAtZero() {
        assertThat(pricing.isPriced("qwen3:8b")).isFalse();
        assertThat(pricing.costMicros("qwen3:8b", 1000, 0, 1000)).as("unpriced = over-counted, never free").isPositive();
        price("qwen3:8b", 0, 0, 0);
        assertThat(pricing.isPriced("qwen3:8b")).isTrue();
        assertThat(pricing.costMicros("qwen3:8b", 1000, 0, 1000)).isZero();
    }

    @Test
    void theLongestNameWinsAcrossAdminRowsAndDefaults() {
        price("gemini-2.5-flash", 5_000_000, 500_000, 20_000_000);
        // flash-lite is a LONGER default name than the admin's flash row, so the row does not reprice it.
        assertThat(pricing.rateFor("gemini-2.5-flash-lite").getOutput()).isEqualTo(0.40);
        assertThat(pricing.rateFor("gemini-2.5-flash").getOutput()).isEqualTo(20.0);
        assertThat(pricing.rateFor("gemini-2.5-flash-preview-09-2025").getOutput()).isEqualTo(20.0);
    }

    @Test
    void aNewInvalidRowFallsBackToTheDefault() {
        price("gemini-2.5-flash-lite", 200_000, 20_000, 800_000);
        fake.put("ai.price.gemini-2.5-flash-lite.output_per_mtok_micros", "-5"); // out of bounds: the row is ignored, the triple is incomplete
        assertThat(pricing.rateFor("gemini-2.5-flash-lite").getOutput()).isEqualTo(0.40);
    }
}
