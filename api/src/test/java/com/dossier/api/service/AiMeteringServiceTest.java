package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.dossier.api.domain.AiCall;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AiUsageRepository;
import com.dossier.api.service.ai.AiErrorKind;
import com.dossier.api.service.ai.AiPricing;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

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

    // ---- the ledger (I1.10): provider, latency, success, failure rows -------------------------------

    private final AiUsageRepository usage = mock(AiUsageRepository.class);
    private final AiCallRepository calls = mock(AiCallRepository.class);
    private final AiMeteringService metering = new AiMeteringService(usage, calls, pricing);

    private AiCall saved() {
        ArgumentCaptor<AiCall> c = ArgumentCaptor.forClass(AiCall.class);
        verify(calls).save(c.capture());
        return c.getValue();
    }

    @Test
    void aSuccessIsLedgeredWithProviderLatencyAndCost() {
        metering.record("u", AiTask.PARSE, new AiResult("{}", "gemini-2.5-flash-lite-001", 1000, 0, 100, "gemini", 842));
        AiCall c = saved();
        assertThat(c.getProvider()).isEqualTo("gemini");
        assertThat(c.getLatencyMs()).isEqualTo(842);
        assertThat(c.isSuccess()).isTrue();
        assertThat(c.getErrorKind()).isNull();
        assertThat(c.getCostMicros()).isEqualTo(140);
        assertThat(c.getTask()).isEqualTo("parse");
        verify(usage).increment(eq("u"), anyString());
    }

    @Test
    void aResultWithNoProviderIsLedgeredAsGemini() {
        metering.record("u", AiTask.PICK, new AiResult("B", "gemini-2.5-flash-lite", 10, 0, 1));
        assertThat(saved().getProvider()).isEqualTo("gemini");
    }

    @Test
    void anAdminProbeIsLedgeredButNotCountedAsAUsersCall() {
        metering.record("boss", AiTask.PROBE, new AiResult("OK", "gemini-2.5-flash-lite-001", 9, 0, 1, "gemini", 400));
        assertThat(saved().getTask()).isEqualTo("probe");
        verify(usage, never()).increment(anyString(), anyString());
    }

    @Test
    void aFailureIsAZeroCostRowWithAShortKindAndNoUsageCount() {
        metering.recordFailure(null, AiTask.JOBS, "gemini", "gemini-2.5-flash-lite", AiErrorKind.TIMEOUT, 30004);
        AiCall c = saved();
        assertThat(c.isSuccess()).isFalse();
        assertThat(c.getErrorKind()).isEqualTo("TIMEOUT");
        assertThat(c.getCostMicros()).isZero();
        assertThat(c.getInputTokens() + c.getCachedTokens() + c.getOutputTokens()).isZero();
        assertThat(c.getLogin()).as("a nightly job has no user").isNull();
        assertThat(c.getLatencyMs()).isEqualTo(30004);
        assertThat(c.getProvider()).isEqualTo("gemini");
        verify(usage, never()).increment(anyString(), anyString());
    }
}
