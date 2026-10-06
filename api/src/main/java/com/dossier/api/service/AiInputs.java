package com.dossier.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

/**
 * Bounded AI inputs shared by the resume-vs-job features (13.2 resume match, 13.3 job fit): the
 * cleaned, capped job description, and a resume as a compact digest built from its parsed JSON.
 * Per the 13.1 cost rules nothing unbounded ever reaches a model — the limits live here, once.
 */
final class AiInputs {

    /** Shorter than this and it's a page summary, not a job description — scoring it would be noise. */
    static final int MIN_JD_CHARS = 200;
    static final int MAX_JD_CHARS = 8000;

    /** How much of a resume goes in. {@link #BRIEF} for ranking several; {@link #DETAILED} for one. */
    record Limits(int summary, int skills, int roles, int bulletsPerRole, int bulletChars, int degrees) {}

    static final Limits BRIEF = new Limits(500, 40, 6, 1, 160, 3);
    static final Limits DETAILED = new Limits(800, 60, 8, 3, 220, 4);

    private static final ObjectMapper OM = new ObjectMapper();

    private AiInputs() {}

    static String cleanJobDescription(String jd) {
        String t = jd == null ? "" : jd.replaceAll("\\s+", " ").trim();
        return t.length() > MAX_JD_CHARS ? t.substring(0, MAX_JD_CHARS) : t;
    }

    /** A resume as the model sees it — what decides fit, bounded by {@code lim}. */
    static String resumeDigest(String parsedJson, Limits lim) {
        StringBuilder sb = new StringBuilder();
        JsonNode p;
        try {
            p = parsedJson == null || parsedJson.isBlank() ? OM.createObjectNode() : OM.readTree(parsedJson);
        } catch (Exception e) {
            p = OM.createObjectNode();
        }
        String summary = p.path("summary").asText("");
        if (!summary.isBlank()) sb.append("Summary: ").append(cap(summary, lim.summary())).append('\n');
        List<String> skills = new ArrayList<>();
        p.path("skills").forEach(s -> {
            if (skills.size() < lim.skills() && !s.asText("").isBlank()) skills.add(s.asText().trim());
        });
        if (!skills.isEmpty()) sb.append("Skills: ").append(String.join(", ", skills)).append('\n');
        int n = 0;
        for (JsonNode e : p.path("experience")) {
            if (n++ >= lim.roles()) break;
            String title = e.path("title").asText(""), company = e.path("company").asText("");
            String dates = (e.path("startDate").asText("") + "–" + (e.path("current").asBoolean(false) ? "present" : e.path("endDate").asText(""))).replaceAll("^–$", "");
            sb.append("Role: ").append(title).append(company.isBlank() ? "" : " at " + company).append(dates.isBlank() ? "" : " (" + dates + ")");
            int b = 0;
            for (JsonNode bullet : e.path("bullets")) {
                if (b++ >= lim.bulletsPerRole()) break;
                if (!bullet.asText("").isBlank()) sb.append(b == 1 ? " — " : "; ").append(cap(bullet.asText(), lim.bulletChars()));
            }
            sb.append('\n');
        }
        n = 0;
        for (JsonNode e : p.path("education")) {
            if (n++ >= lim.degrees()) break;
            String line = String.join(" ", e.path("degree").asText(""), e.path("field").asText(""), e.path("school").asText("").isBlank() ? "" : "— " + e.path("school").asText("")).trim();
            if (!line.isBlank()) sb.append("Education: ").append(line.replaceAll("\\s+", " ")).append('\n');
        }
        return sb.length() == 0 ? "(no details parsed)\n" : sb.toString();
    }

    static String cap(String s, int max) {
        String t = s == null ? "" : s.replaceAll("\\s+", " ").trim();
        return t.length() > max ? t.substring(0, max - 1) + "…" : t;
    }

    static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is mandatory in every JVM", e);
        }
    }
}
