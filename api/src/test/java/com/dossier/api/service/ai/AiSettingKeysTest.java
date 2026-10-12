package com.dossier.api.service.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.AdminSettingsWriter.Risk;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettingKeys.Key;
import com.dossier.api.service.ResumeBuilderSettingKeys.Type;
import com.dossier.api.service.ResumeBuilderSettings;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The AI setting registry (I1.9): fixed keys, the three families over every task and provider, bounds, model ids. */
class AiSettingKeysTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void theFixedKeysCarryTheirDesignBoundsAndDefaults() {
        Key softCap = AiSettingKeys.find("ai.soft_cap_pct");
        assertThat(softCap.type()).isEqualTo(Type.INT);
        assertThat(softCap.defaultValue()).isEqualTo("80");
        assertThat(softCap.min()).isEqualTo(50d);
        assertThat(softCap.max()).isEqualTo(95d);
        assertThat(AiSettingKeys.find("ai.enabled").type()).isEqualTo(Type.BOOL);
        assertThat(AiSettingKeys.find("ai.economy_model").defaultValue()).isEmpty();
        assertThat(AiSettingKeys.find("ai.admin.test_per_hour").defaultValue()).isEqualTo("30");
        assertThat(AiSettingKeys.find("ai.admin.test_per_hour").max()).isEqualTo(120d);
        assertThat(AiSettingKeys.find("ai.calls.default_window_hours").defaultValue()).isEqualTo("24");
        assertThat(AiSettingKeys.find("ai.calls.default_window_hours").max()).isEqualTo(168d);
    }

    @Test
    void everyRouteFieldResolvesForEveryTask() {
        for (AiTask t : AiTask.values()) {
            for (String f : AiSettingKeys.ROUTE_FIELDS) {
                Key k = AiSettingKeys.find("ai.route." + t.wire() + "." + f);
                assertThat(k).as("ai.route.%s.%s", t.wire(), f).isNotNull();
                assertThat(ResumeBuilderSettings.isValid(k, k.defaultValue(), mapper)).as("default of %s", k.key()).isTrue();
                assertThat(k.description()).isNotBlank();
            }
            assertThat(AiSettingKeys.find("ai.route." + t.wire() + ".max_output_tokens").defaultValue())
                .isEqualTo(String.valueOf(AiSettingKeys.codeDefaultMaxOutputTokens(t)));
        }
        assertThat(AiSettingKeys.find("ai.route.parse.max_output_tokens").defaultValue()).isEqualTo("4000");
        assertThat(AiSettingKeys.find("ai.route.pick.max_output_tokens").defaultValue()).isEqualTo("400");
        assertThat(AiSettingKeys.find("ai.route.match.max_output_tokens").defaultValue()).isEqualTo("1200");
        assertThat(AiSettingKeys.find("ai.route.jobs.max_output_tokens").defaultValue()).isEqualTo("3000");
        assertThat(AiSettingKeys.find("ai.route.rewrite.max_output_tokens").defaultValue()).isEqualTo("3000");
        Key tokens = AiSettingKeys.find("ai.route.map.max_output_tokens");
        assertThat(tokens.min()).isEqualTo(64d);
        assertThat(tokens.max()).isEqualTo(16384d);
    }

    @Test
    void routeProviderAndFallbackAreEnums() {
        assertThat(AiSettingKeys.find("ai.route.map.provider").allowed()).containsExactly("gemini", "openai_compat");
        assertThat(AiSettingKeys.find("ai.route.map.fallback_provider").allowed()).containsExactly("none", "gemini", "openai_compat");
        assertThat(AiSettingKeys.find("ai.route.map.fallback_provider").defaultValue()).isEqualTo("none");
    }

    @Test
    void everyProviderFieldResolvesForEveryProvider() {
        for (String id : AiSettingKeys.PROVIDER_IDS) {
            for (String f : AiSettingKeys.PROVIDER_FIELDS) {
                Key k = AiSettingKeys.find("ai.provider." + id + "." + f);
                assertThat(k).as("ai.provider.%s.%s", id, f).isNotNull();
                assertThat(ResumeBuilderSettings.isValid(k, k.defaultValue(), mapper)).as("default of %s", k.key()).isTrue();
            }
        }
        assertThat(AiSettingKeys.find("ai.provider.gemini.timeout_ms").defaultValue()).isEqualTo("30000");
        assertThat(AiSettingKeys.find("ai.provider.openai_compat.timeout_ms").defaultValue()).isEqualTo("120000");
        assertThat(AiSettingKeys.find("ai.provider.gemini.timeout_ms").min()).isEqualTo(1000d);
        assertThat(AiSettingKeys.find("ai.provider.gemini.timeout_ms").max()).isEqualTo(300000d);
        assertThat(AiSettingKeys.find("ai.provider.gemini.models").defaultValue()).contains("gemini-2.5-flash-lite").contains("gemini-2.5-flash");
        assertThat(AiSettingKeys.find("ai.provider.openai_compat.models").defaultValue()).isEqualTo("[]");
        assertThat(AiSettingKeys.find("ai.provider.mystery.enabled")).isNull();
    }

    @Test
    void priceRowsResolveForAnyModelIdAndAreBounded() {
        for (String model : List.of("gemini-2.5-flash-lite", "qwen3:8b", "meta/llama-3.1-8b")) {
            for (String part : List.of("input", "cached", "output")) {
                Key k = AiSettingKeys.find("ai.price." + model + "." + part + "_per_mtok_micros");
                assertThat(k).as("price %s %s", model, part).isNotNull();
                assertThat(k.min()).isEqualTo(0d);
                assertThat(k.max()).isEqualTo(100_000_000d);
            }
        }
        assertThat(AiSettingKeys.find("ai.price.x.input_per_mtok_micros")).as("one-char model").isNull();
        assertThat(AiSettingKeys.find("ai.price.gemini-2.5-flash.fee_per_mtok_micros")).isNull();
    }

    @Test
    void unknownKeysAreNull() {
        assertThat(AiSettingKeys.find("ai.route.nope.model")).isNull();
        assertThat(AiSettingKeys.find("ai.route.parse.nope")).isNull();
        assertThat(AiSettingKeys.find("ai.nothing")).isNull();
        assertThat(AiSettingKeys.find(null)).isNull();
    }

    @Test
    void modelIdsAcceptRealNamesAndRejectJunk() {
        assertThat(AiSettingKeys.isModelId("gemini-2.5-flash-lite")).isTrue();
        assertThat(AiSettingKeys.isModelId("qwen3:8b")).isTrue();
        assertThat(AiSettingKeys.isModelId("meta/llama-3.1-8b")).isTrue();
        assertThat(AiSettingKeys.isModelId("has space")).isFalse();
        assertThat(AiSettingKeys.isModelId("a..b")).isFalse();
        assertThat(AiSettingKeys.isModelId("UPPER")).isFalse();
        assertThat(AiSettingKeys.isModelId("")).isFalse();
        assertThat(AiSettingKeys.shapeError(AiSettingKeys.find("ai.route.parse.model"), "has space")).isEqualTo("AI_MODEL_INVALID");
        assertThat(AiSettingKeys.shapeError(AiSettingKeys.find("ai.route.parse.model"), "gemini-2.5-flash")).isNull();
    }

    @Test
    void baseUrlsMustBeHttpsExceptForLocalHosts() {
        assertThat(AiSettingKeys.isAcceptableBaseUrl("https://generativelanguage.googleapis.com/v1beta")).isTrue();
        assertThat(AiSettingKeys.isAcceptableBaseUrl("http://localhost:11434/v1")).isTrue();
        assertThat(AiSettingKeys.isAcceptableBaseUrl("http://127.0.0.1:8080")).isTrue();
        assertThat(AiSettingKeys.isAcceptableBaseUrl("http://host.docker.internal:11434/v1")).isTrue();
        assertThat(AiSettingKeys.isAcceptableBaseUrl("http://ollama.localhost/v1")).isTrue();
        assertThat(AiSettingKeys.isAcceptableBaseUrl("http://192.168.1.20:11434/v1")).isTrue();
        assertThat(AiSettingKeys.isAcceptableBaseUrl("http://172.20.0.3:11434")).isTrue();
        assertThat(AiSettingKeys.isAcceptableBaseUrl("http://example.com/v1")).isFalse();
        assertThat(AiSettingKeys.isAcceptableBaseUrl("http://172.40.0.3")).isFalse();
        assertThat(AiSettingKeys.isAcceptableBaseUrl("ftp://example.com")).isFalse();
        assertThat(AiSettingKeys.isAcceptableBaseUrl("https://user:pw@example.com")).as("no credentials in a URL").isFalse();
        assertThat(AiSettingKeys.isAcceptableBaseUrl("not a url")).isFalse();
        assertThat(AiSettingKeys.shapeError(AiSettingKeys.find("ai.provider.gemini.base_url"), "http://example.com")).isEqualTo("AI_URL_INVALID");
    }

    @Test
    void theModelListMustBeDistinctModelIds() {
        Key models = AiSettingKeys.find("ai.provider.gemini.models");
        assertThat(ResumeBuilderSettings.isValid(models, "[\"gemini-2.5-flash\",\"qwen3:8b\"]", mapper)).isTrue();
        assertThat(ResumeBuilderSettings.isValid(models, "[]", mapper)).isTrue();
        assertThat(ResumeBuilderSettings.isValid(models, "[\"a b\"]", mapper)).isFalse();
        assertThat(ResumeBuilderSettings.isValid(models, "[\"gemini-2.5-flash\",\"gemini-2.5-flash\"]", mapper)).isFalse();
        assertThat(ResumeBuilderSettings.isValid(models, "{}", mapper)).isFalse();
        List<String> thirtyOne = new ArrayList<>();
        for (int i = 0; i < 31; i++) thirtyOne.add("\"model-" + i + "\"");
        assertThat(ResumeBuilderSettings.isValid(models, "[" + String.join(",", thirtyOne) + "]", mapper)).isFalse();
    }

    @Test
    void theLegacyRewriteCeilingIsAnAliasOfTheRewriteRoute() {
        assertThat(ResumeBuilderSettingKeys.canonical("ai.output_tokens_max.rewrite")).isEqualTo("ai.route.rewrite.max_output_tokens");
        assertThat(ResumeBuilderSettingKeys.require(ResumeBuilderSettingKeys.AI_OUTPUT_TOKENS_REWRITE).key()).isEqualTo("ai.route.rewrite.max_output_tokens");
        assertThat(ResumeBuilderSettingKeys.find("ai.route.map.model")).as("the builder registry consults the AI one").isNotNull();
    }

    @Test
    void noSettingIsNamedLikeASecret() {
        List<String> keys = new ArrayList<>();
        for (Key k : AiSettingKeys.exactKeys()) keys.add(k.key());
        for (AiTask t : AiTask.values()) for (String f : AiSettingKeys.ROUTE_FIELDS) keys.add("ai.route." + t.wire() + "." + f);
        for (String id : AiSettingKeys.PROVIDER_IDS) for (String f : AiSettingKeys.PROVIDER_FIELDS) keys.add("ai.provider." + id + "." + f);
        for (String part : List.of("input", "cached", "output")) keys.add(AiSettingKeys.priceKey("gemini-2.5-flash", part));
        for (String key : keys) {
            for (String word : key.split("[._:/-]")) {
                assertThat(word).as("a word of %s", key).isNotIn("key", "keys", "secret", "secrets", "token", "password", "apikey", "credential", "credentials");
            }
        }
    }

    @Test
    void riskIsHighOnlyWhenSwitchingAiOrParsingOrAProviderOff() {
        assertThat(AiSettingKeys.riskOf("ai.enabled", "false")).isEqualTo(Risk.HIGH);
        assertThat(AiSettingKeys.riskOf("ai.enabled", "true")).isEqualTo(Risk.LOW);
        assertThat(AiSettingKeys.riskOf("ai.route.parse.enabled", "false")).isEqualTo(Risk.HIGH);
        assertThat(AiSettingKeys.riskOf("ai.route.pick.enabled", "false")).isEqualTo(Risk.MEDIUM);
        assertThat(AiSettingKeys.riskOf("ai.provider.gemini.enabled", "false")).isEqualTo(Risk.HIGH);
        assertThat(AiSettingKeys.riskOf("ai.route.map.model", "gemini-2.5-flash")).isEqualTo(Risk.MEDIUM);
        assertThat(AiSettingKeys.riskOf("ai.route.map.max_output_tokens", "500")).isEqualTo(Risk.LOW);
        assertThat(AiSettingKeys.riskOf("ai.price.gemini-2.5-flash.input_per_mtok_micros", "1")).isEqualTo(Risk.LOW);
    }
}
