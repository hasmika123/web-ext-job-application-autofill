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
    private static final int MAX_RESUME_CHARS = 30000;

    /**
     * Gemini structured-output schema (the OpenAPI subset Gemini accepts as
     * {@code generationConfig.responseSchema}) for the canonical structured resume —
     * the same shape the extension/web heuristic parser produces (parser-core.js),
     * plus a {@code bio} block for the contact header. Keeping the two in sync is a
     * documented contract, not enforced.
     */
    // spotless:off
    private static final String RESUME_SCHEMA_JSON =
        """
        {
          "type": "OBJECT",
          "properties": {
            "summary": { "type": "STRING" },
            "skills": { "type": "ARRAY", "items": { "type": "STRING" } },
            "experience": { "type": "ARRAY", "items": { "type": "OBJECT", "properties": {
              "company": { "type": "STRING" }, "title": { "type": "STRING" }, "location": { "type": "STRING" },
              "startDate": { "type": "STRING" }, "endDate": { "type": "STRING" }, "current": { "type": "BOOLEAN" },
              "bullets": { "type": "ARRAY", "items": { "type": "STRING" } } } } },
            "education": { "type": "ARRAY", "items": { "type": "OBJECT", "properties": {
              "school": { "type": "STRING" }, "degree": { "type": "STRING" }, "field": { "type": "STRING" },
              "location": { "type": "STRING" }, "startDate": { "type": "STRING" }, "endDate": { "type": "STRING" },
              "gpa": { "type": "STRING" } } } },
            "languages": { "type": "ARRAY", "items": { "type": "OBJECT", "properties": {
              "name": { "type": "STRING" }, "proficiency": { "type": "STRING" } } } },
            "projects": { "type": "ARRAY", "items": { "type": "OBJECT", "properties": {
              "name": { "type": "STRING" }, "bullets": { "type": "ARRAY", "items": { "type": "STRING" } } } } },
            "bio": { "type": "OBJECT", "properties": {
              "firstName": { "type": "STRING" }, "lastName": { "type": "STRING" }, "email": { "type": "STRING" },
              "phone": { "type": "STRING" }, "city": { "type": "STRING" }, "state": { "type": "STRING" },
              "country": { "type": "STRING" }, "linkedin": { "type": "STRING" }, "github": { "type": "STRING" },
              "website": { "type": "STRING" } } }
          }
        }
        """;
    // spotless:on

    private final String baseUrl;
    private final String model;
    private final String apiKey;
    private final int maxOutputTokens;
    private final int parseMaxOutputTokens;
    private final HttpClient http;
    private final ObjectMapper om = new ObjectMapper();

    public GeminiAiProvider(String baseUrl, String model, String apiKey, int maxOutputTokens, int parseMaxOutputTokens) {
        this.baseUrl = baseUrl == null ? "" : baseUrl;
        this.model = model;
        this.apiKey = apiKey;
        this.maxOutputTokens = maxOutputTokens;
        this.parseMaxOutputTokens = parseMaxOutputTokens;
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

        String answer = extractText(send(body, Duration.ofSeconds(30)));
        if (answer == null || answer.isBlank()) {
            throw new AiProviderException("Gemini returned an empty answer");
        }
        return answer.trim();
    }

    @Override
    public String parseResume(String text, String fileBase64, String fileMimeType) throws AiProviderException {
        if (!isConfigured()) {
            throw new AiProviderException("AI provider is not configured");
        }

        // { systemInstruction, contents:[{parts:[...]}],
        //   generationConfig:{ maxOutputTokens, responseMimeType, responseSchema } }
        ObjectNode body = om.createObjectNode();
        body.set("systemInstruction", textPart(PARSE_SYSTEM_PROMPT));
        ArrayNode contents = body.putArray("contents");
        ObjectNode content = contents.addObject();
        ArrayNode parts = content.putArray("parts");
        if (fileBase64 != null && !fileBase64.isBlank()) {
            // Original file (PDF) — Gemini reads the layout itself, which handles
            // multi-column and scanned resumes that text extraction shreds.
            ObjectNode inline = parts.addObject().putObject("inline_data");
            inline.put("mime_type", fileMimeType == null || fileMimeType.isBlank() ? "application/pdf" : fileMimeType);
            inline.put("data", fileBase64);
            parts.addObject().put("text", "Parse this resume.");
        } else {
            String t = text == null ? "" : text;
            if (t.length() > MAX_RESUME_CHARS) {
                t = t.substring(0, MAX_RESUME_CHARS);
            }
            parts.addObject().put("text", "Resume text:\n\n" + t);
        }
        ObjectNode genCfg = body.putObject("generationConfig");
        genCfg.put("maxOutputTokens", parseMaxOutputTokens);
        genCfg.put("responseMimeType", "application/json");
        try {
            genCfg.set("responseSchema", om.readTree(RESUME_SCHEMA_JSON));
        } catch (Exception e) {
            throw new AiProviderException("Bad resume schema", e); // unreachable: static constant
        }

        // Files take longer than short drafts — allow a roomier timeout.
        String json = extractText(send(body, Duration.ofSeconds(60)));
        if (json == null || json.isBlank()) {
            throw new AiProviderException("Gemini returned an empty parse");
        }
        // Validate it's real JSON before handing it downstream (schema mode makes
        // failures rare, but a truncated response is still possible).
        try {
            om.readTree(json);
        } catch (Exception e) {
            throw new AiProviderException("Gemini returned unparseable JSON", e);
        }
        return json.trim();
    }

    /** POST the request body to generateContent and return the raw response body. */
    private String send(ObjectNode body, Duration timeout) throws AiProviderException {
        String url = baseUrl.replaceAll("/+$", "") + "/models/" + model + ":generateContent?key=" + apiKey;

        HttpResponse<String> res;
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(timeout)
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
        return res.body();
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
