package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.AiQuotaOverride;
import com.dossier.api.repository.AiQuotaOverrideRepository;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderException;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Unit tests for the server-side resume-parse gating: disabled / consent / quota /
 * success / provider-error / bad-JSON, and (13.1a) that the quota is the user's PLAN quota —
 * it used to be the Free one for everybody. Mock provider + metering, stubbed security context.
 */
class AiResumeParseServiceTest {

    private static final int FREE_QUOTA = 2;
    private static final int PRO_QUOTA = 9;
    private static final String PARSED = "{\"summary\":\"x\",\"skills\":[\"Java\"]}";

    private AiProvider provider;
    private AiMeteringService metering;
    private AiQuotaOverrideRepository quotaOverrideRepository;
    private EntitlementService entitlementService;
    private AiResumeParseService service;

    @BeforeEach
    void setUp() {
        provider = Mockito.mock(AiProvider.class);
        metering = Mockito.mock(AiMeteringService.class); // usedThisMonth defaults to 0
        quotaOverrideRepository = Mockito.mock(AiQuotaOverrideRepository.class);
        entitlementService = Mockito.mock(EntitlementService.class); // isPro defaults to false (Free)
        when(metering.record(anyString(), any(), any())).thenReturn(1);
        service = newService(true);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("user", "x"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private AiResumeParseService newService(boolean enabled) {
        return new AiResumeParseService(provider, metering, quotaOverrideRepository, entitlementService, enabled, FREE_QUOTA, PRO_QUOTA);
    }

    private static AiResult parsed(String json) {
        return new AiResult(json, "gemini-2.5-flash-lite", 2000, 0, 800);
    }

    @Test
    void disabledWhenFeatureOff() {
        assertThat(newService(false).parse("resume text", null, null, true).status()).isEqualTo(AiResumeParseService.Status.DISABLED);
        verify(metering, never()).record(anyString(), any(), any());
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
        when(metering.usedThisMonth("user")).thenReturn(FREE_QUOTA);
        AiResumeParseService.Result r = service.parse("resume text", null, null, true);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.QUOTA_EXCEEDED);
        assertThat(r.used()).isEqualTo(FREE_QUOTA);
        verify(provider, never()).parseResume(any(), any(), any());
    }

    /**
     * The bug 13.1a fixes: a Pro user who had used the Free number of calls that month (on drafts —
     * the counter is shared) was refused a resume parse. They get the Pro quota now.
     */
    @Test
    void aProUserGetsTheProQuota() {
        when(provider.isConfigured()).thenReturn(true);
        when(entitlementService.isPro("user")).thenReturn(true);
        when(metering.usedThisMonth("user")).thenReturn(FREE_QUOTA); // past the Free number
        when(provider.parseResume(any(), any(), any())).thenReturn(parsed(PARSED));

        AiResumeParseService.Result r = service.parse("resume text", null, null, true);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.OK);
        assertThat(r.quota()).isEqualTo(PRO_QUOTA);
    }

    @Test
    void anAdminOverrideStillOutranksThePlan() {
        when(provider.isConfigured()).thenReturn(true);
        when(entitlementService.isPro("user")).thenReturn(true);
        AiQuotaOverride o = new AiQuotaOverride();
        o.setLogin("user");
        o.setMonthlyQuota(1);
        when(quotaOverrideRepository.findById("user")).thenReturn(Optional.of(o));
        when(metering.usedThisMonth("user")).thenReturn(1);
        assertThat(service.parse("resume text", null, null, true).status()).isEqualTo(AiResumeParseService.Status.QUOTA_EXCEEDED);
    }

    @Test
    void successParsesAndIsMeteredAsAParse() {
        when(provider.isConfigured()).thenReturn(true);
        AiResult res = parsed(PARSED);
        when(provider.parseResume(any(), any(), any())).thenReturn(res);

        AiResumeParseService.Result r = service.parse("resume text", null, null, true);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.OK);
        assertThat(r.parsed().path("skills").get(0).asText()).isEqualTo("Java");
        assertThat(r.used()).isEqualTo(1);
        verify(metering).record("user", AiTask.PARSE, res);
    }

    @Test
    void filePathIsPassedThrough() {
        when(provider.isConfigured()).thenReturn(true);
        when(provider.parseResume(any(), any(), any())).thenReturn(parsed(PARSED));

        AiResumeParseService.Result r = service.parse(null, "aGVsbG8=", "application/pdf", true);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.OK);
        verify(provider).parseResume(null, "aGVsbG8=", "application/pdf");
    }

    @Test
    void providerErrorDoesNotConsumeQuota() {
        when(provider.isConfigured()).thenReturn(true);
        when(provider.parseResume(any(), any(), any())).thenThrow(new AiProviderException("boom"));

        AiResumeParseService.Result r = service.parse("resume text", null, null, true);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.ERROR);
        verify(metering, never()).record(anyString(), any(), any());
    }

    @Test
    void unparseableProviderJsonIsAnErrorWithoutQuota() {
        when(provider.isConfigured()).thenReturn(true);
        when(provider.parseResume(any(), any(), any())).thenReturn(parsed("not json {"));

        AiResumeParseService.Result r = service.parse("resume text", null, null, true);
        assertThat(r.status()).isEqualTo(AiResumeParseService.Status.ERROR);
        verify(metering, never()).record(anyString(), any(), any());
    }
}
