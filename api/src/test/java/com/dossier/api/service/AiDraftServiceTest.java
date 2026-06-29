package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
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
 * Unit tests for the metered AI proxy gating: disabled / consent / quota / success /
 * provider-error. Uses a mock provider + repo (no real LLM, no DB) and a stubbed
 * security context for the current login.
 */
class AiDraftServiceTest {

    private static final int QUOTA = 2;

    private AiProvider provider;
    private AiUsageRepository usageRepository;
    private AiQuotaOverrideRepository quotaOverrideRepository;
    private AiAnswerCacheService answerCache;
    private AiDraftService service;

    @BeforeEach
    void setUp() {
        provider = Mockito.mock(AiProvider.class);
        usageRepository = Mockito.mock(AiUsageRepository.class);
        // findById defaults to Optional.empty() (no override) ⇒ the global quota applies.
        quotaOverrideRepository = Mockito.mock(AiQuotaOverrideRepository.class);
        answerCache = Mockito.mock(AiAnswerCacheService.class); // lookup defaults to Optional.empty() (cache miss)
        service = new AiDraftService(provider, usageRepository, quotaOverrideRepository, answerCache, true, QUOTA, "gemini-2.5-flash-lite");
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("user", "x"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void disabledWhenFeatureOff() {
        AiDraftService off = new AiDraftService(provider, usageRepository, quotaOverrideRepository, answerCache, false, QUOTA, "m"); // master off
        assertThat(off.draft("Why us?", "ctx", true).status()).isEqualTo(AiDraftService.Status.DISABLED);
        verify(usageRepository, never()).save(any());
    }

    @Test
    void disabledWhenProviderNotConfigured() {
        when(provider.isConfigured()).thenReturn(false);
        assertThat(service.draft("Why us?", "ctx", true).status()).isEqualTo(AiDraftService.Status.DISABLED);
    }

    @Test
    void consentRequiredWithoutConsent() {
        when(provider.isConfigured()).thenReturn(true);
        AiDraftService.Result r = service.draft("Why us?", "ctx", false);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.CONSENT_REQUIRED);
        verify(provider, never()).draft(anyString(), anyString());
    }

    @Test
    void quotaExceededDoesNotCallProvider() {
        when(provider.isConfigured()).thenReturn(true);
        AiUsage maxed = usage(2); // == quota
        when(usageRepository.findByLoginAndPeriod(anyString(), anyString())).thenReturn(Optional.of(maxed));
        AiDraftService.Result r = service.draft("Why us?", "ctx", true);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.QUOTA_EXCEEDED);
        assertThat(r.used()).isEqualTo(2);
        verify(provider, never()).draft(anyString(), anyString());
    }

    @Test
    void successDraftsIncrementsQuotaAndCaches() {
        when(provider.isConfigured()).thenReturn(true);
        when(usageRepository.findByLoginAndPeriod(anyString(), anyString())).thenReturn(Optional.of(usage(0)));
        when(provider.draft(anyString(), anyString())).thenReturn("My grounded answer.");

        AiDraftService.Result r = service.draft("Why us?", "ctx", true);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.OK);
        assertThat(r.answer()).isEqualTo("My grounded answer.");
        assertThat(r.used()).isEqualTo(1);
        assertThat(r.cached()).isFalse();
        verify(usageRepository).save(any(AiUsage.class));
        // the fresh draft is stored for reuse
        verify(answerCache).store(anyString(), anyString(), eq("My grounded answer."), eq("gemini-2.5-flash-lite"));
    }

    @Test
    void cacheHitReturnsWithoutProviderOrQuota() {
        when(provider.isConfigured()).thenReturn(true);
        when(usageRepository.findByLoginAndPeriod(anyString(), anyString())).thenReturn(Optional.of(usage(1)));
        when(answerCache.lookup(anyString(), anyString())).thenReturn(Optional.of("A previously stored answer."));

        AiDraftService.Result r = service.draft("Why us?", "ctx", true);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.OK);
        assertThat(r.answer()).isEqualTo("A previously stored answer.");
        assertThat(r.cached()).isTrue();
        assertThat(r.used()).isEqualTo(1); // current count, unchanged
        verify(provider, never()).draft(anyString(), anyString()); // provider not hit
        verify(usageRepository, never()).save(any()); // no quota charged
        verify(answerCache, never()).store(anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void cacheHitIsNotBlockedByQuota() {
        when(provider.isConfigured()).thenReturn(true);
        when(usageRepository.findByLoginAndPeriod(anyString(), anyString())).thenReturn(Optional.of(usage(QUOTA))); // maxed
        when(answerCache.lookup(anyString(), anyString())).thenReturn(Optional.of("Reused answer."));

        AiDraftService.Result r = service.draft("Why us?", "ctx", true);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.OK); // not QUOTA_EXCEEDED
        assertThat(r.cached()).isTrue();
        verify(provider, never()).draft(anyString(), anyString());
    }

    @Test
    void providerErrorDoesNotConsumeQuota() {
        when(provider.isConfigured()).thenReturn(true);
        when(usageRepository.findByLoginAndPeriod(anyString(), anyString())).thenReturn(Optional.of(usage(0)));
        when(provider.draft(anyString(), anyString())).thenThrow(new AiProviderException("boom"));

        AiDraftService.Result r = service.draft("Why us?", "ctx", true);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.ERROR);
        verify(usageRepository, never()).save(any());
    }

    private static AiUsage usage(int count) {
        AiUsage u = new AiUsage();
        u.setLogin("user");
        u.setPeriod("2026-06");
        u.setDraftCount(count);
        return u;
    }
}
