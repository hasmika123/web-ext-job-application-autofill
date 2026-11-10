package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.AiQuotaOverride;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AiQuotaOverrideRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.service.AiBudgetService.Decision;
import com.dossier.api.service.AiBudgetService.Verdict;
import com.dossier.api.service.ai.AiEnv;
import com.dossier.api.service.ai.AiPolicy;
import com.dossier.api.service.ai.AiRuntimeSettings;
import com.dossier.api.service.ai.AiTask;
import com.dossier.api.service.ai.FakeSettings;
import com.dossier.api.service.billing.StripeProperties;
import com.dossier.api.service.entitlement.EntitlementSet;
import com.dossier.api.service.entitlement.EntitlementSet.AiBudgetWindow;
import com.dossier.api.service.entitlement.EntitlementSet.SubscriptionState;
import com.dossier.api.service.entitlement.ShadowComparator;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** K7.2: the AI budget window follows the resolved plan version once the shadow is off, and is only compared while it is on. */
class AiBudgetPeriodTest {

    private AiQuotaOverrideRepository overrides;
    private EntitlementService entitlement;
    private AiCallRepository calls;
    private ShadowComparator shadow;
    private AiBudgetService service;

    @BeforeEach
    void setUp() {
        AiPolicy policy = new AiPolicy();
        AiRuntimeSettings runtime = new FakeSettings().runtime(new AiEnv(true, "gemini", "", "m", 400, 4000), policy);
        overrides = mock(AiQuotaOverrideRepository.class);
        entitlement = mock(EntitlementService.class);
        calls = mock(AiCallRepository.class);
        shadow = mock(ShadowComparator.class);
        service = new AiBudgetService(policy, runtime, overrides, entitlement, calls, mock(AiMeteringService.class), mock(SubscriptionRepository.class), new StripeProperties(), mock(DemoAiCap.class), 3);
        service.setShadowComparator(shadow);
        when(entitlement.isPro("u")).thenReturn(true);
    }

    private static EntitlementSet set(long cents) {
        Instant now = Instant.now();
        return new EntitlementSet("PRO", 2L, "QUARTER", now.minusSeconds(86_400), now.plusSeconds(86_400 * 80), Map.of(), Set.of("ai.server"), Map.of(),
            new AiBudgetWindow(cents, now.minusSeconds(86_400), now.plusSeconds(86_400 * 80), "QUARTER"), SubscriptionState.ACTIVE);
    }

    @Test
    void withTheShadowOnTheLegacyWindowDecidesAndTheResolvedBudgetIsCompared() {
        when(shadow.shadowOn()).thenReturn(true);
        when(shadow.resolve("u")).thenReturn(Optional.of(set(800)));
        Decision d = service.decide("u", AiTask.DRAFT);
        assertThat(d.verdict()).isEqualTo(Verdict.OK);
        // legacy: no subscription row, so the calendar-month fallback at the default $3 monthly budget = 300 cents
        verify(shadow).compareAiBudgetCents("u", 300L, 800L);
    }

    @Test
    void withTheShadowOffTheResolvedBudgetDecides() {
        when(shadow.shadowOn()).thenReturn(false);
        when(shadow.resolve("u")).thenReturn(Optional.of(set(800)));
        when(calls.costSince(eq("u"), any(Instant.class))).thenReturn(4_000_000L); // $4 of an $8 pool
        Decision d = service.decide("u", AiTask.DRAFT);
        assertThat(d.used()).as("50 percent of the quarterly pool, not 133 percent of the monthly one").isEqualTo(50);
        assertThat(d.verdict()).isEqualTo(Verdict.OK);
        when(calls.costSince(eq("u"), any(Instant.class))).thenReturn(8_000_000L);
        assertThat(service.decide("u", AiTask.DRAFT).verdict()).isEqualTo(Verdict.EXHAUSTED);
    }

    @Test
    void creditsRaiseTheResolvedBudget() {
        when(shadow.shadowOn()).thenReturn(false);
        when(shadow.resolve("u")).thenReturn(Optional.of(set(450)));
        when(calls.costSince(eq("u"), any(Instant.class))).thenReturn(1_800_000L); // $1.80 of $4.50 = 40 percent
        assertThat(service.decide("u", AiTask.DRAFT).used()).isEqualTo(40);
    }

    @Test
    void anAdminOverrideStillOutranksTheResolvedWindow() {
        when(shadow.shadowOn()).thenReturn(false);
        when(shadow.resolve("u")).thenReturn(Optional.of(set(800)));
        AiQuotaOverride o = new AiQuotaOverride();
        o.setLogin("u");
        o.setMonthlyBudgetCents(100);
        when(overrides.findById("u")).thenReturn(Optional.of(o));
        when(calls.costSince(eq("u"), any(Instant.class))).thenReturn(500_000L); // $0.50 of the $1 override
        assertThat(service.decide("u", AiTask.DRAFT).used()).isEqualTo(50);
    }

    @Test
    void whenTheResolverCannotAnswerTheLegacyWindowStands() {
        when(shadow.shadowOn()).thenReturn(false);
        when(shadow.resolve("u")).thenReturn(Optional.empty());
        when(calls.costSince(eq("u"), any(Instant.class))).thenReturn(1_500_000L); // $1.50 of the legacy $3
        assertThat(service.decide("u", AiTask.DRAFT).used()).isEqualTo(50);
    }
}
