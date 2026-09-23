package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.AiQuotaOverride;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AiQuotaOverrideRepository;
import com.dossier.api.service.AiBudgetService.Decision;
import com.dossier.api.service.AiBudgetService.Verdict;
import com.dossier.api.service.ai.AiPolicy;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiTask;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

/**
 * The spending rules (Phase 13.1b), one decision per call: the kill switch, the Pro gate, the Free
 * parse count, the cost budget with its soft cap and economy model, and the admin override that
 * outranks the plan. Mocks only — no DB, no provider.
 */
class AiBudgetServiceTest {

    private static final String DEFAULT_MODEL = "gemini-2.5-flash-lite";
    private static final long FIVE_DOLLARS = 5_000_000L;
    private static final int FREE_PARSES = 3;

    private AiPolicy policy;
    private AiProvider provider;
    private AiQuotaOverrideRepository overrides;
    private EntitlementService entitlement;
    private AiCallRepository calls;
    private AiMeteringService metering;
    private AiBudgetService service;

    @BeforeEach
    void setUp() {
        policy = new AiPolicy(); // $5, soft cap 80 %, no economy model, nothing disabled
        provider = Mockito.mock(AiProvider.class);
        when(provider.defaultModel()).thenReturn(DEFAULT_MODEL);
        overrides = Mockito.mock(AiQuotaOverrideRepository.class); // no override by default
        entitlement = Mockito.mock(EntitlementService.class);
        calls = Mockito.mock(AiCallRepository.class);
        metering = Mockito.mock(AiMeteringService.class);
        service = new AiBudgetService(policy, provider, overrides, entitlement, calls, metering, FREE_PARSES);
    }

    private void pro() {
        when(entitlement.isPro("u")).thenReturn(true);
    }

    private void spent(long micros) {
        when(calls.costSince(eq("u"), any(Instant.class))).thenReturn(micros);
    }

    private void override(int cents) {
        AiQuotaOverride o = new AiQuotaOverride();
        o.setLogin("u");
        o.setMonthlyBudgetCents(cents);
        when(overrides.findById("u")).thenReturn(Optional.of(o));
    }

    // ---- who may use it at all ----------------------------------------------------------------

    @Test
    void aFreeUserNeedsProForEverythingButParsing() {
        for (AiTask t : new AiTask[] { AiTask.DRAFT, AiTask.PICK, AiTask.MAP, AiTask.ENRICH }) {
            assertThat(service.decide("u", t).verdict()).isEqualTo(Verdict.PRO_REQUIRED);
        }
        assertThat(service.decide("u", AiTask.PARSE).verdict()).isEqualTo(Verdict.OK);
    }

    @Test
    void freeParsesAreCountedNotBudgeted() {
        when(metering.usedThisMonth("u")).thenReturn(FREE_PARSES - 1);
        Decision ok = service.decide("u", AiTask.PARSE);
        assertThat(ok.verdict()).isEqualTo(Verdict.OK);
        assertThat(ok.budgeted()).isFalse();
        assertThat(ok.used()).isEqualTo(FREE_PARSES - 1);
        assertThat(ok.limit()).isEqualTo(FREE_PARSES);

        when(metering.usedThisMonth("u")).thenReturn(FREE_PARSES);
        assertThat(service.decide("u", AiTask.PARSE).verdict()).isEqualTo(Verdict.EXHAUSTED);
    }

    @Test
    void theKillSwitchStopsATaskForEveryone() {
        pro();
        policy.setDisabledTasks(Set.of(" Enrich ", "pick"));
        assertThat(service.decide("u", AiTask.ENRICH).verdict()).isEqualTo(Verdict.TASK_DISABLED);
        assertThat(service.decide("u", AiTask.PICK).verdict()).isEqualTo(Verdict.TASK_DISABLED);
        assertThat(service.decide("u", AiTask.DRAFT).verdict()).isEqualTo(Verdict.OK);
        // …including the free exception, and a Free user doesn't get "upgrade" for a switched-off feature.
        policy.setDisabledTasks(Set.of("parse", "draft"));
        when(entitlement.isPro("u")).thenReturn(false);
        assertThat(service.decide("u", AiTask.PARSE).verdict()).isEqualTo(Verdict.TASK_DISABLED);
        assertThat(service.decide("u", AiTask.DRAFT).verdict()).isEqualTo(Verdict.TASK_DISABLED);
    }

    // ---- the Pro budget ---------------------------------------------------------------------

    @Test
    void proIsMeteredAsAPercentOfTheBudget() {
        pro();
        spent(FIVE_DOLLARS / 4);
        Decision d = service.decide("u", AiTask.DRAFT);
        assertThat(d.verdict()).isEqualTo(Verdict.OK);
        assertThat(d.budgeted()).isTrue();
        assertThat(d.used()).isEqualTo(25);
        assertThat(d.limit()).isEqualTo(100);
        assertThat(d.model()).isEqualTo(DEFAULT_MODEL);
        assertThat(d.economy()).isFalse();
    }

    @Test
    void eachTaskRunsOnItsRoutedModel() {
        pro();
        policy.getModels().put("draft", "gemini-2.5-flash");
        policy.getModels().put("map", "  ");
        assertThat(service.decide("u", AiTask.DRAFT).model()).isEqualTo("gemini-2.5-flash");
        assertThat(service.decide("u", AiTask.MAP).model()).as("blank = the default model").isEqualTo(DEFAULT_MODEL);
        assertThat(service.decide("u", AiTask.PICK).model()).isEqualTo(DEFAULT_MODEL);
    }

    @Test
    void pastTheSoftCapEverythingMovesToTheEconomyModel() {
        pro();
        policy.getModels().put("draft", "gemini-2.5-flash");
        policy.setEconomyModel("gemini-2.5-flash-lite");
        spent(FIVE_DOLLARS * 79 / 100);
        assertThat(service.decide("u", AiTask.DRAFT).model()).isEqualTo("gemini-2.5-flash");
        spent(FIVE_DOLLARS * 80 / 100);
        Decision d = service.decide("u", AiTask.DRAFT);
        assertThat(d.model()).isEqualTo("gemini-2.5-flash-lite");
        assertThat(d.economy()).isTrue();
    }

    @Test
    void withNoEconomyModelTheSoftCapChangesNothing() {
        pro();
        spent(FIVE_DOLLARS * 95 / 100);
        Decision d = service.decide("u", AiTask.DRAFT);
        assertThat(d.verdict()).isEqualTo(Verdict.OK);
        assertThat(d.model()).isEqualTo(DEFAULT_MODEL);
        assertThat(d.economy()).isFalse();
    }

    @Test
    void atTheBudgetAiStopsUntilTheMonthResets() {
        pro();
        spent(FIVE_DOLLARS);
        Decision d = service.decide("u", AiTask.DRAFT);
        assertThat(d.verdict()).isEqualTo(Verdict.EXHAUSTED);
        assertThat(d.used()).isEqualTo(100);
        ZonedDateTime reset = d.resetsAt().atZone(ZoneOffset.UTC);
        assertThat(reset.getDayOfMonth()).isEqualTo(1);
        assertThat(reset.getHour()).isZero();
        assertThat(d.resetsAt()).isAfter(Instant.now());
        spent(FIVE_DOLLARS * 3); // over, e.g. one expensive last call — still just 100 %
        assertThat(service.decide("u", AiTask.PARSE).used()).isEqualTo(100);
    }

    @Test
    void theBudgetIsConfigurable() {
        pro();
        policy.setProMonthlyBudgetUsd(10.0);
        spent(FIVE_DOLLARS);
        assertThat(service.decide("u", AiTask.DRAFT).used()).isEqualTo(50);
    }

    // ---- the admin override (a budget, outranking the plan) --------------------------------

    @Test
    void anOverrideGivesAFreeUserABudget() {
        override(100); // $1.00
        spent(500_000L); // $0.50
        Decision d = service.decide("u", AiTask.DRAFT);
        assertThat(d.verdict()).isEqualTo(Verdict.OK);
        assertThat(d.budgeted()).isTrue();
        assertThat(d.used()).isEqualTo(50);
    }

    @Test
    void anOverrideReplacesTheProBudget() {
        pro();
        override(1000); // $10
        spent(FIVE_DOLLARS);
        assertThat(service.decide("u", AiTask.DRAFT).used()).isEqualTo(50);
    }

    @Test
    void aZeroOverrideMeansNoServerAi() {
        pro();
        override(0);
        spent(0);
        assertThat(service.decide("u", AiTask.DRAFT).verdict()).isEqualTo(Verdict.EXHAUSTED);
        assertThat(service.decide("u", AiTask.PARSE).verdict()).isEqualTo(Verdict.EXHAUSTED);
    }

    @Test
    void percentIsClampedAndSafe() {
        assertThat(AiBudgetService.percent(0, FIVE_DOLLARS)).isZero();
        assertThat(AiBudgetService.percent(FIVE_DOLLARS * 2, FIVE_DOLLARS)).isEqualTo(100);
        assertThat(AiBudgetService.percent(1, 0)).isEqualTo(100);
        assertThat(AiBudgetService.centsToMicros(500)).isEqualTo(FIVE_DOLLARS);
        assertThat(AiBudgetService.monthStart()).isBefore(AiBudgetService.resetsAt());
    }
}
