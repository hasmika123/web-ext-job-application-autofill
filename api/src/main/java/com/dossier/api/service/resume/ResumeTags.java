package com.dossier.api.service.resume;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The resume tags rules (R3.9, DESIGN 8.6): free labels, at most {@value #MAX_TAGS}, each at most
 * {@value #MAX_TAG_CHARS} characters, lower-cased, trimmed, blanks dropped and duplicates removed
 * (first occurrence wins). Stored as a JSON string array in {@code resume.tags_json}.
 */
public final class ResumeTags {

    public static final int MAX_TAGS = 10;
    public static final int MAX_TAG_CHARS = 24;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ResumeTags() {}

    /** Thrown for a tag list that breaks the rules; {@code message} is safe to show. */
    public static final class InvalidTagsException extends RuntimeException {

        private static final long serialVersionUID = 1L;

        public InvalidTagsException(String message) {
            super(message);
        }
    }

    /**
     * Normalise a tag list: trim, lower-case, drop blanks, de-duplicate. Throws when a tag is longer
     * than {@value #MAX_TAG_CHARS} characters or more than {@value #MAX_TAGS} remain. {@code null} is an empty list.
     */
    public static List<String> normalize(List<String> raw) {
        if (raw == null) return List.of();
        Set<String> out = new LinkedHashSet<>();
        for (String t : raw) {
            if (t == null) continue;
            String tag = t.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
            if (tag.isEmpty()) continue;
            if (tag.length() > MAX_TAG_CHARS) {
                throw new InvalidTagsException("each tag must be at most " + MAX_TAG_CHARS + " characters");
            }
            out.add(tag);
        }
        if (out.size() > MAX_TAGS) {
            throw new InvalidTagsException("at most " + MAX_TAGS + " tags");
        }
        return new ArrayList<>(out);
    }

    /** The stored JSON text for a (normalised) list; {@code null} when there are no tags. */
    public static String write(List<String> tags) {
        if (tags == null || tags.isEmpty()) return null;
        try {
            return MAPPER.writeValueAsString(tags);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialise tags", e);
        }
    }

    /** The tags in stored JSON text; an empty list for {@code null}, blank or unreadable input. */
    public static List<String> parse(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            List<String> read = MAPPER.readValue(json, MAPPER.getTypeFactory().constructCollectionType(List.class, String.class));
            return read == null ? List.of() : List.copyOf(read);
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }
}
