package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.AiUsage;
import com.dossier.api.repository.AiQuotaOverrideRepository;
import com.dossier.api.repository.AiUsageRepository;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderException;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Unit tests for the server-side resume-parse gating: disabled / consent / quota /
 * success / provider-error / bad-JSON. Mock provider + repos (no real LLM, no DB),
 * stubbed security context — same shape as {@link AiDraftServiceTest}.
 */
class AiResumeParseServiceTest {

    private static final int QUOTA = 2;
    private static final String PARSED = "{\"summary\":\"x\",\"skills\":[\"Java\"]}";

    private AiProvider provider;
    private AiUsageRepository usageRepository;
    private AiQuotaOverrideRepository quotaOverrideRepository;
    private AiResumeParseService service;

    @BeforeEach
    void setUp() {
        provider = Mockito.mock(AiProvider.class);
        usageRepository = Mockito.mock(AiUsageRepository.class);
        quotaOverrideRepository = Mockito.mock(AiQuotaOverrideRepository.class);
        service = new AiResumeParseService(provider, usageRepository, quotaOverrideRepository, true, QUOTA);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("user", "x"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void disabledWhenFeatureOff() {
        AiResumeParseService off = new AiResumeParseService(provider, usageRepository, quotaOverrideRepository, false, QUOTA);
        assertThat(off.parse("resume text", null, null, true).status()).isEqualTo(AiResumeParseService.Status.DISABLED);
        verify(usageRepository, never()).save(any());
    }

    @Test
    void disabledWhenProviderNotConfigured() {
        when(provider.isConfigured()).thenReturn(false);
        assertThat(service.parse("resume text", null, null, true).status()).isEqualTo(AiResumeParseService.Status.DISABLED);
    }

    @Test
    void consentRequiredWithoutConsent() {
        when(provider.isConfigured()).thenReturn(true);
        AiResumeParseService.Result r = service.parse("resume text", null, null, false);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.CONSENT_REQUIRED);
        verify(provider, never()).parseResume(any(), any(), any());
    }

    @Test
    void quotaExceededDoesNotCallProvider() {
        when(provider.isConfigured()).thenReturn(true);
        when(usageRepository.findByLoginAndPeriod(anyString(), anyString())).thenReturn(Optional.of(usage(QUOTA)));
        AiResumeParseService.Result r = service.parse("resume text", null, null, true);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.QUOTA_EXCEEDED);
        assertThat(r.used()).isEqualTo(QUOTA);
        verify(provider, never()).parseResume(any(), any(), any());
    }

    @Test
    void successParsesAndConsumesOneCredit() {
        when(provider.isConfigured()).thenReturn(true);
        when(usageRepository.findByLoginAndPeriod(anyString(), anyString())).thenReturn(Optional.of(usage(0)));
        when(provider.parseResume(any(), any(), any())).thenReturn(PARSED);

        AiResumeParseService.Result r = service.parse("resume text", null, null, true);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.OK);
        assertThat(r.parsed().path("skills").get(0).asText()).isEqualTo("Java");
        assertThat(r.used()).isEqualTo(1);
        verify(usageRepository).save(any(AiUsage.class));
    }

    @Test
    void filePathIsPassedThrough() {
        when(provider.isConfigured()).thenReturn(true);
        when(usageRepository.findByLoginAndPeriod(anyString(), anyString())).thenReturn(Optional.of(usage(0)));
        when(provider.parseResume(any(), any(), any())).thenReturn(PARSED);

        AiResumeParseService.Result r = service.parse(null, "aGVsbG8=", "application/pdf", true);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.OK);
        verify(provider).parseResume(null, "aGVsbG8=", "application/pdf");
    }

    @Test
    void providerErrorDoesNotConsumeQuota() {
        when(provider.isConfigured()).thenReturn(true);
        when(usageRepository.findByLoginAndPeriod(anyString(), anyString())).thenReturn(Optional.of(usage(0)));
        when(provider.parseResume(any(), any(), any())).thenThrow(new AiProviderException("boom"));

        AiResumeParseService.Result r = service.parse("resume text", null, null, true);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.ERROR);
        verify(usageRepository, never()).save(any());
    }

    @Test
    void unparseableProviderJsonIsAnErrorWithoutQuota() {
        when(provider.isConfigured()).thenReturn(true);
        when(usageRepository.findByLoginAndPeriod(anyString(), anyString())).thenReturn(Optional.of(usage(0)));
        when(provider.parseResume(any(), any(), any())).thenReturn("not json {");

        AiResumeParseService.Result r = service.parse("resume text", null, null, true);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.ERROR);
        verify(usageRepository, never()).save(any());
    }

    private static AiUsage usage(int count) {
        AiUsage u = new AiUsage();
        u.setLogin("user");
        u.setPeriod("2026-07");
        u.setDraftCount(count);
        return u;
    }
}
