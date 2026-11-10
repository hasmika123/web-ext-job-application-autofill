package com.dossier.api.service.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.dossier.api.service.AiMeteringService;
import com.dossier.api.service.ai.AiRouter.ProbeResult;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Route per task, the model argument, disabled paths, the fallback matrix, stamping and the probe (I1.10). */
class AiRouterTest {

    private static final String SECRET = "AIzaSyD-this-is-a-fake-test-key-0123456789";

    private FakeSettings fake;
    private AiPolicy policy;
    private AiRuntimeSettings runtime;
    private FakeAdapter gemini;
    private FakeAdapter other;
    private AiMeteringService metering;
    private AiRouter router;

    @BeforeEach
    void setUp() {
        fake = new FakeSettings();
        policy = new AiPolicy();
        AiEnv env = new AiEnv(true, "gemini", "https://env.example/v1beta", "env-model", 400, 4000);
        runtime = fake.runtime(env, policy);
        gemini = new FakeAdapter("gemini");
        other = new FakeAdapter("openai_compat");
        other.defaultModel = "other-default";
        metering = mock(AiMeteringService.class);
        AiProviderRegistry registry = new AiProviderRegistry(List.of(gemini.entry(), other.entry()), new AiKeyScrubber(List.of(SECRET)));
        router = new AiRouter(registry, runtime, metering, new AiPricing(), new SimpleMeterRegistry(), "env-model");
    }

    private static AiProviderException http(int status) {
        return new AiProviderException("Gemini returned HTTP " + status, status, null);
    }

    private void fallbackTo(String task, String provider, String model) {
        fake.put("ai.route." + task + ".fallback_provider", provider);
        if (model != null) fake.put("ai.route." + task + ".fallback_model", model);
    }

    // ---- never-collected values stop at the router (I1.14) ---------------------

    @Test
    void aNeverCollectedValueIsStrippedBeforeAnyAdapterSeesIt() {
        router.generate(AiTask.DRAFT, null, "Why us? My SSN is 123-45-6789, use it.", "Lives in Austin. Passport number: X1234567");
        router.parseResume(null, "Ada Lovelace\nSSN 123-45-6789\nBackend engineer", null, null);
        assertThat(gemini.prompts).hasSize(2);
        assertThat(gemini.prompts).noneMatch(p -> p.contains("123-45-6789") || p.contains("X1234567"));
        assertThat(gemini.prompts.get(0)).contains("[removed]").contains("Why us?");
        assertThat(gemini.prompts.get(1)).contains("[removed]").contains("Backend engineer");
    }

    @Test
    void anOrdinaryPromptReachesTheAdapterUntouched() {
        String prompt = "Reduced p99 latency by 40% across 12 services; phone 555-0100; ZIP 78701-1234.";
        router.generate(AiTask.REWRITE, null, prompt, "");
        assertThat(gemini.prompts.get(0)).startsWith(prompt);
    }

    // ---- routing ------------------------------------------------------------

    @Test
    void aCallGoesToTheRoutesProviderOnTheRoutesModel() {
        fake.put("ai.route.map.provider", "openai_compat");
        fake.put("ai.route.map.model", "qwen3:8b");
        AiResult r = router.generate(AiTask.MAP, null, "map these", "");
        assertThat(other.calls).hasSize(1);
        assertThat(other.calls.get(0).model()).isEqualTo("qwen3:8b");
        assertThat(gemini.calls).isEmpty();
        assertThat(r.provider()).isEqualTo("openai_compat");
    }

    @Test
    void theModelArgumentBeatsTheRouteAndBlankFallsBackToIt() {
        fake.put("ai.route.draft.model", "route-model");
        router.generate(AiTask.DRAFT, "economy-model", "q", "ctx");
        router.generate(AiTask.DRAFT, "  ", "q", "ctx");
        router.generate(AiTask.DRAFT, null, "q", "ctx");
        assertThat(gemini.calls).extracting(FakeAdapter.Call::model).containsExactly("economy-model", "route-model", "route-model");
    }

    @Test
    void theRoutesOutputCeilingAppliesUnlessTheCallerSetsOne() {
        fake.put("ai.route.draft.max_output_tokens", "700");
        router.generate(AiTask.DRAFT, "m", "q", "c");
        router.generate(AiTask.DRAFT, "m", "q", "c", 1234);
        assertThat(gemini.calls).extracting(FakeAdapter.Call::maxOutputTokens).containsExactly(700, 1234);
        router.parseResume("m", "text", null, null);
        assertThat(gemini.calls.get(2).maxOutputTokens()).as("the PARSE route's ceiling (env 4000)").isEqualTo(4000);
        assertThat(gemini.calls.get(2).parse()).isTrue();
    }

    @Test
    void aSuccessIsStampedWithProviderAndLatency() {
        AiResult r = router.generate(AiTask.PICK, "m", "q", "");
        assertThat(r.provider()).isEqualTo("gemini");
        assertThat(r.latencyMs()).isGreaterThanOrEqualTo(0);
        assertThat(r.text()).isEqualTo("OK");
        assertThat(r.model()).isEqualTo("m-001");
        verify(metering, never()).recordFailure(any(), any(), any(), any(), any(), anyInt());
    }

    // ---- disabled -----------------------------------------------------------

    @Test
    void aSwitchedOffTaskFailsWithADisabledRowAndNeverCallsAnyone() {
        fake.put("ai.route.parse.enabled", "false");
        assertThatThrownBy(() -> router.parseResume("m", "text", null, null))
            .isInstanceOfSatisfying(AiProviderException.class, e -> assertThat(e.kind()).isEqualTo(AiErrorKind.DISABLED));
        assertThat(gemini.calls).isEmpty();
        verify(metering).recordFailure(isNull(), eq(AiTask.PARSE), eq("gemini"), eq("m"), eq(AiErrorKind.DISABLED), eq(0));
    }

    @Test
    void theGlobalRuntimeSwitchAndTheEnvMasterBothStopEverything() {
        fake.put("ai.enabled", "false");
        assertThat(router.isConfigured()).isFalse();
        assertThatThrownBy(() -> router.generate(AiTask.PICK, "m", "q", "")).isInstanceOf(AiProviderException.class);
        assertThat(gemini.calls).isEmpty();

        fake.put("ai.enabled", "true");
        assertThat(router.isConfigured()).isTrue();

        AiRouter off = new AiRouter(
            new AiProviderRegistry(List.of(gemini.entry()), AiKeyScrubber.shapesOnly()),
            fake.runtime(new AiEnv(false, "gemini", "", "env-model", 400, 4000), policy),
            metering,
            new AiPricing(),
            new SimpleMeterRegistry(),
            "env-model"
        );
        assertThat(off.isConfigured()).as("the env master wins over a true row").isFalse();
        assertThatThrownBy(() -> off.generate(AiTask.PICK, "m", "q", "")).isInstanceOf(AiProviderException.class);
    }

    @Test
    void isConfiguredNeedsAnEnabledProviderWithAKey() {
        assertThat(router.isConfigured()).isTrue();
        gemini.configured = false;
        other.configured = false;
        assertThat(router.isConfigured()).isFalse();
        other.configured = true;
        fake.put("ai.provider.openai_compat.enabled", "true");
        assertThat(router.isConfigured()).isTrue();
        fake.put("ai.provider.openai_compat.enabled", "false");
        assertThat(router.isConfigured()).isFalse();
    }

    // ---- fallback -----------------------------------------------------------

    @Test
    void retryableFailuresFallBackOnceAndTheFailureIsLedgered() {
        for (AiProviderException failure : List.of(
            http(500),
            http(503),
            http(429),
            new AiProviderException("timed out", AiErrorKind.TIMEOUT),
            new AiProviderException("down", AiErrorKind.TRANSPORT),
            new AiProviderException("empty", AiErrorKind.EMPTY)
        )) {
            gemini.calls.clear();
            other.calls.clear();
            gemini.failure = failure;
            fallbackTo("pick", "openai_compat", "fb-model");
            AiResult r = router.generate(AiTask.PICK, "m", "q", "");
            assertThat(r.provider()).as("%s falls back", failure.getMessage()).isEqualTo("openai_compat");
            assertThat(other.calls).hasSize(1);
            assertThat(other.calls.get(0).model()).isEqualTo("fb-model");
        }
        verify(metering, times(6)).recordFailure(isNull(), eq(AiTask.PICK), eq("gemini"), eq("m"), any(AiErrorKind.class), anyInt());
    }

    @Test
    void aBlankFallbackModelUsesTheFallbackProvidersDefault() {
        gemini.failure = http(500);
        fallbackTo("pick", "openai_compat", null);
        router.generate(AiTask.PICK, "m", "q", "");
        assertThat(other.calls.get(0).model()).isEqualTo("other-default");
    }

    @Test
    void aRequestFaultNeverHopsProvider() {
        for (AiProviderException failure : List.of(
            http(400),
            http(403),
            http(404),
            new AiProviderException("bad json", AiErrorKind.BAD_JSON)
        )) {
            gemini.failure = failure;
            fallbackTo("pick", "openai_compat", null);
            assertThatThrownBy(() -> router.generate(AiTask.PICK, "m", "q", "")).isInstanceOf(AiProviderException.class);
        }
        assertThat(other.calls).isEmpty();
    }

    @Test
    void withNoFallbackTheFailurePropagates() {
        gemini.failure = http(500);
        assertThatThrownBy(() -> router.generate(AiTask.PICK, "m", "q", ""))
            .isInstanceOfSatisfying(AiProviderException.class, e -> assertThat(e.httpStatus()).isEqualTo(500));
        assertThat(other.calls).isEmpty();
    }

    @Test
    void whenTheFallbackFailsTooBothAreLedgeredAndTheSecondErrorSurfaces() {
        gemini.failure = http(500);
        other.failure = http(503);
        fallbackTo("pick", "openai_compat", null);
        assertThatThrownBy(() -> router.generate(AiTask.PICK, "m", "q", ""))
            .isInstanceOfSatisfying(AiProviderException.class, e -> assertThat(e.httpStatus()).isEqualTo(503));
        verify(metering).recordFailure(isNull(), eq(AiTask.PICK), eq("gemini"), eq("m"), eq(AiErrorKind.HTTP_5XX), anyInt());
        verify(metering).recordFailure(isNull(), eq(AiTask.PICK), eq("openai_compat"), eq("other-default"), eq(AiErrorKind.HTTP_5XX), anyInt());
    }

    @Test
    void aDisabledOrUnconfiguredRouteProviderFallsBackWhenOneIsSetAndFailsWhenNot() {
        fake.put("ai.provider.gemini.enabled", "false");
        assertThatThrownBy(() -> router.generate(AiTask.PICK, "m", "q", ""))
            .isInstanceOfSatisfying(AiProviderException.class, e -> assertThat(e.kind()).isEqualTo(AiErrorKind.DISABLED));
        verify(metering).recordFailure(isNull(), eq(AiTask.PICK), eq("gemini"), eq("m"), eq(AiErrorKind.DISABLED), eq(0));

        fallbackTo("pick", "openai_compat", null);
        assertThat(router.generate(AiTask.PICK, "m", "q", "").provider()).isEqualTo("openai_compat");

        fake.put("ai.provider.gemini.enabled", "true");
        gemini.configured = false;
        assertThat(router.generate(AiTask.PICK, "m", "q", "").provider()).isEqualTo("openai_compat");
        gemini.calls.clear();
        assertThat(gemini.calls).as("an unconfigured adapter is never called").isEmpty();
    }

    @Test
    void anUnknownRouteProviderIsUnconfigured() {
        fake.put("ai.route.pick.provider", "openai_compat");
        other.configured = false;
        assertThatThrownBy(() -> router.generate(AiTask.PICK, "m", "q", ""))
            .isInstanceOfSatisfying(AiProviderException.class, e -> assertThat(e.kind()).isEqualTo(AiErrorKind.UNCONFIGURED));
    }

    @Test
    void aProviderThatCannotReadAFileFallsBackForParse() {
        fake.put("ai.route.parse.provider", "openai_compat");
        other.fileFailure = new AiProviderException("text only", AiErrorKind.UNSUPPORTED_INPUT);
        fallbackTo("parse", "gemini", null);
        AiResult r = router.parseResume("m", null, "BASE64", "application/pdf");
        assertThat(r.provider()).isEqualTo("gemini");
        assertThat(gemini.calls.get(0).file()).isTrue();
        // The text path stays on the primary.
        assertThat(router.parseResume("m", "resume text", null, null).provider()).isEqualTo("openai_compat");
    }

    // ---- scrubbing ----------------------------------------------------------

    @Test
    void aProviderMessageNeverCarriesAKeyOutOfTheRouter() {
        gemini.failure = new AiProviderException("request to https://x?key=" + SECRET + " failed", AiErrorKind.TRANSPORT);
        assertThatThrownBy(() -> router.generate(AiTask.PICK, "m", "q", ""))
            .isInstanceOfSatisfying(AiProviderException.class, e -> assertThat(e.getMessage()).doesNotContain(SECRET).contains("[redacted]"));
    }

    // ---- probe --------------------------------------------------------------

    @Test
    void theProbeReturnsServedModelTokensAndCostAndWritesTheLedger() {
        gemini.text = "OK";
        gemini.inputTokens = 9;
        gemini.outputTokens = 1;
        ProbeResult p = router.probe("gemini", "gemini-2.5-flash-lite");
        assertThat(p.ok()).isTrue();
        assertThat(p.model()).isEqualTo("gemini-2.5-flash-lite-001");
        assertThat(p.inputTokens()).isEqualTo(9);
        assertThat(p.outputTokens()).isEqualTo(1);
        assertThat(p.costMicros()).isEqualTo(1); // 9 * 0.10 + 1 * 0.40 = 1.3 micro-dollars, rounded
        assertThat(p.errorKind()).isNull();
        assertThat(gemini.calls.get(0).task()).isEqualTo(AiTask.PROBE);
        assertThat(gemini.calls.get(0).maxOutputTokens()).isEqualTo(16);

        ArgumentCaptor<AiResult> r = ArgumentCaptor.forClass(AiResult.class);
        verify(metering).record(isNull(), eq(AiTask.PROBE), r.capture());
        assertThat(r.getValue().provider()).isEqualTo("gemini");
    }

    @Test
    void aFailedProbeReportsAKindAndAScrubbedShortMessage() {
        gemini.failure = new AiProviderException("boom " + SECRET + " ".repeat(5) + "x".repeat(400), AiErrorKind.TRANSPORT);
        ProbeResult p = router.probe("gemini", "");
        assertThat(p.ok()).isFalse();
        assertThat(p.errorKind()).isEqualTo("TRANSPORT");
        assertThat(p.message()).doesNotContain(SECRET).hasSizeLessThanOrEqualTo(200);
        assertThat(gemini.calls.get(0).model()).as("blank = the adapter's default").isEqualTo("fake-default");
        verify(metering).recordFailure(isNull(), eq(AiTask.PROBE), eq("gemini"), eq("fake-default"), eq(AiErrorKind.TRANSPORT), anyInt());
    }

    @Test
    void theProbeDoesNotCallAnyoneWhileTheEnvMasterIsOff() {
        AiRouter off = new AiRouter(
            new AiProviderRegistry(List.of(gemini.entry()), AiKeyScrubber.shapesOnly()),
            fake.runtime(new AiEnv(false, "gemini", "", "env-model", 400, 4000), policy),
            metering,
            new AiPricing(),
            new SimpleMeterRegistry(),
            "env-model"
        );
        ProbeResult p = off.probe("gemini", "");
        assertThat(p.ok()).isFalse();
        assertThat(p.errorKind()).isEqualTo("DISABLED");
        assertThat(gemini.calls).isEmpty();
    }

    @Test
    void theProbeReportsAMissingKey() {
        gemini.configured = false;
        ProbeResult p = router.probe("gemini", "");
        assertThat(p.ok()).isFalse();
        assertThat(p.errorKind()).isEqualTo("UNCONFIGURED");
        assertThat(gemini.calls).isEmpty();
    }
}
