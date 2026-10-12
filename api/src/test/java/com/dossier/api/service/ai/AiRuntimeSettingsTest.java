package com.dossier.api.service.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.ai.AiRuntimeSettings.Resolved;
import com.dossier.api.service.ai.AiRuntimeSettings.Route;
import com.dossier.api.service.ai.AiRuntimeSettings.Source;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Row, then env, then code default (I1.9) - for the values the router and the budget read. */
class AiRuntimeSettingsTest {

    private FakeSettings fake;
    private AiPolicy policy;
    private AiEnv env;
    private AiRuntimeSettings runtime;

    @BeforeEach
    void setUp() {
        fake = new FakeSettings();
        policy = new AiPolicy();
        env = new AiEnv(true, "gemini", "https://env.example/v1beta", "gemini-2.5-flash-lite", 400, 4000);
        runtime = fake.runtime(env, policy);
    }

    @Test
    void withNoRowsEnvThenCodeDefaultsApply() {
        Route parse = runtime.route(AiTask.PARSE);
        assertThat(parse.provider()).isEqualTo("gemini");
        assertThat(parse.model()).isEqualTo("gemini-2.5-flash-lite");
        assertThat(parse.maxOutputTokens()).isEqualTo(4000); // env parse ceiling
        assertThat(parse.enabled()).isTrue();
        assertThat(parse.fallbackProvider()).isNull();
        assertThat(runtime.route(AiTask.PICK).maxOutputTokens()).isEqualTo(400); // env draft ceiling
        assertThat(runtime.route(AiTask.JOBS).maxOutputTokens()).as("no env counterpart: code default").isEqualTo(3000);
        assertThat(runtime.providerBaseUrl("gemini")).isEqualTo("https://env.example/v1beta");
        assertThat(runtime.providerTimeoutMs("gemini")).isEqualTo(30000);
        assertThat(runtime.providerModels("gemini")).contains("gemini-2.5-flash-lite");
        assertThat(runtime.softCapPercent()).isEqualTo(80);
        assertThat(runtime.adminTestPerHour()).isEqualTo(30);
        assertThat(runtime.economyModel()).isEmpty();
    }

    @Test
    void aPerTaskEnvModelBeatsTheGlobalEnvModel() {
        policy.getModels().put("map", "gemini-2.5-flash");
        assertThat(runtime.route(AiTask.MAP).model()).isEqualTo("gemini-2.5-flash");
        assertThat(runtime.route(AiTask.PICK).model()).isEqualTo("gemini-2.5-flash-lite");
    }

    @Test
    void aStoredRowBeatsEnv() {
        policy.getModels().put("map", "gemini-2.5-flash");
        fake.put("ai.route.map.model", "gemini-3.5-flash");
        fake.put("ai.route.map.fallback_provider", "gemini");
        fake.put("ai.route.map.fallback_model", "gemini-2.5-flash-lite");
        fake.put("ai.route.map.max_output_tokens", "900");
        fake.put("ai.provider.gemini.base_url", "https://row.example/v1");
        fake.put("ai.soft_cap_pct", "60");
        fake.put("ai.economy_model", "gemini-2.5-flash-lite");
        Route map = runtime.route(AiTask.MAP);
        assertThat(map.model()).isEqualTo("gemini-3.5-flash");
        assertThat(map.fallbackProvider()).isEqualTo("gemini");
        assertThat(map.fallbackModel()).isEqualTo("gemini-2.5-flash-lite");
        assertThat(map.maxOutputTokens()).isEqualTo(900);
        assertThat(runtime.providerBaseUrl("gemini")).isEqualTo("https://row.example/v1");
        assertThat(runtime.softCapPercent()).isEqualTo(60);
        assertThat(runtime.economyModel()).contains("gemini-2.5-flash-lite");
    }

    @Test
    void aBlankEconomyRowTurnsAnEnvEconomyModelOff() {
        policy.setEconomyModel("gemini-2.5-flash-lite");
        assertThat(runtime.economyModel()).contains("gemini-2.5-flash-lite");
        fake.put("ai.economy_model", "");
        assertThat(runtime.economyModel()).isEmpty();
    }

    @Test
    void anInvalidRowFallsBackToEnv() {
        fake.put("ai.route.map.model", "has space");
        fake.put("ai.route.map.max_output_tokens", "99999");
        fake.put("ai.soft_cap_pct", "banana");
        fake.put("ai.route.map.provider", "mystery");
        Route map = runtime.route(AiTask.MAP);
        assertThat(map.model()).isEqualTo("gemini-2.5-flash-lite");
        assertThat(map.maxOutputTokens()).isEqualTo(400);
        assertThat(map.provider()).isEqualTo("gemini");
        assertThat(runtime.softCapPercent()).isEqualTo(80);
        assertThat(runtime.resolved("ai.route.map.model").source()).isEqualTo(Source.ENV);
    }

    @Test
    void theEnvMasterOnlyLowersNeverRaises() {
        assertThat(runtime.globalEnabled()).isTrue();
        fake.put("ai.enabled", "false");
        assertThat(runtime.globalEnabled()).as("runtime switch lowers").isFalse();
        fake.put("ai.enabled", "true");
        assertThat(runtime.globalEnabled()).isTrue();

        AiRuntimeSettings off = fake.runtime(new AiEnv(false, "gemini", "", "m", 400, 4000), policy);
        assertThat(off.globalEnabled()).as("env master off wins over a true row").isFalse();
        assertThat(off.envMasterEnabled()).isFalse();
    }

    @Test
    void taskSwitchDefaultsToTheEnvKillListAndARowOverridesIt() {
        policy.setDisabledTasks(java.util.Set.of("enrich"));
        assertThat(runtime.taskEnabled(AiTask.ENRICH)).isFalse();
        assertThat(runtime.taskEnabled(AiTask.PICK)).isTrue();
        fake.put("ai.route.enrich.enabled", "true");
        fake.put("ai.route.pick.enabled", "false");
        assertThat(runtime.taskEnabled(AiTask.ENRICH)).isTrue();
        assertThat(runtime.taskEnabled(AiTask.PICK)).isFalse();
    }

    @Test
    void providerSwitchAndUnknownProviders() {
        assertThat(runtime.providerEnabled("gemini")).isTrue();
        fake.put("ai.provider.gemini.enabled", "false");
        assertThat(runtime.providerEnabled("gemini")).isFalse();
        assertThat(runtime.providerEnabled("mystery")).as("unknown provider is never enabled").isFalse();
    }

    @Test
    void resolvedReportsValueSourceAndDefaults() {
        policy.getModels().put("parse", "gemini-2.5-flash");
        Resolved<Object> envOnly = runtime.resolved("ai.route.parse.model");
        assertThat(envOnly.value()).isEqualTo("gemini-2.5-flash");
        assertThat(envOnly.source()).isEqualTo(Source.ENV);
        assertThat(envOnly.envDefault()).isEqualTo("gemini-2.5-flash");
        assertThat(envOnly.codeDefault()).isEqualTo("");

        fake.put("ai.route.parse.model", "gemini-3.5-flash");
        Resolved<Object> db = runtime.resolved("ai.route.parse.model");
        assertThat(db.value()).isEqualTo("gemini-3.5-flash");
        assertThat(db.source()).isEqualTo(Source.DB);
        assertThat(db.envDefault()).as("what Reset goes back to").isEqualTo("gemini-2.5-flash");

        Resolved<Object> noEnv = runtime.resolved("ai.admin.test_per_hour");
        assertThat(noEnv.value()).isEqualTo(30);
        assertThat(noEnv.source()).isEqualTo(Source.DEFAULT);
        assertThat(noEnv.envDefault()).isNull();

        assertThat(runtime.resolved("ai.provider.gemini.models").value()).isInstanceOf(java.util.List.class);
        assertThat(runtime.resolved("ai.route.parse.enabled").value()).isEqualTo(true);
        assertThat(runtime.resolved("ai.route.parse.max_output_tokens").value()).isEqualTo(4000);
    }

    @Test
    void theCacheServesUntilInvalidated() {
        assertThat(runtime.route(AiTask.MAP).model()).isEqualTo("gemini-2.5-flash-lite");
        // A row written behind the cache's back is not seen yet...
        fake.rows.add(new com.dossier.api.domain.AppSetting("ai.route.map.model", "gemini-2.5-flash", "t", java.time.Instant.now()));
        assertThat(runtime.route(AiTask.MAP).model()).isEqualTo("gemini-2.5-flash-lite");
        // ...and is, right after an invalidate (what every admin write does).
        runtime.invalidate();
        assertThat(runtime.route(AiTask.MAP).model()).isEqualTo("gemini-2.5-flash");
    }

    @Test
    void storedPricesNeedAllThreePartsAndMatchByLongestPrefix() {
        fake.put("ai.price.qwen3:8b.input_per_mtok_micros", "0");
        fake.put("ai.price.qwen3:8b.cached_per_mtok_micros", "0");
        assertThat(runtime.price("qwen3:8b")).as("2 of 3 parts is ignored").isEmpty();
        fake.put("ai.price.qwen3:8b.output_per_mtok_micros", "0");
        assertThat(runtime.price("qwen3:8b")).isPresent();

        fake.put("ai.price.gemini-2.5-flash.input_per_mtok_micros", "1000000");
        fake.put("ai.price.gemini-2.5-flash.cached_per_mtok_micros", "100000");
        fake.put("ai.price.gemini-2.5-flash.output_per_mtok_micros", "5000000");
        AiPricing.Rate r = runtime.price("gemini-2.5-flash-001").orElseThrow();
        assertThat(r.getInput()).isEqualTo(1.0);
        assertThat(r.getCachedInput()).isEqualTo(0.1);
        assertThat(r.getOutput()).isEqualTo(5.0);
        Map<String, AiPricing.Rate> rates = runtime.storedRates();
        assertThat(rates).containsOnlyKeys("qwen3:8b", "gemini-2.5-flash");
        Map<String, long[]> all = runtime.storedPrices();
        assertThat(all).containsKeys("qwen3:8b", "gemini-2.5-flash");
        assertThat(runtime.price("something-else")).isEmpty();
    }
}
