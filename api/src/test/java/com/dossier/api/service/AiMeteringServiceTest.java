package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.ai.AiPricing;
import org.junit.jupiter.api.Test;

/** Pricing and cost arithmetic (Phase 13.1a) — pure, so they run in the fast unit suite. */
class AiMeteringServiceTest {

    private final AiPricing pricing = new AiPricing();

    @Test
    void costIsTokensTimesRate() {
        // Flash-Lite: $0.10 / $0.01 cached / $0.40 per million tokens = micro-dollars per token.
        assertThat(pricing.costMicros("gemini-2.5-flash-lite", 1000, 0, 100)).isEqualTo(140); // 100 + 40
        assertThat(pricing.costMicros("gemini-2.5-flash-lite", 400, 600, 50)).isEqualTo(66); // 40 + 6 + 20
        assertThat(pricing.costMicros("gemini-2.5-flash-lite", 0, 0, 0)).isZero();
    }

    @Test
    void aServedVersionMatchesItsModelsPrice() {
        assertThat(pricing.rateFor("gemini-2.5-flash-lite-001").getOutput()).isEqualTo(0.40);
        // The LONGEST matching name wins: flash-lite is not priced as flash.
        assertThat(pricing.rateFor("gemini-2.5-flash-lite").getOutput()).isEqualTo(0.40);
        assertThat(pricing.rateFor("gemini-2.5-flash").getOutput()).isEqualTo(2.50);
        assertThat(pricing.isPriced("gemini-2.5-flash-preview-09-2025")).isTrue();
        // Google's named successor is priced, and 3.5 Flash isn't mistaken for 3.5 Flash-Lite.
        assertThat(pricing.rateFor("gemini-3.1-flash-lite").getOutput()).isEqualTo(1.50);
        assertThat(pricing.rateFor("gemini-3.5-flash").getOutput()).isEqualTo(9.00);
        assertThat(pricing.rateFor("gemini-3.5-flash-lite").getOutput()).isEqualTo(2.50);
    }

    @Test
    void anUnpricedModelIsCountedHighNotFree() {
        assertThat(pricing.isPriced("some-future-model")).isFalse();
        assertThat(pricing.rateFor("some-future-model").getOutput()).isGreaterThanOrEqualTo(pricing.rateFor("gemini-2.5-flash").getOutput());
        assertThat(pricing.costMicros("some-future-model", 1000, 0, 1000)).isPositive();
    }
}
