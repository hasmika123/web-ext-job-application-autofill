package com.dossier.api.service.resume;

import com.dossier.api.domain.ProfileItem;
import com.dossier.api.domain.enumeration.ProfileSection;
import com.dossier.api.service.resume.ResumeDocument.Kind;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Builds the first {@code ResumeDocument} of a new built resume from what the user already has
 * (Resume Builder R0.3): their Common Profile items when there are any, otherwise just the
 * {@code basics} header from the bio.
 *
 * <p>The profile is user-edited data of unknown quality, so this never copies a row verbatim: each
 * item is rebuilt from a whitelist of fields per section kind, strings and counts are clipped to the
 * validator's limits, dates that are not {@code YYYY} / {@code YYYY-MM} are dropped, and ids are
 * generated. Hidden profile items are left out (hidden there means "do not use by default"). The
 * result therefore always passes {@link ResumeDocumentValidator}; the caller still validates it.
 *
 * <p>Section mapping: EXPERIENCE, EDUCATION, SKILL (one item per group), PROJECT, CERTIFICATION,
 * LANGUAGE and ACHIEVEMENT map to the section of that kind; VOLUNTEER, PUBLICATION and CUSTOM each
 * become a CUSTOM section; LINK items become {@code basics.links}.
 */
public final class ResumeDocumentSeeder {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final Pattern DATE = Pattern.compile("(19|20)\\d{2}(-(0[1-9]|1[0-2]))?");
    private static final Set<String> SRC = Set.of("parsed", "user", "ai", "learned");
    private static final JsonNodeFactory F = JsonNodeFactory.instance;

    private static final int SHORT = 200;
    private static final int URL = 2000;

    private final Set<String> ids = new HashSet<>();

    private ResumeDocumentSeeder() {}

    /**
     * @param title    {@code meta.title} (also the resume label)
     * @param target   {@code meta.target} or {@code null}
     * @param bio      the parsed bio payload (flat keys such as {@code firstName}); may be {@code null}
     * @param items    the user's live profile items in (section, position) order; may be empty
     * @param now      stamped as {@code meta.profileSyncedAt}
     */
    public static ObjectNode seed(String title, String target, JsonNode bio, List<ProfileItem> items, Instant now) {
        return new ResumeDocumentSeeder().build(title, target, bio, items, now);
    }

    private ObjectNode build(String title, String target, JsonNode bio, List<ProfileItem> items, Instant now) {
        ObjectNode doc = F.objectNode();
        doc.put("schema", ResumeDocument.SCHEMA_VERSION);

        ObjectNode meta = doc.putObject("meta");
        meta.put("title", clip(title, SHORT));
        if (target != null && !target.isBlank()) meta.put("target", clip(target, SHORT));
        meta.put("language", "en");
        meta.put("profileSyncedAt", now.truncatedTo(ChronoUnit.SECONDS).toString());
        meta.putNull("originalFileKey");

        ObjectNode basics = basics(bio);
        doc.set("basics", basics);

        ArrayNode sections = doc.putArray("sections");
        Map<ProfileSection, List<ProfileItem>> bySection = new EnumMap<>(ProfileSection.class);
        for (ProfileItem it : items) {
            if (it.isHidden() || it.getDeletedAt() != null || it.getSection() == null) continue;
            bySection.computeIfAbsent(it.getSection(), k -> new ArrayList<>()).add(it);
        }

        ArrayNode links = (ArrayNode) basics.get("links");
        for (ProfileItem it : bySection.getOrDefault(ProfileSection.LINK, List.of())) {
            JsonNode d = data(it);
            String url = text(d, URL, "url");
            if (url.isEmpty() || links.size() >= ResumeDocumentValidator.MAX_LINKS) continue;
            ObjectNode l = links.addObject();
            l.put("label", text(d, SHORT, "label", "name"));
            l.put("url", url);
        }
        if (links.isEmpty()) basics.remove("links");

        section(sections, Kind.EXPERIENCE, null, bySection.get(ProfileSection.EXPERIENCE));
        section(sections, Kind.EDUCATION, null, bySection.get(ProfileSection.EDUCATION));
        section(sections, Kind.SKILLS, null, bySection.get(ProfileSection.SKILL));
        section(sections, Kind.PROJECTS, null, bySection.get(ProfileSection.PROJECT));
        section(sections, Kind.CERTIFICATIONS, null, bySection.get(ProfileSection.CERTIFICATION));
        section(sections, Kind.LANGUAGES, null, bySection.get(ProfileSection.LANGUAGE));
        section(sections, Kind.ACHIEVEMENTS, null, bySection.get(ProfileSection.ACHIEVEMENT));
        section(sections, Kind.CUSTOM, "Volunteering", bySection.get(ProfileSection.VOLUNTEER));
        section(sections, Kind.CUSTOM, "Publications", bySection.get(ProfileSection.PUBLICATION));
        section(sections, Kind.CUSTOM, null, bySection.get(ProfileSection.CUSTOM));
        return doc;
    }

    // ------------------------------------------------------------------ header

    private static ObjectNode basics(JsonNode bio) {
        ObjectNode b = F.objectNode();
        String name = join(" ", text(bio, SHORT, "firstName"), text(bio, SHORT, "lastName"));
        if (name.isEmpty()) name = text(bio, SHORT, "fullName", "name");
        putIf(b, "name", name);
        putIf(b, "headline", text(bio, SHORT, "headline", "currentTitle"));
        putIf(b, "email", text(bio, SHORT, "email"));
        putIf(b, "phone", text(bio, SHORT, "phone"));
        putIf(b, "location", join(", ", text(bio, SHORT, "city"), text(bio, SHORT, "state")));
        ArrayNode links = b.putArray("links");
        link(links, "LinkedIn", text(bio, URL, "linkedin"));
        link(links, "GitHub", text(bio, URL, "github"));
        link(links, "Website", text(bio, URL, "website"));
        return b;
    }

    private static void link(ArrayNode links, String label, String url) {
        if (url.isEmpty()) return;
        ObjectNode l = links.addObject();
        l.put("label", label);
        l.put("url", url);
    }

    // ------------------------------------------------------------------ sections

    private void section(ArrayNode sections, Kind kind, String title, List<ProfileItem> rows) {
        if (rows == null || rows.isEmpty()) return;
        ArrayNode items = F.arrayNode();
        for (ProfileItem row : rows) {
            if (items.size() >= ResumeDocumentValidator.MAX_ITEMS) break;
            ObjectNode item = item(kind, row);
            if (item != null) items.add(item);
        }
        if (items.isEmpty()) return;
        ObjectNode s = sections.addObject();
        s.put("id", newId("s"));
        s.put("kind", kind.name());
        s.put("title", title != null ? title : kind.defaultTitle());
        s.put("hidden", false);
        s.set("items", items);
    }

    /** One doc item from one profile row, or {@code null} when the row carries nothing usable. */
    private ObjectNode item(Kind kind, ProfileItem row) {
        JsonNode d = data(row);
        ObjectNode it = F.objectNode();
        it.put("id", newId("i"));
        if (row.getId() != null) it.put("profileItemId", row.getId());
        it.put("hidden", false);
        boolean any;
        switch (kind) {
            case EXPERIENCE, CUSTOM -> {
                any = put(it, "title", text(d, SHORT, "title", "position", "role", "name"));
                any |= put(it, "org", text(d, SHORT, "org", "company", "organization", "employer", "publisher"));
                put(it, "location", text(d, SHORT, "location"));
                dates(it, d);
                it.put("current", flag(d, "current"));
                any |= bullets(it, d, row);
            }
            case EDUCATION -> {
                any = put(it, "school", text(d, SHORT, "school", "institution", "org"));
                any |= put(it, "degree", text(d, SHORT, "degree"));
                any |= put(it, "field", text(d, SHORT, "field", "major"));
                put(it, "location", text(d, SHORT, "location"));
                put(it, "gpa", text(d, SHORT, "gpa"));
                dates(it, d);
                bullets(it, d, row);
            }
            case SKILLS -> {
                put(it, "group", text(d, SHORT, "group", "name", "category"));
                ArrayNode skills = it.putArray("skills");
                for (JsonNode s : list(d, "skills")) {
                    String name = s.isTextual() ? ResumeDocument.trimWs(s.textValue()) : text(s, 80, "name");
                    name = clip(name, 80);
                    if (!name.isEmpty() && skills.size() < ResumeDocumentValidator.MAX_SKILLS_PER_GROUP) skills.add(name);
                }
                any = !skills.isEmpty();
            }
            case PROJECTS -> {
                any = put(it, "title", text(d, SHORT, "title", "name"));
                put(it, "url", text(d, URL, "url", "link"));
                any |= bullets(it, d, row);
            }
            case CERTIFICATIONS -> {
                any = put(it, "title", text(d, SHORT, "title", "name"));
                put(it, "org", text(d, SHORT, "org", "issuer", "organization"));
                put(it, "url", text(d, URL, "url"));
                String date = date(d, "date");
                if (date != null) it.put("date", date);
            }
            case LANGUAGES -> {
                any = put(it, "name", text(d, SHORT, "name", "language"));
                put(it, "level", text(d, SHORT, "level", "proficiency"));
            }
            case ACHIEVEMENTS -> {
                any = put(it, "text", text(d, ResumeDocumentValidator.MAX_BULLET_CHARS, "text", "title", "name"));
                String date = date(d, "date");
                if (date != null) it.put("date", date);
            }
            default -> any = false;
        }
        return any ? it : null;
    }

    private void dates(ObjectNode it, JsonNode d) {
        String start = date(d, "start", "startDate");
        String end = date(d, "end", "endDate");
        if (start != null) it.put("start", start);
        if (end != null) it.put("end", end);
    }

    private boolean bullets(ObjectNode it, JsonNode d, ProfileItem row) {
        ArrayNode out = it.putArray("bullets");
        String defaultSrc = row.getProvenance() == null ? "user" : row.getProvenance().name().toLowerCase(java.util.Locale.ROOT);
        if (!SRC.contains(defaultSrc)) defaultSrc = "user";
        for (JsonNode b : list(d, "bullets")) {
            if (out.size() >= ResumeDocumentValidator.MAX_BULLETS) break;
            String text = b.isTextual() ? ResumeDocument.trimWs(b.textValue()) : text(b, Integer.MAX_VALUE, "text");
            text = clip(text, ResumeDocumentValidator.MAX_BULLET_CHARS);
            if (text.isEmpty()) continue;
            String src = b.isObject() ? text(b, 20, "src") : "";
            ObjectNode o = out.addObject();
            o.put("id", newId("b"));
            o.put("text", text);
            o.put("src", SRC.contains(src) ? src : defaultSrc);
        }
        return !out.isEmpty();
    }

    // ------------------------------------------------------------------ helpers

    private static JsonNode data(ProfileItem row) {
        try {
            JsonNode n = ResumeDocument.parse(row.getDataJson());
            return n != null && n.isObject() ? n : F.objectNode();
        } catch (RuntimeException e) {
            return F.objectNode();
        }
    }

    private static List<JsonNode> list(JsonNode n, String field) {
        return n == null ? List.of() : ResumeDocument.list(n, field);
    }

    private static boolean flag(JsonNode n, String field) {
        return n != null && ResumeDocument.flag(n, field);
    }

    /** The first non-blank string among {@code fields}, trimmed and clipped to {@code max} code points; "" when none. */
    private static String text(JsonNode n, int max, String... fields) {
        if (n == null || !n.isObject()) return "";
        for (String f : fields) {
            JsonNode v = n.get(f);
            if (v != null && v.isTextual()) {
                String s = ResumeDocument.trimWs(v.textValue());
                if (!s.isEmpty()) return clip(s, max);
            }
        }
        return "";
    }

    private static String date(JsonNode n, String... fields) {
        String s = text(n, 10, fields);
        return DATE.matcher(s).matches() ? s : null;
    }

    private static String clip(String s, int max) {
        if (s == null) return "";
        if (s.codePointCount(0, s.length()) <= max) return s;
        return s.substring(0, s.offsetByCodePoints(0, max));
    }

    private static boolean put(ObjectNode n, String field, String value) {
        if (value.isEmpty()) return false;
        n.put(field, value);
        return true;
    }

    private static void putIf(ObjectNode n, String field, String value) {
        if (!value.isEmpty()) n.put(field, value);
    }

    private static String join(String sep, String a, String b) {
        if (a.isEmpty()) return b;
        if (b.isEmpty()) return a;
        return a + sep + b;
    }

    /** {@code <prefix>_<8 alphanumerics>}, unique within this document (matches the validator's id pattern). */
    private String newId(String prefix) {
        String id;
        do {
            StringBuilder sb = new StringBuilder(prefix).append('_');
            for (int i = 0; i < 8; i++) sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
            id = sb.toString();
        } while (!ids.add(id));
        return id;
    }
}
