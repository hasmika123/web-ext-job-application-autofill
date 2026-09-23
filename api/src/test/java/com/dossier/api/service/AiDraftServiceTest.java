package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
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
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Unit tests for the metered AI proxy gating: disabled / Pro / consent / quota / success /
 * provider-error, and (13.1a) that each task reaches the provider as itself and is metered as
 * itself. Uses a mock provider + metering (no real LLM, no DB) and a stubbed security context.
 *
 * <p>The two quotas differ on purpose so the tests can tell which one was applied: the default
 * user here is Pro (that's the paying case), and {@link #freeWithAnOverrideStillDrafts} proves
 * the admin grant both opens the gate and supplies the quota.
 */
class AiDraftServiceTest {

    /** Pro quota — small so `used(PRO_QUOTA)` is a maxed-out Pro user. */
    private static final int PRO_QUOTA = 2;
    /** Free quota — never reached in these tests, but distinct so a mix-up would show. */
    private static final int FREE_QUOTA = 7;
    private static final String MODEL = "gemini-2.5-flash-lite";

    private AiProvider provider;
    private AiMeteringService metering;
    private AiQuotaOverrideRepository quotaOverrideRepository;
    private AiAnswerCacheService answerCache;
    private EntitlementService entitlementService;
    private AiDraftService service;

    @BeforeEach
    void setUp() {
        provider = Mockito.mock(AiProvider.class);
        metering = Mockito.mock(AiMeteringService.class); // usedThisMonth defaults to 0
        // findById defaults to Optional.empty() (no override) ⇒ the global quota applies.
        quotaOverrideRepository = Mockito.mock(AiQuotaOverrideRepository.class);
        answerCache = Mockito.mock(AiAnswerCacheService.class); // lookup defaults to Optional.empty() (cache miss)
        entitlementService = Mockito.mock(EntitlementService.class);
        when(entitlementService.isPro(anyString())).thenReturn(true); // server AI is Pro (12.4)
        when(metering.record(anyString(), any(), any())).thenReturn(1);
        service = newService(true);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("user", "x"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private AiDraftService newService(boolean enabled) {
        return new AiDraftService(
            provider,
            metering,
            quotaOverrideRepository,
            answerCache,
            entitlementService,
            enabled,
            FREE_QUOTA,
            PRO_QUOTA,
            MODEL
        );
    }

    private static AiResult result(String text) {
        return new AiResult(text, MODEL, 120, 0, 30);
    }

    @Test
    void disabledWhenFeatureOff() {
        AiDraftService off = newService(false); // master off
        assertThat(off.draft("Why us?", "ctx", true).status()).isEqualTo(AiDraftService.Status.DISABLED);
        verify(metering, never()).record(anyString(), any(), any());
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
        verify(provider, never()).generate(any(), anyString(), anyString());
    }

    @Test
    void quotaExceededDoesNotCallProvider() {
        when(provider.isConfigured()).thenReturn(true);
        when(metering.usedThisMonth("user")).thenReturn(PRO_QUOTA); // == quota
        AiDraftService.Result r = service.draft("Why us?", "ctx", true);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.QUOTA_EXCEEDED);
        assertThat(r.used()).isEqualTo(2);
        verify(provider, never()).generate(any(), anyString(), anyString());
    }

    @Test
    void successDraftsMetersAndCaches() {
        when(provider.isConfigured()).thenReturn(true);
        AiResult res = result("My grounded answer.");
        when(provider.generate(eq(AiTask.DRAFT), anyString(), anyString())).thenReturn(res);

        AiDraftService.Result r = service.draft("Why us?", "ctx", true);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.OK);
        assertThat(r.answer()).isEqualTo("My grounded answer.");
        assertThat(r.used()).isEqualTo(1);
        assertThat(r.cached()).isFalse();
        verify(metering).record("user", AiTask.DRAFT, res); // counted AND priced, as a draft
        verify(answerCache).store(anyString(), anyString(), eq("My grounded answer."), eq(MODEL));
    }

    /** 13.1a: the kind of request reaches the provider (so it gets its own instructions) and the ledger. */
    @Test
    void eachTaskIsSentAndMeteredAsItself() {
        when(provider.isConfigured()).thenReturn(true);
        for (AiTask task : new AiTask[] { AiTask.PICK, AiTask.MAP, AiTask.ENRICH }) {
            AiResult res = result("{\"1\":\"firstName\"}");
            when(provider.generate(eq(task), anyString(), anyString())).thenReturn(res);
            AiDraftService.Result r = service.run(task, "instruction for " + task.wire(), "", true);
            assertThat(r.status()).isEqualTo(AiDraftService.Status.OK);
            verify(provider).generate(task, "instruction for " + task.wire(), "");
            verify(metering).record("user", task, res);
        }
    }

    /** 13.1a: a pick and a draft of the same text want different answers — different cache keys. */
    @Test
    void tasksAreCachedApart() {
        when(provider.isConfigured()).thenReturn(true);
        when(provider.generate(any(), anyString(), anyString())).thenReturn(result("x"));
        service.run(AiTask.DRAFT, "Same text", "", true);
        service.run(AiTask.PICK, "Same text", "", true);
        ArgumentCaptor<String> keys = ArgumentCaptor.forClass(String.class);
        verify(answerCache, Mockito.times(2)).lookup(eq("user"), keys.capture());
        assertThat(keys.getAllValues().get(0)).isNotEqualTo(keys.getAllValues().get(1));
        // …and a draft keeps the key it always had, so existing cached drafts still hit.
        assertThat(keys.getAllValues().get(0)).isEqualTo(AiAnswerCacheService.questionHash("Same text"));
    }

    @Test
    void cacheHitReturnsWithoutProviderOrQuota() {
        when(provider.isConfigured()).thenReturn(true);
        when(metering.usedThisMonth("user")).thenReturn(1);
        when(answerCache.lookup(anyString(), anyString())).thenReturn(Optional.of("A previously stored answer."));

        AiDraftService.Result r = service.draft("Why us?", "ctx", true);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.OK);
        assertThat(r.answer()).isEqualTo("A previously stored answer.");
        assertThat(r.cached()).isTrue();
        assertThat(r.used()).isEqualTo(1); // current count, unchanged
        verify(provider, never()).generate(any(), anyString(), anyString()); // provider not hit
        verify(metering, never()).record(anyString(), any(), any()); // no quota charged
        verify(answerCache, never()).store(anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void cacheHitIsNotBlockedByQuota() {
        when(provider.isConfigured()).thenReturn(true);
        when(metering.usedThisMonth("user")).thenReturn(PRO_QUOTA); // maxed
        when(answerCache.lookup(anyString(), anyString())).thenReturn(Optional.of("Reused answer."));

        AiDraftService.Result r = service.draft("Why us?", "ctx", true);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.OK); // not QUOTA_EXCEEDED
        assertThat(r.cached()).isTrue();
        verify(provider, never()).generate(any(), anyString(), anyString());
    }

    @Test
    void providerErrorDoesNotConsumeQuota() {
        when(provider.isConfigured()).thenReturn(true);
        when(provider.generate(any(), anyString(), anyString())).thenThrow(new AiProviderException("boom"));

        AiDraftService.Result r = service.draft("Why us?", "ctx", true);
        assertThat(r.status()).isEqualTo(AiDraftService.Status.ERROR);
        verify(metering, never()).record(anyString(), any(), any());
    }

    // ---- the Pro gate (12.4) ------------------------------------------------

    @Test
    void freeWithoutAnOverrideIsProRequired() {
        when(provider.isConfigured()).thenReturn(true);
        when(entitlementService.isPro(anyString())).thenReturn(false);

        AiDraftService.Result r = service.draft("Why us?", "ctx", true);

        assertThat(r.status()).isEqualTo(AiDraftService.Status.PRO_REQUIRED);
        verify(provider, never()).generate(any(), anyString(), anyString());
        verify(metering, never()).record(anyString(), any(), any());
    }

    /**
     * The gate is checked before consent, so a Free user is told the useful thing ("this is Pro")
     * rather than being sent to tick a consent box that still wouldn't let them through.
     */
    @Test
    void proRequiredOutranksMissingConsent() {
        when(provider.isConfigured()).thenReturn(true);
        when(entitlementService.isPro(anyString())).thenReturn(false);

        assertThat(service.draft("Why us?", "ctx", false).status()).isEqualTo(AiDraftService.Status.PRO_REQUIRED);
    }

    /** A hand-granted admin quota IS the entitlement — it opens the gate and sets the quota. */
    @Test
    void freeWithAnOverrideStillDrafts() {
        when(provider.isConfigured()).thenReturn(true);
        when(entitlementService.isPro(anyString())).thenReturn(false);
        AiQuotaOverride override = new AiQuotaOverride();
        override.setLogin("user");
        override.setMonthlyQuota(9);
        when(quotaOverrideRepository.findById("user")).thenReturn(Optional.of(override));
        when(provider.generate(any(), anyString(), anyString())).thenReturn(result("Granted answer."));

        AiDraftService.Result r = service.draft("Why us?", "ctx", true);

        assertThat(r.status()).isEqualTo(AiDraftService.Status.OK);
        assertThat(r.quota()).isEqualTo(9); // the override, not either plan default
    }

    @Test
    void proGetsTheProQuota() {
        when(provider.isConfigured()).thenReturn(true);
        when(provider.generate(any(), anyString(), anyString())).thenReturn(result("Paid answer."));

        AiDraftService.Result r = service.draft("Why us?", "ctx", true);

        assertThat(r.status()).isEqualTo(AiDraftService.Status.OK);
        assertThat(r.quota()).isEqualTo(PRO_QUOTA);
    }
}
