package com.dossier.api.service.jobs;

import com.dossier.api.service.AiInputs;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Strict, bounded parser shared by personal and organization job matching. */
public final class JobScoreParser {

    public record Score(int score, String why) {}

    private static final ObjectMapper OM = new ObjectMapper();

    private JobScoreParser() {}

    /**
     * Parse only references in {@code allowedRefs}; model output for another batch can never
     * create a score. Scores are clamped and reasons are bounded before leaving this seam.
     */
    public static Map<String, Score> parse(String text, Set<String> allowedRefs, int maxReasonLength) {
        Map<String, Score> out = new HashMap<>();
        if (allowedRefs == null || allowedRefs.isEmpty() || maxReasonLength < 0) return out;
        try {
            String t = text == null ? "" : text.trim();
            int start = t.indexOf('{');
            JsonNode root = start < 0 ? null : OM.readTree(t.substring(start));
            if (root == null) return out;
            for (JsonNode n : root.path("scores")) {
                String id = n.path("id").asText("").trim().toLowerCase(Locale.ROOT).replaceAll("[\\[\\]]", "");
                if (!allowedRefs.contains(id) || !n.path("score").isNumber()) continue;
                int score = (int) Math.max(0, Math.min(100, Math.round(n.path("score").asDouble())));
                out.putIfAbsent(id, new Score(score, AiInputs.cap(n.path("why").asText("").trim(), maxReasonLength)));
            }
        } catch (Exception ignored) {
            // An unusable answer is an empty score set; callers can keep the reservation policy explicit.
        }
        return out;
    }

    public static Map<String, Score> parse(String text, Set<String> allowedRefs) {
        return parse(text, allowedRefs, 300);
    }
}
