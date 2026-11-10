package com.dossier.api.service.resume;

import com.dossier.api.domain.enumeration.ProfileSection;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns a resume's {@code parsed_json} ({@code StructuredResume}: summary, skills, experience,
 * education, languages, projects) into profile items (Resume Builder DESIGN v1 2.2). Pure; the caller
 * redacts never-collected values and imports the result.
 *
 * <p>Item data is the resume-document item shape of its kind minus the item's own id and hidden flag
 * ({@code ResumeDocumentSeeder} reads exactly these fields back): EXPERIENCE
 * {@code title, org, location, start, end, current, bullets}; EDUCATION
 * {@code school, degree, field, location, start, end, gpa}; PROJECT {@code title, bullets};
 * LANGUAGE {@code name, level}; SKILL one row per 40 skills {@code {group:"Skills", skills:[...]}}.
 * Bullets are {@code {text, src:"parsed"}}. Dates become {@code YYYY} / {@code YYYY-MM} when they can
 * be read ("Jan 2020", "01/2020", "2020") and are dropped otherwise; "Present" / "Current" sets
 * {@code current}. Strings are trimmed and clipped to {@link #MAX_TEXT}.
 */
public final class ProfileSeed {

    /** One item ready to import. */
    public record Seeded(ProfileSection section, ObjectNode data) {}

    public static final int MAX_TEXT = 2000;
    static final int SKILLS_PER_ROW = 40;
    static final int MAX_SKILL_CHARS = 60;
    static final String SKILL_GROUP = "Skills";

    private static final JsonNodeFactory F = JsonNodeFactory.instance;
    private static final Pattern ISO = Pattern.compile("^((?:19|20)\\d{2})(?:-(0[1-9]|1[0-2]))?$");
    private static final Pattern MONTH_YEAR = Pattern.compile("^([A-Za-z]{3,9})\\.?,?\\s+((?:19|20)\\d{2})$");
    private static final Pattern NUM_MONTH_YEAR = Pattern.compile("^(0?[1-9]|1[0-2])[/.-]((?:19|20)\\d{2})$");
    private static final Pattern YEAR_NUM_MONTH = Pattern.compile("^((?:19|20)\\d{2})[/.](0?[1-9]|1[0-2])$");
    private static final Set<String> PRESENT = Set.of("present", "current", "now", "ongoing", "today", "till date", "to date");
    private static final List<String> MONTHS = List.of("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec");

    private ProfileSeed() {}

    public static List<Seeded> fromStructured(JsonNode parsed) {
        List<Seeded> out = new ArrayList<>();
        if (parsed == null || !parsed.isObject()) return out;

        for (JsonNode e : ResumeDocument.list(parsed, "experience")) {
            ObjectNode d = F.objectNode();
            boolean any = put(d, "title", e, "title");
            any |= put(d, "org", e, "company");
            put(d, "location", e, "location");
            boolean current = ResumeDocument.flag(e, "current") || isPresent(ResumeDocument.str(e, "endDate"));
            String start = date(ResumeDocument.str(e, "startDate"));
            String end = current ? "" : date(ResumeDocument.str(e, "endDate"));
            if (!start.isEmpty()) d.put("start", start);
            if (!end.isEmpty()) d.put("end", end);
            if (current) d.put("current", true);
            any |= bullets(d, e);
            if (any) out.add(new Seeded(ProfileSection.EXPERIENCE, d));
        }
        for (JsonNode e : ResumeDocument.list(parsed, "education")) {
            ObjectNode d = F.objectNode();
            boolean any = put(d, "school", e, "school");
            any |= put(d, "degree", e, "degree");
            any |= put(d, "field", e, "field");
            put(d, "location", e, "location");
            put(d, "gpa", e, "gpa");
            String start = date(ResumeDocument.str(e, "startDate"));
            String end = date(ResumeDocument.str(e, "endDate"));
            if (!start.isEmpty()) d.put("start", start);
            if (!end.isEmpty()) d.put("end", end);
            if (any) out.add(new Seeded(ProfileSection.EDUCATION, d));
        }
        for (JsonNode e : ResumeDocument.list(parsed, "projects")) {
            ObjectNode d = F.objectNode();
            boolean any = put(d, "title", e, "name");
            any |= bullets(d, e);
            if (any) out.add(new Seeded(ProfileSection.PROJECT, d));
        }
        for (JsonNode e : ResumeDocument.list(parsed, "languages")) {
            ObjectNode d = F.objectNode();
            boolean any = put(d, "name", e, "name");
            put(d, "level", e, "proficiency");
            if (any) out.add(new Seeded(ProfileSection.LANGUAGE, d));
        }

        Set<String> seen = new LinkedHashSet<>();
        List<String> skills = new ArrayList<>();
        for (JsonNode s : ResumeDocument.list(parsed, "skills")) {
            String t = clip(s.isTextual() ? ResumeDocument.trimWs(s.textValue()) : "", MAX_SKILL_CHARS);
            if (!t.isEmpty() && seen.add(t.toLowerCase(Locale.ROOT))) skills.add(t);
        }
        for (int i = 0; i < skills.size(); i += SKILLS_PER_ROW) {
            ObjectNode d = F.objectNode();
            d.put("group", SKILL_GROUP);
            ArrayNode arr = d.putArray("skills");
            skills.subList(i, Math.min(skills.size(), i + SKILLS_PER_ROW)).forEach(arr::add);
            out.add(new Seeded(ProfileSection.SKILL, d));
        }
        return out;
    }

    /** {@code YYYY} / {@code YYYY-MM} from the common ways a parser writes a date; {@code ""} when unreadable. */
    public static String date(String raw) {
        String s = ResumeDocument.trimWs(raw);
        if (s.isEmpty()) return "";
        Matcher m = ISO.matcher(s);
        if (m.matches()) return m.group(2) == null ? m.group(1) : m.group(1) + "-" + m.group(2);
        m = MONTH_YEAR.matcher(s);
        if (m.matches()) {
            int idx = MONTHS.indexOf(m.group(1).toLowerCase(Locale.ROOT).substring(0, 3));
            if (idx >= 0) return m.group(2) + "-" + String.format("%02d", idx + 1);
        }
        m = NUM_MONTH_YEAR.matcher(s);
        if (m.matches()) return m.group(2) + "-" + String.format("%02d", Integer.parseInt(m.group(1)));
        m = YEAR_NUM_MONTH.matcher(s);
        if (m.matches()) return m.group(1) + "-" + String.format("%02d", Integer.parseInt(m.group(2)));
        return "";
    }

    static boolean isPresent(String s) {
        return PRESENT.contains(ResumeDocument.trimWs(s).toLowerCase(Locale.ROOT));
    }

    private static boolean put(ObjectNode d, String field, JsonNode src, String srcField) {
        String v = clip(ResumeDocument.str(src, srcField), MAX_TEXT);
        if (v.isEmpty()) return false;
        d.put(field, v);
        return true;
    }

    private static boolean bullets(ObjectNode d, JsonNode src) {
        ArrayNode arr = F.arrayNode();
        for (JsonNode b : ResumeDocument.list(src, "bullets")) {
            String t = clip(b.isTextual() ? ResumeDocument.trimWs(b.textValue()) : "", MAX_TEXT);
            if (t.isEmpty()) continue;
            ObjectNode o = arr.addObject();
            o.put("text", t);
            o.put("src", "parsed");
        }
        if (arr.isEmpty()) return false;
        d.set("bullets", arr);
        return true;
    }

    private static String clip(String s, int max) {
        if (s == null) return "";
        if (s.codePointCount(0, s.length()) <= max) return s;
        return s.substring(0, s.offsetByCodePoints(0, max));
    }
}
