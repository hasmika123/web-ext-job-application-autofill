package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.AiCall;
import com.dossier.api.domain.AppSettingHistory;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AiCallStatRow;
import com.dossier.api.repository.AppSettingHistoryRepository;
import com.dossier.api.service.AdminAiConfigService.CallsView;
import com.dossier.api.service.AdminAiConfigService.ConfigView;
import com.dossier.api.service.AdminAiConfigService.ProviderView;
import com.dossier.api.service.AdminAiConfigService.RouteView;
import com.dossier.api.service.AdminAiConfigService.TestResult;
import com.dossier.api.service.ai.AiEnv;
import com.dossier.api.service.ai.AiErrorKind;
import com.dossier.api.service.ai.AiKeyScrubber;
import com.dossier.api.service.ai.AiPolicy;
import com.dossier.api.service.ai.AiPricing;
import com.dossier.api.service.ai.AiProviderException;
import com.dossier.api.service.ai.AiProviderRegistry;
import com.dossier.api.service.ai.AiRouter;
import com.dossier.api.service.ai.AiRuntimeSettings;
import com.dossier.api.service.ai.AiRuntimeSettings.Source;
import com.dossier.api.service.ai.FakeAdapter;
import com.dossier.api.service.ai.FakeSettings;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

/** The validation matrix of the admin AI config (I1.11): codes, bounds, risk, the in-use check, the test limiter, summaries. */
class AdminAiConfigServiceTest {

    private static final String SECRET = "AIzaSyD-this-is-a-fake-test-key-0123456789";

    /** A clock the test can move. */
    private static final class MutableClock extends Clock {

        Instant now = Instant.parse("2026-10-13T10:00:00Z");

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private FakeSettings fake;
    private AiPolicy policy;
    private FakeAdapter gemini;
    private AiCallRepository calls;
    private AppSettingHistoryRepository history;
    private AdminAuditService audit;
    private MutableClock clock;
    private AdminAiConfigService service;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("boss", "n/a"));
        fake = new FakeSettings();
        policy = new AiPolicy();
        AiPricing pricing = new AiPricing();
        AiRuntimeSettings runtime = new AiRuntimeSettings(fake.settings, new AiEnv(true, "gemini", "https://env.example/v1beta", "env-model", 400, 4000), policy, pricing, fake.mapper);
        gemini = new FakeAdapter("gemini");
        AiProviderRegistry registry = new AiProviderRegistry(List.of(gemini.entry(), new FakeAdapter("openai_compat").entry()), new AiKeyScrubber(List.of(SECRET)));
        AiMeteringService metering = mock(AiMeteringService.class);
        AiRouter router = new AiRouter(registry, runtime, metering, pricing, new SimpleMeterRegistry(), "env-model");
        calls = mock(AiCallRepository.class);
        history = mock(AppSettingHistoryRepository.class);
        audit = mock(AdminAuditService.class);
        AdminSettingsWriter writer = new AdminSettingsWriter(fake.repository, history, audit, fake.settings, fake.mapper, event -> {});
        clock = new MutableClock();
        service = new AdminAiConfigService(runtime, writer, registry, router, pricing, calls, history, audit, fake.mapper, clock);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static Map<String, Object> body(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    @SuppressWarnings("unchecked")
    private static List<String> tasksOf(AiConfigException e) {
        return (List<String>) e.getExtra().get("tasks");
    }

    private static void code(Runnable r, String code) {
        assertThatThrownBy(r::run).isInstanceOfSatisfying(AiConfigException.class, e -> assertThat(e.getCode()).isEqualTo(code));
    }

    // ---- GET /config ----------------------------------------------------------

    @Test
    void theConfigListsEveryTaskButProbeInEnumOrderWithProvenance() {
        ConfigView c = service.config();
        assertThat(c.envMasterEnabled()).isTrue();
        assertThat(c.routes()).extracting(RouteView::task).doesNotContain("probe").startsWith("draft", "pick", "map", "enrich", "parse");
        assertThat(c.routes()).hasSize(com.dossier.api.service.ai.AiTask.values().length - 1);
        RouteView parse = c.routes().stream().filter(r -> r.task().equals("parse")).findFirst().orElseThrow();
        assertThat(parse.label()).isEqualTo("Resume parsing");
        assertThat(parse.risk()).isEqualTo("HIGH");
        assertThat(parse.model().value()).isEqualTo("env-model");
        assertThat(parse.model().source()).isEqualTo(Source.ENV);
        assertThat(parse.model().envDefault()).isEqualTo("env-model");
        assertThat(parse.model().codeDefault()).isEqualTo("");
        assertThat(parse.maxOutputTokens().value()).isEqualTo(4000);
        assertThat(parse.fallbackProvider().value()).isEqualTo("none");
        assertThat(parse.enabled().value()).isTrue();
        assertThat(c.global().enabled().value()).isTrue();
        assertThat(c.economy().softCapPct().value()).isEqualTo(80);
        assertThat(c.limits().testPerHour().value()).isEqualTo(30);
        assertThat(c.limits().callsWindowHours().value()).isEqualTo(24);
    }

    @Test
    void aProviderIsDescribedByKeyPresenceAndEnvVarNameNeverTheKey() throws Exception {
        ProviderView p = service.config().providers().get(0);
        assertThat(p.id()).isEqualTo("gemini");
        assertThat(p.keyPresent()).isTrue();
        assertThat(p.keyRequired()).isTrue();
        assertThat(p.keyEnvVar()).isEqualTo("DOSSIER_AI_GEMINI_ENV");
        assertThat(p.usedByTasks()).contains("parse", "draft").doesNotContain("probe");
        assertThat(p.baseUrl().value()).isEqualTo("https://env.example/v1beta");
        assertThat(p.baseUrl().source()).isEqualTo(Source.ENV);
        assertThat(p.timeoutMs().value()).isEqualTo(30000);
        assertThat(p.models().value()).contains("gemini-2.5-flash-lite");
        assertThat(p.lastProbe()).isNull();
        String json = fake.mapper.writeValueAsString(service.config());
        assertThat(json).doesNotContain(SECRET).doesNotContain("apiKey").doesNotContain("\"key\"");
    }

    @Test
    void theLastProbeComesFromTheLedger() {
        AiCall probe = new AiCall();
        probe.setTask("probe");
        probe.setProvider("gemini");
        probe.setModel("gemini-2.5-flash-lite-001");
        probe.setLatencyMs(412);
        probe.setInputTokens(9);
        probe.setOutputTokens(1);
        probe.setSuccess(true);
        when(calls.findFirstByTaskAndProviderOrderByIdDesc("probe", "gemini")).thenReturn(Optional.of(probe));
        AdminAiConfigService.LastProbe last = service.config().providers().get(0).lastProbe();
        assertThat(last.ok()).isTrue();
        assertThat(last.latencyMs()).isEqualTo(412);
        assertThat(last.model()).isEqualTo("gemini-2.5-flash-lite-001");
        assertThat(last.inputTokens()).isEqualTo(9);
    }

    @Test
    void pricesAreTheCodeDefaultsPlusWhatTheAdminAdded() {
        assertThat(service.config().prices()).extracting(AdminAiConfigService.PriceView::model).contains("gemini-2.5-flash-lite", "gemini-2.5-flash");
        AdminAiConfigService.PriceView flashLite = service.config().prices().stream().filter(p -> p.model().equals("gemini-2.5-flash-lite")).findFirst().orElseThrow();
        assertThat(flashLite.inputPerMtokMicros().value()).isEqualTo(100_000);
        assertThat(flashLite.outputPerMtokMicros().value()).isEqualTo(400_000);
        assertThat(flashLite.inputPerMtokMicros().source()).isEqualTo(Source.DEFAULT);
        assertThat(flashLite.custom()).isFalse();
        assertThat(flashLite.builtin()).isTrue();

        service.putPrice("qwen3:8b", body("inputPerMtokMicros", 0, "cachedPerMtokMicros", 0, "outputPerMtokMicros", 0));
        AdminAiConfigService.PriceView qwen = service.config().prices().stream().filter(p -> p.model().equals("qwen3:8b")).findFirst().orElseThrow();
        assertThat(qwen.inputPerMtokMicros().source()).isEqualTo(Source.DB);
        assertThat(qwen.custom()).isTrue();
        assertThat(qwen.builtin()).isFalse();
    }

    // ---- routes ---------------------------------------------------------------

    @Test
    void aRoutePatchWritesRowsAndReportsDbProvenance() {
        RouteView r = service.patchRoute("parse", body("model", "gemini-2.5-flash", "maxOutputTokens", 5000));
        assertThat(r.model().value()).isEqualTo("gemini-2.5-flash");
        assertThat(r.model().source()).isEqualTo(Source.DB);
        assertThat(r.model().envDefault()).isEqualTo("env-model");
        assertThat(r.maxOutputTokens().value()).isEqualTo(5000);
        assertThat(fake.row("ai.route.parse.model")).contains("gemini-2.5-flash");
        verify(audit, org.mockito.Mockito.times(2)).record(eq(AdminAuditService.AI_CONFIG_CHANGE), eq(AdminAuditService.TARGET_AI_SETTING), anyString(), any(), anyString());
    }

    @Test
    void nullClearsARowAndBlankModelsMeanInherit() {
        service.patchRoute("map", body("model", "gemini-2.5-flash"));
        RouteView cleared = service.patchRoute("map", body("model", null));
        assertThat(cleared.model().source()).isEqualTo(Source.ENV);
        service.patchRoute("map", body("model", "gemini-2.5-flash"));
        assertThat(service.patchRoute("map", body("model", "  ")).model().source()).isEqualTo(Source.ENV);
    }

    @Test
    void deletingARouteRemovesAllItsRows() {
        service.patchRoute("map", body("model", "gemini-2.5-flash", "maxOutputTokens", 500, "enabled", false));
        RouteView r = service.deleteRoute("map");
        assertThat(r.model().source()).isEqualTo(Source.ENV);
        assertThat(r.maxOutputTokens().source()).isEqualTo(Source.ENV);
        assertThat(r.enabled().value()).isTrue();
        assertThat(fake.rows).isEmpty();
    }

    @Test
    void routeValidationCodes() {
        code(() -> service.patchRoute("nope", body("model", "gemini-2.5-flash")), "AI_CONFIG_UNKNOWN_KEY");
        code(() -> service.patchRoute("probe", body("model", "gemini-2.5-flash")), "AI_CONFIG_UNKNOWN_KEY");
        code(() -> service.patchRoute("map", body("colour", "red")), "AI_CONFIG_UNKNOWN_KEY");
        code(() -> service.patchRoute("map", body("model", "has space")), "AI_MODEL_INVALID");
        code(() -> service.patchRoute("map", body("maxOutputTokens", 10)), "AI_CONFIG_OUT_OF_BOUNDS");
        code(() -> service.patchRoute("map", body("maxOutputTokens", 99999)), "AI_CONFIG_OUT_OF_BOUNDS");
        code(() -> service.patchRoute("map", body("maxOutputTokens", "lots")), "AI_CONFIG_OUT_OF_BOUNDS");
        code(() -> service.patchRoute("map", body("maxOutputTokens", 500.5)), "AI_CONFIG_OUT_OF_BOUNDS");
        code(() -> service.patchRoute("map", body("enabled", "yes")), "AI_CONFIG_OUT_OF_BOUNDS");
        code(() -> service.patchRoute("map", body("provider", "mystery")), "AI_PROVIDER_UNKNOWN");
        code(() -> service.patchRoute("map", body("fallbackProvider", "mystery")), "AI_PROVIDER_UNKNOWN");
        assertThat(fake.rows).isEmpty();
    }

    @Test
    void routingToAProviderWithoutAKeyIs409() {
        gemini.configured = false;
        assertThatThrownBy(() -> service.patchRoute("map", body("provider", "gemini")))
            .isInstanceOfSatisfying(AiConfigException.class, e -> {
                assertThat(e.getCode()).isEqualTo("AI_PROVIDER_NOT_CONFIGURED");
                assertThat(e.getStatus()).isEqualTo(409);
                assertThat(e.getExtra()).containsEntry("provider", "gemini").containsKey("keyEnvVar");
            });
        service.patchRoute("map", body("fallbackProvider", "none")); // "none" needs no provider
    }

    @Test
    void turningParseOffNeedsAReasonButOtherTasksDoNot() {
        code(() -> service.patchRoute("parse", body("enabled", false)), "AI_CONFIG_REASON_REQUIRED");
        service.patchRoute("pick", body("enabled", false)); // MEDIUM: no reason
        RouteView off = service.patchRoute("parse", body("enabled", false, "reason", "Gemini 5xx spike"));
        assertThat(off.enabled().value()).isFalse();
        assertThat(off.enabled().source()).isEqualTo(Source.DB);
        service.patchRoute("parse", body("enabled", true)); // turning ON never needs one
    }

    // ---- global ---------------------------------------------------------------

    @Test
    void theGlobalSwitchOffNeedsAReason() {
        code(() -> service.patchGlobal(body("enabled", false)), "AI_CONFIG_REASON_REQUIRED");
        code(() -> service.patchGlobal(body("reason", "x")), "AI_CONFIG_UNKNOWN_KEY");
        assertThat(service.patchGlobal(body("enabled", false, "reason", "cost spike")).enabled().value()).isFalse();
        assertThat(service.patchGlobal(body("enabled", null)).enabled().source()).as("null clears the row").isEqualTo(Source.DEFAULT);
    }

    // ---- providers ------------------------------------------------------------

    @Test
    void disablingAProviderRoutesStillUseIs409WithTheTaskListUnlessForced() {
        assertThatThrownBy(() -> service.patchProvider("gemini", body("enabled", false, "reason", "outage")))
            .isInstanceOfSatisfying(AiConfigException.class, e -> {
                assertThat(e.getCode()).isEqualTo("AI_PROVIDER_IN_USE");
                assertThat(e.getStatus()).isEqualTo(409);
                assertThat(tasksOf(e)).contains("parse", "draft");
            });
        assertThat(fake.rows).isEmpty();
        code(() -> service.patchProvider("gemini", body("enabled", false, "force", true)), "AI_CONFIG_REASON_REQUIRED");
        ProviderView off = service.patchProvider("gemini", body("enabled", false, "force", true, "reason", "outage"));
        assertThat(off.enabled().value()).isFalse();
        assertThat(off.enabled().source()).isEqualTo(Source.DB);
    }

    @Test
    void aProviderIsNotInUseWhereARouteHasAFallback() {
        // Only the tasks WITHOUT a fallback to ANOTHER provider are named.
        service.patchRoute("parse", body("fallbackProvider", "openai_compat"));
        assertThatThrownBy(() -> service.patchProvider("gemini", body("enabled", false, "reason", "r")))
            .isInstanceOfSatisfying(AiConfigException.class, e -> assertThat(tasksOf(e)).doesNotContain("parse").contains("draft"));
    }

    @Test
    void providerFieldValidation() {
        code(() -> service.patchProvider("nope", body("enabled", true)), "AI_PROVIDER_UNKNOWN");
        code(() -> service.patchProvider("gemini", body("baseUrl", "http://example.com/v1")), "AI_URL_INVALID");
        code(() -> service.patchProvider("gemini", body("timeoutMs", 10)), "AI_CONFIG_OUT_OF_BOUNDS");
        code(() -> service.patchProvider("gemini", body("timeoutMs", 999999)), "AI_CONFIG_OUT_OF_BOUNDS");
        code(() -> service.patchProvider("gemini", body("models", List.of("ok-model", "has space"))), "AI_CONFIG_OUT_OF_BOUNDS");
        code(() -> service.patchProvider("gemini", body("models", "not-a-list")), "AI_CONFIG_OUT_OF_BOUNDS");
        code(() -> service.patchProvider("gemini", body("apiKey", "AIza-should-never-be-accepted")), "AI_CONFIG_UNKNOWN_KEY");
        ProviderView ok = service.patchProvider(
            "gemini",
            body("baseUrl", "https://proxy.example/v1beta", "timeoutMs", 20000, "models", List.of("gemini-2.5-flash", "gemini-2.5-flash-lite"))
        );
        assertThat(ok.baseUrl().value()).isEqualTo("https://proxy.example/v1beta");
        assertThat(ok.baseUrl().source()).isEqualTo(Source.DB);
        assertThat(ok.timeoutMs().value()).isEqualTo(20000);
        assertThat(ok.models().value()).containsExactly("gemini-2.5-flash", "gemini-2.5-flash-lite");
        assertThat(service.patchProvider("gemini", body("baseUrl", null)).baseUrl().source()).isEqualTo(Source.ENV);
    }

    // ---- prices ---------------------------------------------------------------

    @Test
    void priceValidation() {
        code(() -> service.putPrice("has space", body("inputPerMtokMicros", 1, "cachedPerMtokMicros", 1, "outputPerMtokMicros", 1)), "AI_MODEL_INVALID");
        code(() -> service.putPrice("m1", body("inputPerMtokMicros", 1, "cachedPerMtokMicros", 1)), "AI_CONFIG_OUT_OF_BOUNDS");
        code(() -> service.putPrice("m1", body("inputPerMtokMicros", -1, "cachedPerMtokMicros", 1, "outputPerMtokMicros", 1)), "AI_CONFIG_OUT_OF_BOUNDS");
        code(() -> service.putPrice("m1", body("inputPerMtokMicros", 100_000_001, "cachedPerMtokMicros", 1, "outputPerMtokMicros", 1)), "AI_CONFIG_OUT_OF_BOUNDS");
        code(() -> service.putPrice("m1", body("inputPerMtokMicros", 1, "cachedPerMtokMicros", 1, "outputPerMtokMicros", 1, "fee", 2)), "AI_CONFIG_UNKNOWN_KEY");
        code(() -> service.deletePrice("has space"), "AI_MODEL_INVALID");
    }

    @Test
    void deletingAPriceGoesBackToTheCodeDefaultOrGone() {
        service.putPrice("gemini-2.5-flash-lite", body("inputPerMtokMicros", 1, "cachedPerMtokMicros", 2, "outputPerMtokMicros", 3));
        AdminAiConfigService.PriceView back = service.deletePrice("gemini-2.5-flash-lite");
        assertThat(back.custom()).isFalse();
        assertThat(back.builtin()).isTrue();
        assertThat(back.inputPerMtokMicros().value()).isEqualTo(100_000);

        service.putPrice("qwen3:8b", body("inputPerMtokMicros", 0, "cachedPerMtokMicros", 0, "outputPerMtokMicros", 0));
        AdminAiConfigService.PriceView gone = service.deletePrice("qwen3:8b");
        assertThat(gone.custom()).isFalse();
        assertThat(gone.builtin()).isFalse();
    }

    // ---- test connection ------------------------------------------------------

    @Test
    void aTestRunsTheProbeAndAuditsIt() {
        TestResult t = service.test("gemini", null);
        assertThat(t.ok()).isTrue();
        assertThat(t.model()).isEqualTo("fake-default-001");
        assertThat(t.inputTokens()).isEqualTo(9);
        assertThat(t.outputTokens()).isEqualTo(1);
        assertThat(t.error()).isNull();
        verify(audit).record(eq(AdminAuditService.AI_PROVIDER_TEST), eq(AdminAuditService.TARGET_AI_PROVIDER), eq("gemini"), isNull(), anyString());
    }

    @Test
    void aFailedTestStillReturnsWithAScrubbedError() {
        gemini.failure = new AiProviderException("bad " + SECRET, AiErrorKind.TRANSPORT);
        TestResult t = service.test("gemini", "gemini-2.5-flash");
        assertThat(t.ok()).isFalse();
        assertThat(t.error().kind()).isEqualTo("TRANSPORT");
        assertThat(t.error().message()).doesNotContain(SECRET).hasSizeLessThanOrEqualTo(200);
    }

    @Test
    void testValidation() {
        code(() -> service.test("nope", null), "AI_PROVIDER_UNKNOWN");
        code(() -> service.test("gemini", "has space"), "AI_MODEL_INVALID");
        gemini.configured = false;
        code(() -> service.test("gemini", null), "AI_PROVIDER_NOT_CONFIGURED");
        assertThat(gemini.calls).isEmpty();
    }

    @Test
    void theHourlyLimitIsPerAdminAndSlides() {
        fake.put("ai.admin.test_per_hour", "3");
        for (int i = 0; i < 3; i++) {
            service.test("gemini", null);
            clock.now = clock.now.plusSeconds(60);
        }
        assertThatThrownBy(() -> service.test("gemini", null))
            .isInstanceOfSatisfying(AiConfigException.class, e -> {
                assertThat(e.getCode()).isEqualTo("AI_TEST_RATE_LIMITED");
                assertThat(e.getStatus()).isEqualTo(429);
                // The oldest run was 180 s ago, so a slot frees in ~3420 s.
                assertThat((Integer) e.getExtra().get("retryAfterSeconds")).isBetween(3400, 3430);
            });
        assertThat(gemini.calls).hasSize(3);

        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("other-admin", "n/a"));
        service.test("gemini", null); // another admin has their own window
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("boss", "n/a"));

        clock.now = clock.now.plusSeconds(3500);
        service.test("gemini", null); // the first runs aged out
    }

    @Test
    void refusedTestsDoNotConsumeTheLimit() {
        fake.put("ai.admin.test_per_hour", "1");
        code(() -> service.test("gemini", "has space"), "AI_MODEL_INVALID");
        gemini.configured = false;
        code(() -> service.test("gemini", null), "AI_PROVIDER_NOT_CONFIGURED");
        gemini.configured = true;
        assertThat(service.test("gemini", null).ok()).isTrue();
    }

    // ---- calls and history ----------------------------------------------------

    private AiCall call(long id, boolean success, int latency) {
        AiCall c = new AiCall();
        ReflectionTestUtils.setField(c, "id", id);
        c.setTask("parse");
        c.setProvider("gemini");
        c.setModel("m");
        c.setSuccess(success);
        c.setLatencyMs(latency);
        c.setErrorKind(success ? null : "TIMEOUT");
        return c;
    }

    @Test
    void callsSummariseTheWindowAndPage() {
        when(calls.summarize(any(), eq(""), eq(""))).thenReturn(new AiCallStatRow.Totals(4L, 1L, 2500L));
        when(calls.latencies(any(), eq(""), eq("")))
            .thenReturn(List.of(new AiCallStatRow.Latency("gemini", 100), new AiCallStatRow.Latency("gemini", 200), new AiCallStatRow.Latency("gemini", 300), new AiCallStatRow.Latency("gemini", 5000)));
        when(calls.summarizeByProvider(any(), eq(""), eq(""))).thenReturn(List.of(new AiCallStatRow.Group("gemini", 4L, 1L, 2500L)));
        when(calls.recent(any(), eq(""), eq(""), eq(false), eq(Long.MAX_VALUE), any(Pageable.class)))
            .thenReturn(List.of(call(9, true, 100), call(8, false, 5000), call(7, true, 200)));

        CallsView v = service.calls(null, null, null, false, 2, null);
        assertThat(v.summary().calls()).isEqualTo(4);
        assertThat(v.summary().failed()).isEqualTo(1);
        assertThat(v.summary().failedPct()).isEqualTo(25.0);
        assertThat(v.summary().p95LatencyMs()).isEqualTo(5000);
        assertThat(v.summary().costMicros()).isEqualTo(2500);
        assertThat(v.summary().byProvider()).hasSize(1);
        assertThat(v.summary().byProvider().get(0).p95LatencyMs()).isEqualTo(5000);
        assertThat(v.rows()).hasSize(2);
        assertThat(v.rows().get(1).errorKind()).isEqualTo("TIMEOUT");
        assertThat(v.nextBefore()).as("more rows exist: the cursor is the last returned id").isEqualTo(8L);
    }

    @Test
    void anEmptyWindowIsZeroesNotNulls() {
        when(calls.summarize(any(), anyString(), anyString())).thenReturn(new AiCallStatRow.Totals(0L, 0L, 0L));
        when(calls.recent(any(), anyString(), anyString(), anyBoolean(), anyLong(), any(Pageable.class))).thenReturn(List.of());
        CallsView v = service.calls(24, "parse", "gemini", true, null, 55L);
        assertThat(v.summary().calls()).isZero();
        assertThat(v.summary().failedPct()).isZero();
        assertThat(v.summary().p95LatencyMs()).isZero();
        assertThat(v.rows()).isEmpty();
        assertThat(v.nextBefore()).isNull();
        code(() -> service.calls(24, "nonsense", null, false, null, null), "AI_CONFIG_UNKNOWN_KEY");
    }

    @Test
    void p95IsNearestRank() {
        assertThat(AdminAiConfigService.p95(List.of())).isZero();
        assertThat(AdminAiConfigService.p95(List.of(7))).isEqualTo(7);
        List<Integer> hundred = new java.util.ArrayList<>();
        for (int i = 1; i <= 100; i++) hundred.add(i);
        assertThat(AdminAiConfigService.p95(hundred)).isEqualTo(95);
    }

    @Test
    void historyIsNewestFirstAndAKeyFilterCanonicalisesAliases() {
        AppSettingHistory h = new AppSettingHistory("ai.route.parse.model", null, "gemini-2.5-flash", "boss", "why", Instant.parse("2026-10-13T10:00:00Z"));
        when(history.findByKeyStartingWithOrderByIdDesc(eq("ai."), any(Pageable.class))).thenReturn(List.of(h));
        when(history.findByKeyOrderByIdDesc(eq("ai.route.rewrite.max_output_tokens"), any(Pageable.class))).thenReturn(List.of());
        assertThat(service.history(null, null)).hasSize(1);
        assertThat(service.history("", 10).get(0).actorLogin()).isEqualTo("boss");
        assertThat(service.history("ai.output_tokens_max.rewrite", 10)).isEmpty();
        verify(history).findByKeyOrderByIdDesc(eq("ai.route.rewrite.max_output_tokens"), any(Pageable.class));
    }
}
