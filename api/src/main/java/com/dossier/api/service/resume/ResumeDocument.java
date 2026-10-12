package com.dossier.api.service.resume;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * The canonical Resume Builder document (schema v1, DESIGN section 4) as a Jackson tree, plus the small
 * helpers every consumer (validator, canonicaliser, projections) shares. The document is never bound
 * to a POJO: unknown keys survive a round trip, and each consumer reads only what it understands.
 *
 * <p>All helpers are tolerant - a missing, null or wrongly typed field reads as empty - because the
 * projections must never throw on a stored document; strictness lives in {@link ResumeDocumentValidator}.
 */
public final class ResumeDocument {

    public static final int SCHEMA_VERSION = 1;

    /** Strict reader: duplicate keys and trailing tokens are errors, not silently accepted. */
    private static final ObjectMapper MAPPER = new ObjectMapper()
        .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    private ResumeDocument() {}

    /** Section kinds, in the order the design lists them, with the title used when a section has none. */
    public enum Kind {
        SUMMARY("Summary"),
        EXPERIENCE("Experience"),
        EDUCATION("Education"),
        SKILLS("Skills"),
        PROJECTS("Projects"),
        CERTIFICATIONS("Certifications"),
        LANGUAGES("Languages"),
        ACHIEVEMENTS("Achievements"),
        CUSTOM("Additional Information");

        private final String defaultTitle;

        Kind(String defaultTitle) {
            this.defaultTitle = defaultTitle;
        }

        public String defaultTitle() {
            return defaultTitle;
        }

        /** The kind named {@code s} (exact, case-sensitive), or {@code null} when unknown. */
        public static Kind parse(String s) {
            if (s == null) return null;
            for (Kind k : values()) {
                if (k.name().equals(s)) return k;
            }
            return null;
        }
    }

    /** Parses a document; throws {@link IllegalArgumentException} on malformed JSON or duplicate keys. */
    public static JsonNode parse(String json) {
        try {
            return MAPPER.readTree(json);
        } catch (IOException e) {
            throw new IllegalArgumentException("Malformed JSON: " + e.getMessage(), e);
        }
    }

    public static JsonNode parse(byte[] json) {
        try {
            return MAPPER.readTree(json);
        } catch (IOException e) {
            throw new IllegalArgumentException("Malformed JSON: " + e.getMessage(), e);
        }
    }

    /**
     * Strips leading and trailing U+0009-U+000D and U+0020, nothing else. (Not {@code String.trim()}
     * and not JavaScript's {@code trim()}, which disagree about NBSP and C0 controls.)
     */
    public static String trimWs(String s) {
        if (s == null) return "";
        int start = 0;
        int end = s.length();
        while (start < end && isWs(s.charAt(start))) start++;
        while (end > start && isWs(s.charAt(end - 1))) end--;
        return s.substring(start, end);
    }

    /** {@link #trimWs} then every internal run of U+0009-U+000D / U+0020 becomes one space. */
    public static String oneLine(String s) {
        String t = trimWs(s);
        StringBuilder sb = new StringBuilder(t.length());
        boolean gap = false;
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            if (isWs(c)) {
                gap = true;
            } else {
                if (gap) sb.append(' ');
                gap = false;
                sb.append(c);
            }
        }
        return sb.toString();
    }

    private static boolean isWs(char c) {
        return c == ' ' || (c >= '\t' && c <= '\r');
    }

    /** The trimmed text of {@code node.field}; {@code ""} when missing, null or not a string. */
    public static String str(JsonNode node, String field) {
        JsonNode v = node == null ? null : node.get(field);
        return v != null && v.isTextual() ? trimWs(v.textValue()) : "";
    }

    /** True only when {@code node.field} is the boolean {@code true}. */
    public static boolean flag(JsonNode node, String field) {
        JsonNode v = node == null ? null : node.get(field);
        return v != null && v.isBoolean() && v.booleanValue();
    }

    public static boolean isHidden(JsonNode node) {
        return flag(node, "hidden");
    }

    /** The elements of {@code node.field} when it is an array, otherwise an empty list. */
    public static List<JsonNode> list(JsonNode node, String field) {
        JsonNode v = node == null ? null : node.get(field);
        List<JsonNode> out = new ArrayList<>();
        if (v != null && v.isArray()) v.forEach(out::add);
        return out;
    }

    /** Sections that are not hidden and whose kind is {@code kind}, in document order. */
    public static List<JsonNode> visibleSections(JsonNode doc, Kind kind) {
        List<JsonNode> out = new ArrayList<>();
        for (JsonNode s : list(doc, "sections")) {
            if (!s.isObject() || isHidden(s)) continue;
            if (kind != null && !kind.name().equals(s.path("kind").asText(null))) continue;
            out.add(s);
        }
        return out;
    }

    /** Items of {@code section} that are not hidden, in order. */
    public static List<JsonNode> visibleItems(JsonNode section) {
        List<JsonNode> out = new ArrayList<>();
        for (JsonNode i : list(section, "items")) {
            if (i.isObject() && !isHidden(i)) out.add(i);
        }
        return out;
    }

    /** Non-empty trimmed bullet texts of {@code item.bullets}, in order. */
    public static List<String> bulletTexts(JsonNode item) {
        List<String> out = new ArrayList<>();
        for (JsonNode b : list(item, "bullets")) {
            String t = b.isObject() ? str(b, "text") : "";
            if (!t.isEmpty()) out.add(t);
        }
        return out;
    }
}
