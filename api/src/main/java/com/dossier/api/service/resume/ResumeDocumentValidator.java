package com.dossier.api.service.resume;

import com.dossier.api.service.resume.ResumeDocument.Kind;
import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Hand-written, bounded validator for {@code ResumeDocument} schema v1 (no schema library).
 * Returns the <b>first</b> failure in document order as a {@link Violation} ({@code path},
 * {@code message}), or empty when the document is acceptable.
 *
 * <p>Paths look like {@code $.sections[2].items[0].bullets[1].text}. Rules:
 * <ul>
 *   <li>Serialised size (compact JSON, UTF-8) at most {@value #MAX_BYTES} bytes - checked first
 *       and flagged {@code tooLarge} so the endpoint can answer 413 instead of 422.</li>
 *   <li>Numbers are integers (no fractions or exponents anywhere).</li>
 *   <li>{@code schema == 1}; {@code meta.title} is a string; {@code basics} is an object;
 *       {@code sections} is an array of at most {@value #MAX_SECTIONS}.</li>
 *   <li>Each section: {@code id} ({@code [a-z]_[A-Za-z0-9]{6,12}}), a known {@code kind}, at most one
 *       section per kind except {@code CUSTOM}, optional string {@code title}, boolean {@code hidden},
 *       an {@code items} array of at most {@value #MAX_ITEMS}.</li>
 *   <li>Every section id, item id and bullet id is unique across the document.</li>
 *   <li>Items: fields are typed per kind (string or null; all optional except {@code id}); bullets
 *       at most {@value #MAX_BULLETS} per item, each {@code {id, text <= 600, src?}}; summary text
 *       at most {@value #MAX_SUMMARY} characters; dates are null, empty, {@code YYYY} or
 *       {@code YYYY-MM}.</li>
 *   <li>Unknown extra keys are ignored (forward compatible); the projections never read them.</li>
 * </ul>
 */
public final class ResumeDocumentValidator {

    public static final int MAX_BYTES = 256 * 1024;
    public static final int MAX_SECTIONS = 20;
    public static final int MAX_ITEMS = 40;
    public static final int MAX_BULLETS = 12;
    public static final int MAX_BULLET_CHARS = 600;
    public static final int MAX_SUMMARY = 2000;
    public static final int MAX_SKILLS_PER_GROUP = 100;
    public static final int MAX_LINKS = 20;

    private static final int SHORT = 200;
    private static final int URL = 2000;
    private static final int SKILL = 80;

    private static final Pattern ID = Pattern.compile("[a-z]_[A-Za-z0-9]{6,12}");
    private static final Pattern DATE = Pattern.compile("(19|20)\\d{2}(-(0[1-9]|1[0-2]))?");
    private static final Pattern LANGUAGE = Pattern.compile("[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*");
    private static final Set<String> SRC = Set.of("parsed", "user", "ai", "learned");
    private static final Set<Kind> WITH_BULLETS = EnumSet.of(
        Kind.EXPERIENCE,
        Kind.EDUCATION,
        Kind.PROJECTS,
        Kind.CUSTOM
    );

    /** A validation failure. {@code tooLarge} marks the size limit (413) as opposed to a content error (422). */
    public record Violation(String path, String message, boolean tooLarge) {
        public Violation(String path, String message) {
            this(path, message, false);
        }
    }

    private final Set<String> ids = new HashSet<>();

    private ResumeDocumentValidator() {}

    public static Optional<Violation> validate(JsonNode doc) {
        if (doc == null || doc.isMissingNode()) return Optional.of(new Violation("$", "document is required"));
        int bytes = ResumeDocumentJson.write(doc, 0).getBytes(StandardCharsets.UTF_8).length;
        if (bytes > MAX_BYTES) {
            return Optional.of(new Violation("$", "document exceeds " + MAX_BYTES + " bytes", true));
        }
        return Optional.ofNullable(new ResumeDocumentValidator().check(doc));
    }

    // ------------------------------------------------------------------ structure

    private Violation check(JsonNode root) {
        if (!root.isObject()) return v("$", "must be an object");
        Violation v = fractions(root, "$");
        if (v != null) return v;

        JsonNode schema = root.get("schema");
        if (schema == null || !schema.isIntegralNumber() || schema.intValue() != ResumeDocument.SCHEMA_VERSION) {
            return v("$.schema", "must be " + ResumeDocument.SCHEMA_VERSION);
        }

        v = meta(root.get("meta"));
        if (v != null) return v;
        v = basics(root.get("basics"));
        if (v != null) return v;

        JsonNode sections = root.get("sections");
        if (sections == null || !sections.isArray()) return v("$.sections", "must be an array");
        if (sections.size() > MAX_SECTIONS) return v("$.sections", "at most " + MAX_SECTIONS + " sections");
        Set<Kind> seen = EnumSet.noneOf(Kind.class);
        for (int i = 0; i < sections.size(); i++) {
            v = section(sections.get(i), "$.sections[" + i + "]", seen);
            if (v != null) return v;
        }
        return null;
    }

    private Violation fractions(JsonNode n, String path) {
        if (n.isNumber() && !n.isIntegralNumber()) return v(path, "must be an integer");
        if (n.isObject()) {
            for (var it = n.fields(); it.hasNext();) {
                var e = it.next();
                Violation v = fractions(e.getValue(), path + "." + e.getKey());
                if (v != null) return v;
            }
        } else if (n.isArray()) {
            for (int i = 0; i < n.size(); i++) {
                Violation v = fractions(n.get(i), path + "[" + i + "]");
                if (v != null) return v;
            }
        }
        return null;
    }

    private Violation meta(JsonNode meta) {
        if (meta == null || !meta.isObject()) return v("$.meta", "must be an object");
        JsonNode title = meta.get("title");
        if (title == null || !title.isTextual()) return v("$.meta.title", "must be a string");
        Violation v = len(title, "$.meta.title", SHORT);
        if (v != null) return v;
        for (String f : new String[] { "target", "profileSyncedAt", "originalFileKey" }) {
            v = optString(meta, f, "$.meta", SHORT);
            if (v != null) return v;
        }
        v = optString(meta, "language", "$.meta", SHORT);
        if (v != null) return v;
        JsonNode lang = meta.get("language");
        if (lang != null && lang.isTextual() && !LANGUAGE.matcher(lang.textValue()).matches()) {
            return v("$.meta.language", "must be a language tag such as 'en' or 'pt-BR'");
        }
        return null;
    }

    private Violation basics(JsonNode b) {
        if (b == null || !b.isObject()) return v("$.basics", "must be an object");
        for (String f : new String[] { "name", "headline", "email", "phone", "location", "photoKey" }) {
            Violation v = optString(b, f, "$.basics", SHORT);
            if (v != null) return v;
        }
        JsonNode links = b.get("links");
        if (links == null || links.isNull()) return null;
        if (!links.isArray()) return v("$.basics.links", "must be an array");
        if (links.size() > MAX_LINKS) return v("$.basics.links", "at most " + MAX_LINKS + " links");
        for (int i = 0; i < links.size(); i++) {
            String p = "$.basics.links[" + i + "]";
            JsonNode l = links.get(i);
            if (!l.isObject()) return v(p, "must be an object");
            Violation v = optString(l, "label", p, SHORT);
            if (v == null) v = optString(l, "url", p, URL);
            if (v != null) return v;
        }
        return null;
    }

    private Violation section(JsonNode s, String p, Set<Kind> seen) {
        if (!s.isObject()) return v(p, "must be an object");
        Violation v = id(s, p);
        if (v != null) return v;

        JsonNode k = s.get("kind");
        if (k == null || !k.isTextual()) return v(p + ".kind", "must be a string");
        Kind kind = Kind.parse(k.textValue());
        if (kind == null) return v(p + ".kind", "unknown section kind '" + clip(k.textValue()) + "'");
        if (kind != Kind.CUSTOM && !seen.add(kind)) {
            return v(p + ".kind", "duplicate section kind " + kind + " (only CUSTOM may repeat)");
        }

        v = optString(s, "title", p, SHORT);
        if (v == null) v = optBool(s, "hidden", p);
        if (v != null) return v;

        JsonNode items = s.get("items");
        if (items == null || !items.isArray()) return v(p + ".items", "must be an array");
        if (items.size() > MAX_ITEMS) return v(p + ".items", "at most " + MAX_ITEMS + " items per section");
        for (int i = 0; i < items.size(); i++) {
            v = item(items.get(i), p + ".items[" + i + "]", kind);
            if (v != null) return v;
        }
        return null;
    }

    private Violation item(JsonNode it, String p, Kind kind) {
        if (!it.isObject()) return v(p, "must be an object");
        Violation v = id(it, p);
        if (v == null) v = optBool(it, "hidden", p);
        if (v == null) v = src(it, p);
        if (v == null) v = profileItemId(it, p);
        if (v != null) return v;

        switch (kind) {
            case SUMMARY -> v = optString(it, "text", p, MAX_SUMMARY);
            case EXPERIENCE, CUSTOM -> {
                v = strings(it, p, "title", "org", "location");
                if (v == null) v = dates(it, p, "start", "end");
                if (v == null) v = optBool(it, "current", p);
            }
            case EDUCATION -> {
                v = strings(it, p, "school", "degree", "field", "location", "gpa");
                if (v == null) v = dates(it, p, "start", "end");
            }
            case SKILLS -> {
                v = optString(it, "group", p, SHORT);
                if (v == null) v = skills(it, p);
            }
            case PROJECTS -> {
                v = optString(it, "title", p, SHORT);
                if (v == null) v = optString(it, "url", p, URL);
            }
            case CERTIFICATIONS -> {
                v = strings(it, p, "title", "org");
                if (v == null) v = optString(it, "url", p, URL);
                if (v == null) v = dates(it, p, "date");
            }
            case LANGUAGES -> v = strings(it, p, "name", "level");
            case ACHIEVEMENTS -> {
                v = optString(it, "text", p, MAX_BULLET_CHARS);
                if (v == null) v = dates(it, p, "date");
            }
        }
        if (v != null) return v;
        return WITH_BULLETS.contains(kind) ? bullets(it, p) : null;
    }

    private Violation skills(JsonNode it, String p) {
        JsonNode sk = it.get("skills");
        if (sk == null || sk.isNull()) return null;
        if (!sk.isArray()) return v(p + ".skills", "must be an array");
        if (sk.size() > MAX_SKILLS_PER_GROUP) return v(p + ".skills", "at most " + MAX_SKILLS_PER_GROUP + " skills per group");
        for (int i = 0; i < sk.size(); i++) {
            JsonNode s = sk.get(i);
            String sp = p + ".skills[" + i + "]";
            if (!s.isTextual()) return v(sp, "must be a string");
            Violation v = len(s, sp, SKILL);
            if (v != null) return v;
        }
        return null;
    }

    private Violation bullets(JsonNode it, String p) {
        JsonNode bs = it.get("bullets");
        if (bs == null || bs.isNull()) return null;
        if (!bs.isArray()) return v(p + ".bullets", "must be an array");
        if (bs.size() > MAX_BULLETS) return v(p + ".bullets", "at most " + MAX_BULLETS + " bullets per item");
        for (int i = 0; i < bs.size(); i++) {
            JsonNode b = bs.get(i);
            String bp = p + ".bullets[" + i + "]";
            if (!b.isObject()) return v(bp, "must be an object");
            Violation v = id(b, bp);
            if (v == null) {
                JsonNode t = b.get("text");
                if (t == null || !t.isTextual()) return v(bp + ".text", "must be a string");
                v = len(t, bp + ".text", MAX_BULLET_CHARS);
            }
            if (v == null) v = src(b, bp);
            if (v != null) return v;
        }
        return null;
    }

    // ------------------------------------------------------------------ field helpers

    private Violation id(JsonNode n, String p) {
        JsonNode id = n.get("id");
        if (id == null || !id.isTextual()) return v(p + ".id", "must be a string");
        if (!ID.matcher(id.textValue()).matches()) return v(p + ".id", "must match [a-z]_[A-Za-z0-9]{6,12}");
        if (!ids.add(id.textValue())) return v(p + ".id", "duplicate id '" + id.textValue() + "'");
        return null;
    }

    private static Violation src(JsonNode n, String p) {
        JsonNode s = n.get("src");
        if (s == null || s.isNull()) return null;
        if (!s.isTextual() || !SRC.contains(s.textValue())) return v(p + ".src", "must be one of parsed, user, ai, learned");
        return null;
    }

    private static Violation profileItemId(JsonNode n, String p) {
        JsonNode s = n.get("profileItemId");
        if (s == null || s.isNull()) return null;
        if (!s.isIntegralNumber() || s.longValue() < 0) return v(p + ".profileItemId", "must be a non-negative integer or null");
        return null;
    }

    private static Violation strings(JsonNode n, String p, String... fields) {
        for (String f : fields) {
            Violation v = optString(n, f, p, SHORT);
            if (v != null) return v;
        }
        return null;
    }

    private static Violation dates(JsonNode n, String p, String... fields) {
        for (String f : fields) {
            JsonNode d = n.get(f);
            if (d == null || d.isNull()) continue;
            if (!d.isTextual()) return v(p + "." + f, "must be a string");
            String s = d.textValue();
            if (!s.isEmpty() && !DATE.matcher(s).matches()) return v(p + "." + f, "must be YYYY or YYYY-MM");
        }
        return null;
    }

    private static Violation optString(JsonNode n, String field, String p, int max) {
        JsonNode v = n.get(field);
        if (v == null || v.isNull()) return null;
        if (!v.isTextual()) return v(p + "." + field, "must be a string");
        return len(v, p + "." + field, max);
    }

    private static Violation optBool(JsonNode n, String field, String p) {
        JsonNode v = n.get(field);
        if (v == null || v.isNull()) return null;
        return v.isBoolean() ? null : v(p + "." + field, "must be a boolean");
    }

    private static Violation len(JsonNode text, String path, int max) {
        String s = text.textValue();
        return s.codePointCount(0, s.length()) > max ? v(path, "must be at most " + max + " characters") : null;
    }

    private static String clip(String s) {
        return s.length() > 40 ? s.substring(0, 40) + "..." : s;
    }

    private static Violation v(String path, String message) {
        return new Violation(path, message);
    }
}
