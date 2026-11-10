package com.dossier.api.service.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/** {@link AiProviderContractTest} for Gemini, plus the two things only the Gemini wire has: the key header and the response shape. */
class GeminiAiProviderContractTest extends AiProviderContractTest {

    static final String KEY = "AIzaSyD-contract-test-key-0123456789abcdef";

    private GeminiAiProvider gemini(String key) {
        return new GeminiAiProvider(() -> "https://example.test/v1beta", "gemini-2.5-flash-lite", key, () -> 30_000, 400, 4000, http, new AiKeyScrubber(List.of(key)));
    }

    @Override
    protected AiProvider provider() {
        return gemini(KEY);
    }

    @Override
    protected AiProvider unconfiguredProvider() {
        return gemini("");
    }

    @Override
    protected String successBody(String text) {
        String escaped = text.replace("\\", "\\\\").replace("\"", "\\\"");
        return "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"" + escaped + "\"}]}}],\"usageMetadata\":{\"promptTokenCount\":120,\"candidatesTokenCount\":30},\"modelVersion\":\"gemini-2.5-flash-lite-001\"}";
    }

    @Override
    protected String emptyBody() {
        return "{\"candidates\":[]}";
    }

    @Test
    void theKeyTravelsInTheHeaderAndNeverInTheUrl() throws Exception {
        respond(200, successBody("ok"));
        provider().generate(AiTask.PICK, "gemini-2.5-flash", "q", "");
        var req = sent.get(0);
        assertThat(req.headers().firstValue("x-goog-api-key")).contains(KEY);
        assertThat(req.uri().toString()).doesNotContain(KEY).doesNotContain("key=");
        assertThat(req.uri().toString()).isEqualTo("https://example.test/v1beta/models/gemini-2.5-flash:generateContent");
    }

    @Test
    void theBaseUrlIsReadOnEveryCall() throws Exception {
        String[] base = { "https://one.test/v1beta" };
        GeminiAiProvider p = new GeminiAiProvider(() -> base[0], "m", KEY, () -> 30_000, 400, 4000, http, new AiKeyScrubber(List.of(KEY)));
        respond(200, successBody("ok"));
        p.generate(AiTask.PICK, "m", "q", "");
        base[0] = "https://two.test/v1beta";
        p.generate(AiTask.PICK, "m", "q", "");
        assertThat(sent.get(0).uri().getHost()).isEqualTo("one.test");
        assertThat(sent.get(1).uri().getHost()).isEqualTo("two.test");
    }

    @Test
    void theTimeoutIsReadOnEveryCallAndAParseWaitsAtLeastAMinute() throws Exception {
        int[] timeout = { 5_000 };
        GeminiAiProvider p = new GeminiAiProvider(() -> "https://example.test/v1beta", "m", KEY, () -> timeout[0], 400, 4000, http, new AiKeyScrubber(List.of(KEY)));
        respond(200, successBody("{}"));
        p.generate(AiTask.PICK, "m", "q", "");
        p.parseResume("m", "resume text", null, null);
        timeout[0] = 90_000;
        p.parseResume("m", "resume text", null, null);
        assertThat(sent.get(0).timeout()).contains(java.time.Duration.ofMillis(5_000));
        assertThat(sent.get(1).timeout()).as("a parse is never shorter than 60 s").contains(java.time.Duration.ofMillis(60_000));
        assertThat(sent.get(2).timeout()).contains(java.time.Duration.ofMillis(90_000));
    }

    @Test
    void aCallerCeilingReplacesTheDefaultInTheRequestBody() throws Exception {
        respond(200, successBody("ok"));
        provider().generate(AiTask.PICK, "m", "q", "", 123);
        // The body is a string publisher; read the ceiling through the adapter's own builder instead.
        GeminiAiProvider g = (GeminiAiProvider) provider();
        assertThat(g.generateBody(AiTask.PICK, "q", "", 123).path("generationConfig").path("maxOutputTokens").asInt()).isEqualTo(123);
        assertThat(g.generateBody(AiTask.PICK, "q", "").path("generationConfig").path("maxOutputTokens").asInt()).isEqualTo(400);
    }
}
