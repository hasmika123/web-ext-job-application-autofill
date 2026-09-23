package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
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
import org.mockito.Mockito;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Unit tests for resume-parse gating and plumbing: disabled / kill switch / consent / used up /
 * success / provider-error / bad JSON — and that a parse is asked for as {@link AiTask#PARSE}, runs
 * on the budget's model and is metered as a parse. The rules are {@link AiBudgetServiceTest}'s.
 */
class AiResumeParseServiceTest {

    private static final String PARSED = "{\"summary\":\"x\",\"skills\":[\"Java\"]}";
    private static final String MODEL = "gemini-2.5-flash-lite";
    private static final Instant RESET = Instant.parse("2026-10-01T00:00:00Z");

    private AiProvider provider;
    private AiMeteringService metering;
    private AiBudgetService budget;
    private AiResumeParseService service;

    @BeforeEach
    void setUp() {
        provider = Mockito.mock(AiProvider.class);
        when(provider.isConfigured()).thenReturn(true);
        metering = Mockito.mock(AiMeteringService.class);
        budget = Mockito.mock(AiBudgetService.class);
        verdict(Verdict.OK, 1, 50);
        service = new AiResumeParseService(provider, metering, budget, true);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("user", "x"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void verdict(Verdict v, int used, int limit) {
        when(budget.decide(anyString(), any())).thenReturn(new Decision(v, v == Verdict.OK ? MODEL : null, false, used, limit, RESET, false));
    }

    private static AiResult parsed(String json) {
        return new AiResult(json, MODEL, 2000, 0, 800);
    }

    @Test
    void disabledWhenFeatureOff() {
        AiResumeParseService off = new AiResumeParseService(provider, metering, budget, false);
        assertThat(off.parse("resume text", null, null, true).status()).isEqualTo(AiResumeParseService.Status.DISABLED);
        verify(metering, never()).record(anyString(), any(), any());
    }

    @Test
    void disabledWhenProviderNotConfigured() {
        when(provider.isConfigured()).thenReturn(false);
        assertThat(service.parse("resume text", null, null, true).status()).isEqualTo(AiResumeParseService.Status.DISABLED);
    }

    @Test
    void aKillSwitchedParseIsDisabled() {
        verdict(Verdict.TASK_DISABLED, 0, 0);
        assertThat(service.parse("resume text", null, null, true).status()).isEqualTo(AiResumeParseService.Status.DISABLED);
        verify(provider, never()).parseResume(any(), any(), any(), any());
    }

    @Test
    void consentRequiredWithoutConsent() {
        AiResumeParseService.Result r = service.parse("resume text", null, null, false);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.CONSENT_REQUIRED);
        verify(provider, never()).parseResume(any(), any(), any(), any());
    }

    @Test
    void usedUpDoesNotCallTheProvider() {
        verdict(Verdict.EXHAUSTED, 50, 50);
        AiResumeParseService.Result r = service.parse("resume text", null, null, true);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.QUOTA_EXCEEDED);
        assertThat(r.used()).isEqualTo(50);
        assertThat(r.resetsAt()).isEqualTo(RESET);
        verify(provider, never()).parseResume(any(), any(), any(), any());
    }

    @Test
    void successParsesOnTheBudgetsModelAndIsMeteredAsAParse() {
        AiResult res = parsed(PARSED);
        when(provider.parseResume(MODEL, "resume text", null, null)).thenReturn(res);

        AiResumeParseService.Result r = service.parse("resume text", null, null, true);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.OK);
        assertThat(r.parsed().path("skills").get(0).asText()).isEqualTo("Java");
        verify(metering).record("user", AiTask.PARSE, res);
        verify(budget, Mockito.atLeastOnce()).decide("user", AiTask.PARSE);
    }

    @Test
    void filePathIsPassedThrough() {
        when(provider.parseResume(any(), any(), any(), any())).thenReturn(parsed(PARSED));

        AiResumeParseService.Result r = service.parse(null, "aGVsbG8=", "application/pdf", true);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.OK);
        verify(provider).parseResume(MODEL, null, "aGVsbG8=", "application/pdf");
    }

    @Test
    void providerErrorCostsNothing() {
        when(provider.parseResume(any(), any(), any(), any())).thenThrow(new AiProviderException("boom"));

        AiResumeParseService.Result r = service.parse("resume text", null, null, true);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.ERROR);
        verify(metering, never()).record(anyString(), any(), any());
    }

    @Test
    void unparseableProviderJsonIsAnErrorThatCostsNothing() {
        when(provider.parseResume(any(), any(), any(), any())).thenReturn(parsed("not json {"));

        AiResumeParseService.Result r = service.parse("resume text", null, null, true);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.ERROR);
        verify(metering, never()).record(anyString(), any(), any());
    }
}
