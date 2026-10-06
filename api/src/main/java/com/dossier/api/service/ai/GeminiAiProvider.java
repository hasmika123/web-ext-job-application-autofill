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
    public String defaultModel() {
        return model;
    }

    private String modelOr(String requested) {
        return requested == null || requested.isBlank() ? model : requested.trim();
    }

    @Override
    public AiResult generate(AiTask task, String model, String question, String context) throws AiProviderException {
        if (!isConfigured()) {
            throw new AiProviderException("AI provider is not configured");
        }
        String m = modelOr(model);
        AiResult r = toResult(send(generateBody(task, question, context), Duration.ofSeconds(30), m), m);
        if (r.text() == null || r.text().isBlank()) {
            throw new AiProviderException("Gemini returned an empty answer");
        }
        return r;
    }

    /**
     * The request body for a short task. A draft keeps its original framing (question, then the
     * candidate background); every other task's {@code question} IS the instruction, so it goes
     * as-is, with any context after it.
     */
    ObjectNode generateBody(AiTask task, String question, String context) {
        String ctx = context == null ? "" : context;
        if (ctx.length() > MAX_CONTEXT_CHARS) {
            ctx = ctx.substring(0, MAX_CONTEXT_CHARS);
        }
        String q = question == null ? "" : question;
        String userText = task == AiTask.DRAFT
            ? "Question:\n" + q + "\n\nCandidate background:\n" + ctx + "\n\nWrite the answer:"
            : ctx.isBlank() ? q : q + "\n\n" + ctx;

        // { systemInstruction:{parts:[{text}]}, contents:[{parts:[{text}]}],
        //   generationConfig:{ maxOutputTokens } }
        ObjectNode body = om.createObjectNode();
        body.set("systemInstruction", textPart(AiProvider.systemPromptFor(task)));
        ArrayNode contents = body.putArray("contents");
        contents.add(textPart(userText));
        ObjectNode genCfg = body.putObject("generationConfig");
        genCfg.put("maxOutputTokens", maxOutputTokens);
        if (task == AiTask.MATCH || task == AiTask.FIT || task == AiTask.TAILOR || task == AiTask.JOBS || task == AiTask.INBOX) {
            // 13.2 / 13.3: scores and fit reports come back as schema-checked JSON, with room for a
            // list of entries (ten resumes, or keyword lists) rather than a short draft. 13.6b scores up
            // to fifty postings at once, each with a reason — the same shape as MATCH, more of it.
            genCfg.put("maxOutputTokens", Math.max(maxOutputTokens, task == AiTask.TAILOR || task == AiTask.JOBS || task == AiTask.INBOX ? 3000 : 1200));
            genCfg.put("responseMimeType", "application/json");
            try {
                genCfg.set(
                    "responseSchema",
                    om.readTree(
                        task == AiTask.MATCH || task == AiTask.JOBS
                            ? MATCH_SCHEMA_JSON
                            : task == AiTask.FIT ? FIT_SCHEMA_JSON : task == AiTask.INBOX ? INBOX_SCHEMA_JSON : TAILOR_SCHEMA_JSON
                    )
                );
            } catch (Exception e) {
                throw new AiProviderException("Bad response schema", e); // unreachable: static constants
            }
        }
        return body;
    }

    /** Structured output for {@link AiTask#TAILOR}: rewrites keyed by the prompt's refs, never new entries. */
    // spotless:off
    private static final String TAILOR_SCHEMA_JSON =
        """
        {
          "type": "OBJECT",
          "properties": {
            "summary": { "type": "STRING" },
            "bullets": { "type": "ARRAY", "items": { "type": "OBJECT", "properties": {
              "ref": { "type": "STRING" }, "text": { "type": "STRING" } }, "required": ["ref", "text"] } },
            "skillsOrder": { "type": "ARRAY", "items": { "type": "STRING" } },
            "suggestions": { "type": "ARRAY", "items": { "type": "STRING" } }
          },
          "required": ["bullets"]
        }
        """;
    // spotless:on

    /** Structured output for {@link AiTask#INBOX}: one reading per email, from a fixed list. */
    // spotless:off
    private static final String INBOX_SCHEMA_JSON =
        """
        {
          "type": "OBJECT",
          "properties": {
            "results": { "type": "ARRAY", "items": { "type": "OBJECT", "properties": {
              "id": { "type": "STRING" },
              "category": { "type": "STRING", "enum": ["APPLIED", "INTERVIEW", "ASSESSMENT", "REJECTED", "OFFER", "ALERT", "OTHER"] },
              "company": { "type": "STRING" },
              "role": { "type": "STRING" } }, "required": ["id", "category"] } }
          },
          "required": ["results"]
        }
        """;
    // spotless:on

    /** Structured output for {@link AiTask#FIT}: one resume against one job. */
    // spotless:off
    private static final String FIT_SCHEMA_JSON =
        """
        {
          "type": "OBJECT",
          "properties": {
            "score": { "type": "INTEGER" },
            "summary": { "type": "STRING" },
            "matched": { "type": "ARRAY", "items": { "type": "STRING" } },
            "missing": { "type": "ARRAY", "items": { "type": "STRING" } },
            "redFlags": { "type": "ARRAY", "items": { "type": "STRING" } }
          },
          "required": ["score", "matched", "missing", "redFlags"]
        }
        """;
    // spotless:on

    /** Structured output for {@link AiTask#MATCH}: one score per resume id, with a short reason. */
    // spotless:off
    private static final String MATCH_SCHEMA_JSON =
        """
        {
          "type": "OBJECT",
          "properties": {
            "scores": { "type": "ARRAY", "items": { "type": "OBJECT", "properties": {
              "id": { "type": "STRING" },
              "score": { "type": "INTEGER" },
              "why": { "type": "STRING" } }, "required": ["id", "score"] } }
          },
          "required": ["scores"]
        }
        """;
    // spotless:on

    @Override
    public AiResult parseResume(String model, String text, String fileBase64, String fileMimeType) throws AiProviderException {
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
        String m = modelOr(model);
        AiResult r = toResult(send(body, Duration.ofSeconds(60), m), m);
        String json = r.text();
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
        return r;
    }

    /** POST the request body to generateContent and return the raw response body. */
    private String send(ObjectNode body, Duration timeout, String model) throws AiProviderException {
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

    /**
     * The answer text ({@code candidates[0].content.parts[*].text}, concatenated) plus what the
     * call consumed, from {@code usageMetadata} (13.1a — never read before, so nothing could be
     * metered by cost). Gemini bills "thinking" tokens as output, and reports context-cache hits
     * inside {@code promptTokenCount}, so those are split out to be priced at the cache rate.
     * {@code modelVersion} is the model that actually answered; the requested name is the fallback.
     */
    AiResult toResult(String json) {
        return toResult(json, model);
    }

    AiResult toResult(String json, String requestedModel) {
        try {
            JsonNode root = om.readTree(json);
            JsonNode parts = root.path("candidates").path(0).path("content").path("parts");
            StringBuilder sb = new StringBuilder();
            if (parts.isArray()) {
                for (JsonNode p : parts) {
                    // Thought summaries (thought:true) are reasoning, not the answer.
                    if (p.path("thought").asBoolean(false)) continue;
                    String t = p.path("text").asText("");
                    if (!t.isEmpty()) sb.append(t);
                }
            }
            JsonNode usage = root.path("usageMetadata");
            int prompt = usage.path("promptTokenCount").asInt(0);
            int cached = usage.path("cachedContentTokenCount").asInt(0);
            int output = usage.path("candidatesTokenCount").asInt(0) + usage.path("thoughtsTokenCount").asInt(0);
            String served = root.path("modelVersion").asText("");
            return new AiResult(sb.toString().trim(), served.isBlank() ? requestedModel : served, prompt - cached, cached, output);
        } catch (Exception e) {
            throw new AiProviderException("Could not parse Gemini response", e);
        }
    }

    private static String trim(String s) {
        if (s == null) return "";
        return s.length() > 300 ? s.substring(0, 300) : s;
    }
}
