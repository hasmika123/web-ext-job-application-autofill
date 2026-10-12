package com.dossier.api.service.resume;

import com.dossier.api.service.resume.ResumeDocument.Kind;
import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Hand-written, bounded validator for {@code ResumeDocument} schema v2 (DESIGN section 3.1; no schema
 * library). Returns the <b>first</b> failure in document order as a {@link Violation} ({@code path},
 * {@code message}), or empty when the document is acceptable. A v1 document is not valid here: callers
 * run {@link ResumeDocumentUpgrader#upgrade} first (that is what {@code PUT} does).
 *
 * <p>Paths look like {@code $.sections[2].items[0].bullets[1].text}. Rules:
 * <ul>
 *   <li>Serialised size (compact JSON, UTF-8) at most {@link Limits#docBytes()} bytes (default
 *       {@value #MAX_BYTES}) - checked first and flagged {@code tooLarge} so the endpoint can answer
 *       413 instead of 422.</li>
 *   <li>Numbers are integers (no fractions or exponents anywhere).</li>
 *   <li>{@code schema == 2}; {@code meta.title} is a string; {@code basics} is an object;
 *       {@code sections} is an array of at most {@link Limits#sections()}.</li>
 *   <li>Each section: {@code id} ({@code [a-z]_[A-Za-z0-9]{6,12}}), a known {@code kind}, at most one
 *       section per kind except {@code CUSTOM}, optional string {@code title}, boolean {@code hidden},
 *       an {@code items} array of at most {@link Limits#items()}.</li>
 *   <li>Every section id, item id and bullet id is unique across the document.</li>
 *   <li>Items: fields are typed per kind (string or null; all optional except {@code id}); bullets
 *       at most {@link Limits#bullets()} per item, each {@code {id, text <= bulletChars, src?, marks?}};
 *       summary text at most {@link Limits#summaryChars()} characters; INTERESTS text at most
 *       {@value #MAX_INTEREST} characters; dates are null, empty, {@code YYYY} or {@code YYYY-MM}.</li>
 *   <li>Marks (SUMMARY text, bullets, ACHIEVEMENTS text): at most {@link Limits#marks()} per text;
 *       {@code 0 <= s < e <= text.length()} (UTF-16 units); {@code t} in b, i, u, a; {@code href} present
 *       iff {@code t == "a"} and starts with {@code http://}, {@code https://} or {@code mailto:}; two
 *       marks of the same {@code t} never overlap.</li>
 *   <li>Lists: SUMMARY {@code list} and an item's {@code listStyle} are {@code "bullet"}, {@code "number"}
 *       or null.</li>
 *   <li>{@code basics.photo} is null or {@code {key, updatedAt?}} whose key starts with
 *       {@link Options#photoKeyPrefix()} (server-set; the client may only echo it).</li>
 *   <li>{@code meta.tailoredFrom} is server-written: it is rejected unless
 *       {@link Options#allowTailoredFrom()} (the service allows it only when it equals the stored value).</li>
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
    public static final int MAX_MARKS = 64;
    public static final int MAX_INTEREST = 80;
    public static final int MAX_SKILLS_PER_GROUP = 100;
    public static final int MAX_LINKS = 20;

    private static final int SHORT = 200;
    private static final int URL = 2000;
    private static final int SKILL = 80;
    private static final int HREF = 2048;
    private static final int JOB_REF = 120;

    private static final Pattern ID = Pattern.compile("[a-z]_[A-Za-z0-9]{6,12}");
    private static final Pattern DATE = Pattern.compile("(19|20)\\d{2}(-(0[1-9]|1[0-2]))?");
    private static final Pattern LANGUAGE = Pattern.compile("[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*");
    private static final Pattern HREF_SCHEME = Pattern.compile("^(https?://|mailto:).*", Pattern.DOTALL);
    private static final Pattern JD_HASH = Pattern.compile("[0-9a-f]{64}");
    private static final Set<String> SRC = Set.of("parsed", "user", "ai", "learned");
    private static final String MARK_TYPES = "biua";
    private static final Set<String> LIST_STYLES = Set.of("bullet", "number");
    private static final Set<String> JOB_SOURCES = Set.of("application", "saved_job", "pasted", "extension");
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

    /**
     * The document limits (settings {@code resume.doc.limits.*}, DESIGN 15.2). {@link #DEFAULTS} are the
     * R0 constants; the settings seam supplies the live values.
     */
    public record Limits(int sections, int items, int bullets, int bulletChars, int summaryChars, int marks, int docBytes) {
        public static final Limits DEFAULTS = new Limits(
            MAX_SECTIONS,
            MAX_ITEMS,
            MAX_BULLETS,
            MAX_BULLET_CHARS,
            MAX_SUMMARY,
            MAX_MARKS,
            MAX_BYTES
        );
    }

    /**
     * Per-call switches. {@code allowTailoredFrom}: the caller is the server (or an echo of the stored
     * value), so {@code meta.tailoredFrom} may be present. {@code photoKeyPrefix}: the owner's
     * {@code resume-photos/<userId>/}; {@code null} means "no photo may be set by this caller".
     */
    public record Options(boolean allowTailoredFrom, String photoKeyPrefix, Limits limits) {
        public static final Options DEFAULTS = new Options(false, null, Limits.DEFAULTS);

        public Options {
            if (limits == null) limits = Limits.DEFAULTS;
        }

        public Options(boolean allowTailoredFrom) {
            this(allowTailoredFrom, null, Limits.DEFAULTS);
        }

        public Options withAllowTailoredFrom(boolean allow) {
            return new Options(allow, photoKeyPrefix, limits);
        }

        public Options withPhotoKeyPrefix(String prefix) {
            return new Options(allowTailoredFrom, prefix, limits);
        }

        public Options withLimits(Limits l) {
            return new Options(allowTailoredFrom, photoKeyPrefix, l);
        }
    }

    private final Set<String> ids = new HashSet<>();
    private final Options options;
    private final Limits limits;

    private ResumeDocumentValidator(Options options) {
        this.options = options;
        this.limits = options.limits();
    }

    public static Optional<Violation> validate(JsonNode doc) {
        return validate(doc, Options.DEFAULTS);
    }

    public static Optional<Violation> validate(JsonNode doc, Options options) {
        Options o = options == null ? Options.DEFAULTS : options;
        if (doc == null || doc.isMissingNode()) return Optional.of(new Violation("$", "document is required"));
        int bytes = ResumeDocumentJson.write(doc, 0).getBytes(StandardCharsets.UTF_8).length;
        if (bytes > o.limits().docBytes()) {
            return Optional.of(new Violation("$", "document exceeds " + o.limits().docBytes() + " bytes", true));
        }
        return Optional.ofNullable(new ResumeDocumentValidator(o).check(doc));
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
        if (sections.size() > limits.sections()) return v("$.sections", "at most " + limits.sections() + " sections");
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
        return tailoredFrom(meta.get("tailoredFrom"));
    }

    private Violation tailoredFrom(JsonNode tf) {
        if (tf == null || tf.isNull()) return null;
        String p = "$.meta.tailoredFrom";
        if (!options.allowTailoredFrom()) return v(p, "is set by the server and cannot be changed by a save");
        if (!tf.isObject()) return v(p, "must be an object or null");
        JsonNode rid = tf.get("resumeId");
        if (rid == null || !rid.isIntegralNumber()) return v(p + ".resumeId", "must be an integer");
        JsonNode job = tf.get("job");
        if (job == null || !job.isObject()) return v(p + ".job", "must be an object");
        String jp = p + ".job";
        JsonNode source = job.get("source");
        if (source == null || !source.isTextual() || !JOB_SOURCES.contains(source.textValue())) {
            return v(jp + ".source", "must be one of application, saved_job, pasted, extension");
        }
        JsonNode appId = job.get("applicationId");
        if (appId != null && !appId.isNull() && !appId.isIntegralNumber()) return v(jp + ".applicationId", "must be an integer or null");
        for (String f : new String[] { "title", "company" }) {
            JsonNode t = job.get(f);
            if (t == null || !t.isTextual()) return v(jp + "." + f, "must be a string");
            Violation v = len(t, jp + "." + f, JOB_REF);
            if (v != null) return v;
        }
        JsonNode hash = job.get("jdHash");
        if (hash == null || !hash.isTextual() || !JD_HASH.matcher(hash.textValue()).matches()) {
            return v(jp + ".jdHash", "must be a 64-character lowercase hex hash");
        }
        return optString(tf, "createdAt", p, SHORT);
    }

    private Violation basics(JsonNode b) {
        if (b == null || !b.isObject()) return v("$.basics", "must be an object");
        for (String f : new String[] { "name", "headline", "email", "phone", "location" }) {
            Violation v = optString(b, f, "$.basics", SHORT);
            if (v != null) return v;
        }
        Violation v = photo(b.get("photo"));
        if (v != null) return v;
        JsonNode links = b.get("links");
        if (links == null || links.isNull()) return null;
        if (!links.isArray()) return v("$.basics.links", "must be an array");
        if (links.size() > MAX_LINKS) return v("$.basics.links", "at most " + MAX_LINKS + " links");
        for (int i = 0; i < links.size(); i++) {
            String p = "$.basics.links[" + i + "]";
            JsonNode l = links.get(i);
            if (!l.isObject()) return v(p, "must be an object");
            v = optString(l, "label", p, SHORT);
            if (v == null) v = optString(l, "url", p, URL);
            if (v != null) return v;
        }
        return null;
    }

    private Violation photo(JsonNode photo) {
        if (photo == null || photo.isNull()) return null;
        String p = "$.basics.photo";
        if (!photo.isObject()) return v(p, "must be an object or null");
        JsonNode key = photo.get("key");
        if (key == null || !key.isTextual()) return v(p + ".key", "must be a string");
        Violation v = len(key, p + ".key", 255);
        if (v != null) return v;
        String prefix = options.photoKeyPrefix();
        if (prefix == null || !key.textValue().startsWith(prefix)) {
            return v(p + ".key", prefix == null ? "is set by the server" : "must start with " + prefix);
        }
        return optString(photo, "updatedAt", p, SHORT);
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
        if (items.size() > limits.items()) return v(p + ".items", "at most " + limits.items() + " items per section");
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
            case SUMMARY -> {
                v = optString(it, "text", p, limits.summaryChars());
                if (v == null) v = optEnum(it, "list", p);
                if (v == null) v = marks(it, p);
            }
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
                if (v == null) v = dates(it, p, "start", "end");
            }
            case CERTIFICATIONS -> {
                v = strings(it, p, "title", "org");
                if (v == null) v = optString(it, "url", p, URL);
                if (v == null) v = dates(it, p, "date");
            }
            case LANGUAGES -> v = strings(it, p, "name", "level");
            case ACHIEVEMENTS -> {
                v = optString(it, "text", p, limits.bulletChars());
                if (v == null) v = dates(it, p, "date");
                if (v == null) v = marks(it, p);
            }
            case INTERESTS -> v = optString(it, "text", p, MAX_INTEREST);
        }
        if (v != null) return v;
        if (!WITH_BULLETS.contains(kind)) return null;
        v = optEnum(it, "listStyle", p);
        return v != null ? v : bullets(it, p);
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
        if (bs.size() > limits.bullets()) return v(p + ".bullets", "at most " + limits.bullets() + " bullets per item");
        for (int i = 0; i < bs.size(); i++) {
            JsonNode b = bs.get(i);
            String bp = p + ".bullets[" + i + "]";
            if (!b.isObject()) return v(bp, "must be an object");
            Violation v = id(b, bp);
            if (v == null) {
                JsonNode t = b.get("text");
                if (t == null || !t.isTextual()) return v(bp + ".text", "must be a string");
                v = len(t, bp + ".text", limits.bulletChars());
            }
            if (v == null) v = src(b, bp);
            if (v == null) v = marks(b, bp);
            if (v != null) return v;
        }
        return null;
    }

    // ------------------------------------------------------------------ marks

    /** One validated mark range, for the same-type overlap check. */
    private record Range(int s, int e, int index) {}

    /** Validates {@code owner.marks} against the UTF-16 length of {@code owner.text}. */
    private Violation marks(JsonNode owner, String p) {
        JsonNode ms = owner.get("marks");
        if (ms == null || ms.isNull()) return null;
        String mp = p + ".marks";
        if (!ms.isArray()) return v(mp, "must be an array");
        if (ms.size() > limits.marks()) return v(mp, "at most " + limits.marks() + " marks per text");
        JsonNode text = owner.get("text");
        int length = text != null && text.isTextual() ? text.textValue().length() : 0;

        List<List<Range>> byType = new ArrayList<>();
        for (int i = 0; i < MARK_TYPES.length(); i++) byType.add(new ArrayList<>());
        for (int i = 0; i < ms.size(); i++) {
            JsonNode m = ms.get(i);
            String p1 = mp + "[" + i + "]";
            if (!m.isObject()) return v(p1, "must be an object");
            JsonNode s = m.get("s");
            JsonNode e = m.get("e");
            if (s == null || !s.isInt() || s.intValue() < 0) return v(p1 + ".s", "must be a non-negative integer");
            if (e == null || !e.isInt() || e.intValue() <= s.intValue() || e.intValue() > length) {
                return v(p1 + ".e", "must be an integer with s < e <= " + length + " (the text length)");
            }
            JsonNode t = m.get("t");
            if (t == null || !t.isTextual() || t.textValue().length() != 1 || MARK_TYPES.indexOf(t.textValue()) < 0) {
                return v(p1 + ".t", "must be one of b, i, u, a");
            }
            JsonNode href = m.get("href");
            boolean hasHref = href != null && !href.isNull();
            if (t.textValue().equals("a")) {
                if (!hasHref || !href.isTextual()) return v(p1 + ".href", "is required on a link mark");
                Violation v = len(href, p1 + ".href", HREF);
                if (v != null) return v;
                if (!HREF_SCHEME.matcher(ResumeDocument.trimWs(href.textValue())).matches()) {
                    return v(p1 + ".href", "must start with http://, https:// or mailto:");
                }
            } else if (hasHref) {
                return v(p1 + ".href", "is only allowed on a link mark");
            }
            byType.get(MARK_TYPES.indexOf(t.textValue())).add(new Range(s.intValue(), e.intValue(), i));
        }
        for (List<Range> ranges : byType) {
            ranges.sort(Comparator.comparingInt(Range::s).thenComparingInt(Range::e));
            for (int i = 1; i < ranges.size(); i++) {
                if (ranges.get(i).s() < ranges.get(i - 1).e()) {
                    int idx = Math.max(ranges.get(i).index(), ranges.get(i - 1).index());
                    return v(mp + "[" + idx + "]", "overlaps another mark of the same type");
                }
            }
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

    /** {@code list} / {@code listStyle}: "bullet", "number" or null. */
    private static Violation optEnum(JsonNode n, String field, String p) {
        JsonNode s = n.get(field);
        if (s == null || s.isNull()) return null;
        if (!s.isTextual() || !LIST_STYLES.contains(s.textValue())) return v(p + "." + field, "must be 'bullet', 'number' or null");
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
