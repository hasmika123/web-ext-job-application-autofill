package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.service.AiBudgetService.Decision;
import com.dossier.api.service.AiBudgetService.Verdict;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderException;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Unit tests for the AI proxy's gating order and plumbing: disabled / budget verdicts / consent /
 * cache / provider-error, and that each task reaches the provider as itself, on the model the budget
 * chose, and is metered as itself. The spending rules themselves are {@link AiBudgetServiceTest}'s.
 */
class AiDraftServiceTest {

    private static final String MODEL = "gemini-2.5-flash-lite";
    private static final Instant RESET = Instant.parse("2026-10-01T00:00:00Z");

    private AiProvider provider;
    private AiMeteringService metering;
    private AiBudgetService budget;
    private AiAnswerCacheService answerCache;
    private AiDraftService service;

    @BeforeEach
    void setUp() {
        provider = Mockito.mock(AiProvider.class);
        when(provider.isConfigured()).thenReturn(true);
        metering = Mockito.mock(AiMeteringService.class);
        budget = Mockito.mock(AiBudgetService.class);
        answerCache = Mockito.mock(AiAnswerCacheService.class); // lookup defaults to Optional.empty() (cache miss)
        allow(MODEL, 10);
        service = newService(true);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("user", "x"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private AiDraftService newService(boolean enabled) {
        return new AiDraftService(provider, metering, budget, answerCache, enabled);
    }

    private void allow(String model, int usedPercent) {
        when(budget.decide(anyString(), any())).thenReturn(new Decision(Verdict.OK, model, true, usedPercent, 100, RESET, false));
    }

    private void verdict(Verdict v) {
        when(budget.decide(anyString(), any())).thenReturn(new Decision(v, null, true, v == Verdict.EXHAUSTED ? 100 : 0, 100, RESET, false));
    }

    private static AiResult result(String text) {
        return new AiResult(text, MODEL, 120, 0, 30);
    }

    @Test
    void disabledWhenFeatureOff() {
        assertThat(newService(false).draft("Why us?", "ctx", true).status()).isEqualTo(AiDraftService.Status.DISABLED);
        verify(budget, never()).decide(anyString(), any());
    }

    @Test
    void disabledWhenProviderNotConfigured() {
        when(provider.isConfigured()).thenReturn(false);
        assertThat(service.draft("Why us?", "ctx", true).status()).isEqualTo(AiDraftService.Status.DISABLED);
    }

    /** 13.1b: a switched-off feature answers "disabled" — the extension then falls back quietly. */
    @Test
    void aKillSwitchedTaskIsDisabled() {
        verdict(Verdict.TASK_DISABLED);
        assertThat(service.run(AiTask.ENRICH, "q", "", true).status()).isEqualTo(AiDraftService.Status.DISABLED);
        verify(provider, never()).generate(any(), any(), anyString(), anyString());
    }

    @Test
    void consentRequiredWithoutConsent() {
        AiDraftService.Result r = service.draft("Why us?", "ctx", false);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.CONSENT_REQUIRED);
        verify(provider, never()).generate(any(), any(), anyString(), anyString());
    }

    /**
     * The gate is checked before consent, so a Free user is told the useful thing ("this is Pro")
     * rather than being sent to tick a consent box that still wouldn't let them through.
     */
    @Test
    void proRequiredOutranksMissingConsent() {
        verdict(Verdict.PRO_REQUIRED);
        assertThat(service.draft("Why us?", "ctx", false).status()).isEqualTo(AiDraftService.Status.PRO_REQUIRED);
        verify(provider, never()).generate(any(), any(), anyString(), anyString());
    }

    @Test
    void anExhaustedBudgetDoesNotCallTheProviderAndSaysWhenItResets() {
        verdict(Verdict.EXHAUSTED);
        AiDraftService.Result r = service.draft("Why us?", "ctx", true);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.QUOTA_EXCEEDED);
        assertThat(r.used()).isEqualTo(100);
        assertThat(r.resetsAt()).isEqualTo(RESET);
        verify(provider, never()).generate(any(), any(), anyString(), anyString());
    }

    @Test
    void successRunsOnTheBudgetsModelMetersAndCaches() {
        allow("gemini-2.5-flash", 10);
        AiResult res = result("My grounded answer.");
        when(provider.generate(eq(AiTask.DRAFT), eq("gemini-2.5-flash"), anyString(), anyString())).thenReturn(res);

        AiDraftService.Result r = service.draft("Why us?", "ctx", true);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.OK);
        assertThat(r.answer()).isEqualTo("My grounded answer.");
        assertThat(r.used()).isEqualTo(10);
        assertThat(r.quota()).isEqualTo(100);
        assertThat(r.cached()).isFalse();
        verify(metering).record("user", AiTask.DRAFT, res); // counted AND priced, as a draft
        verify(answerCache).store(anyString(), anyString(), eq("My grounded answer."), eq(MODEL));
    }

    /** 13.1a: the kind of request reaches the provider (so it gets its own instructions) and the ledger. */
    @Test
    void eachTaskIsSentAndMeteredAsItself() {
        for (AiTask task : new AiTask[] { AiTask.PICK, AiTask.MAP, AiTask.ENRICH }) {
            AiResult res = result("{\"1\":\"firstName\"}");
            when(provider.generate(eq(task), eq(MODEL), anyString(), anyString())).thenReturn(res);
            AiDraftService.Result r = service.run(task, "instruction for " + task.wire(), "", true);
            assertThat(r.status()).isEqualTo(AiDraftService.Status.OK);
            verify(provider).generate(task, MODEL, "instruction for " + task.wire(), "");
            verify(metering).record("user", task, res);
            verify(budget, Mockito.atLeastOnce()).decide("user", task);
        }
    }

    /** 13.1a: a pick and a draft of the same text want different answers — different cache keys. */
    @Test
    void tasksAreCachedApart() {
        when(provider.generate(any(), any(), anyString(), anyString())).thenReturn(result("x"));
        service.run(AiTask.DRAFT, "Same text", "", true);
        service.run(AiTask.PICK, "Same text", "", true);
        ArgumentCaptor<String> keys = ArgumentCaptor.forClass(String.class);
        verify(answerCache, Mockito.times(2)).lookup(eq("user"), keys.capture());
        assertThat(keys.getAllValues().get(0)).isNotEqualTo(keys.getAllValues().get(1));
        // …and a draft keeps the key it always had, so existing cached drafts still hit.
        assertThat(keys.getAllValues().get(0)).isEqualTo(AiAnswerCacheService.questionHash("Same text"));
    }

    @Test
    void cacheHitReturnsWithoutProviderOrCost() {
        when(answerCache.lookup(anyString(), anyString())).thenReturn(java.util.Optional.of("A previously stored answer."));

        AiDraftService.Result r = service.draft("Why us?", "ctx", true);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.OK);
        assertThat(r.answer()).isEqualTo("A previously stored answer.");
        assertThat(r.cached()).isTrue();
        verify(provider, never()).generate(any(), any(), anyString(), anyString());
        verify(metering, never()).record(anyString(), any(), any());
        verify(answerCache, never()).store(anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void cacheHitIsNotBlockedByAnExhaustedBudget() {
        verdict(Verdict.EXHAUSTED);
        when(answerCache.lookup(anyString(), anyString())).thenReturn(java.util.Optional.of("Reused answer."));

        AiDraftService.Result r = service.draft("Why us?", "ctx", true);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.OK); // not QUOTA_EXCEEDED
        assertThat(r.cached()).isTrue();
        verify(provider, never()).generate(any(), any(), anyString(), anyString());
    }

    @Test
    void providerErrorCostsNothing() {
        when(provider.generate(any(), any(), anyString(), anyString())).thenThrow(new AiProviderException("boom"));

        AiDraftService.Result r = service.draft("Why us?", "ctx", true);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.ERROR);
        verify(metering, never()).record(anyString(), any(), any());
    }
}
