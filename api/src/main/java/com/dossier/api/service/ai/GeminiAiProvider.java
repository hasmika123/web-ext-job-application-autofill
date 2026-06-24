package com.dossier.api.service.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Google Gemini implementation of {@link AiProvider} via the Generative Language API
 * (`{base}/models/{model}:generateContent?key=...`). Plain {@code java.net.http} — no
 * new dependency. The key comes from {@link AiProperties} (env), never the client.
 *
 * NOTE: the configured key may be a FREE-tier key, whose inputs Google may use to
 * improve its services. That's a product/privacy decision surfaced as an opt-in to the
 * user and disclosed in the privacy policy — this class just speaks the wire protocol.
 */
public class GeminiAiProvider implements AiProvider {

    private static final Logger LOG = LoggerFactory.getLogger(GeminiAiProvider.class);
    private static final int MAX_CONTEXT_CHARS = 6000;

    private final String baseUrl;
    private final String model;
    private final String apiKey;
    private final int maxOutputTokens;
    private final HttpClient http;
    private final ObjectMapper om = new ObjectMapper();

    public GeminiAiProvider(String baseUrl, String model, String apiKey, int maxOutputTokens) {
        this.baseUrl = baseUrl == null ? "" : baseUrl;
        this.model = model;
        this.apiKey = apiKey;
        this.maxOutputTokens = maxOutputTokens;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    @Override
    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    @Override
    public String draft(String question, String context) throws AiProviderException {
        if (!isConfigured()) {
            throw new AiProviderException("AI provider is not configured");
        }
        String ctx = context == null ? "" : context;
        if (ctx.length() > MAX_CONTEXT_CHARS) {
            ctx = ctx.substring(0, MAX_CONTEXT_CHARS);
        }
        String userText = "Question:\n" + (question == null ? "" : question) + "\n\nCandidate background:\n" + ctx + "\n\nWrite the answer:";

        // { systemInstruction:{parts:[{text}]}, contents:[{parts:[{text}]}],
        //   generationConfig:{ maxOutputTokens } }
        ObjectNode body = om.createObjectNode();
        body.set("systemInstruction", textPart(SYSTEM_PROMPT));
        ArrayNode contents = body.putArray("contents");
        contents.add(textPart(userText));
        ObjectNode genCfg = body.putObject("generationConfig");
        genCfg.put("maxOutputTokens", maxOutputTokens);

        String url = baseUrl.replaceAll("/+$", "") + "/models/" + model + ":generateContent?key=" + apiKey;

        HttpResponse<String> res;
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(om.writeValueAsString(body)))
                .build();
            res = http.send(req, HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            throw new AiProviderException("Gemini request failed", e);
        }

        if (res.statusCode() < 200 || res.statusCode() >= 300) {
            // Don't leak the key or the full body; log a trimmed message server-side.
            LOG.warn("Gemini returned {}: {}", res.statusCode(), trim(res.body()));
            throw new AiProviderException("Gemini returned HTTP " + res.statusCode());
        }

        String answer = extractText(res.body());
        if (answer == null || answer.isBlank()) {
            throw new AiProviderException("Gemini returned an empty answer");
        }
        return answer.trim();
    }

    private ObjectNode textPart(String text) {
        ObjectNode node = om.createObjectNode();
        node.putArray("parts").add(om.createObjectNode().put("text", text));
        return node;
    }

    /** candidates[0].content.parts[*].text, concatenated. */
    private String extractText(String json) {
        try {
            JsonNode root = om.readTree(json);
            JsonNode parts = root.path("candidates").path(0).path("content").path("parts");
            if (!parts.isArray()) return null;
            StringBuilder sb = new StringBuilder();
            for (JsonNode p : parts) {
                String t = p.path("text").asText("");
                if (!t.isEmpty()) sb.append(t);
            }
            return sb.toString();
        } catch (Exception e) {
            throw new AiProviderException("Could not parse Gemini response", e);
        }
    }

    private static String trim(String s) {
        if (s == null) return "";
        return s.length() > 300 ? s.substring(0, 300) : s;
    }
}
