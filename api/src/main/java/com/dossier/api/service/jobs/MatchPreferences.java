package com.dossier.api.service.jobs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What a user's daily job matches look for (Phase 13.6b), built from what they already gave us — no
 * form to fill: the Tier A profile answers (city / state / country, work preference, relocation,
 * sponsorship) and their default resume (the latest roles' titles, seniority, years, skills).
 *
 * @param titles     the latest two role titles, as written
 * @param seniority  a {@link Seniority} level from the latest title, or from years when the title
 *                   doesn't say
 * @param years      years of experience, from the resume's dates (0 when unreadable)
 * @param skills     up to 30 skills from the resume
 * @param workPreference REMOTE, HYBRID, ONSITE or null
 */
public record MatchPreferences(
    List<String> titles,
    int seniority,
    int years,
    List<String> skills,
    String city,
    String state,
    String country,
    String workPreference,
    boolean relocate,
    boolean needsSponsorship
) {
    /** Seniority levels, lowest first. Management titles sit with staff/principal at the top of IC. */
    public static final class Seniority {

        public static final int INTERN = 0;
        public static final int JUNIOR = 1;
        public static final int MID = 2;
        public static final int SENIOR = 3;
        public static final int STAFF = 4;
        public static final int EXECUTIVE = 5;
        public static final int UNKNOWN = -1;

        private static final Pattern INTERN_RE = Pattern.compile("\\b(intern|internship|co-?op|apprentice|trainee)\\b");
        private static final Pattern JUNIOR_RE = Pattern.compile("\\b(junior|jr|entry[- ]level|graduate|new grad|associate)\\b");
        private static final Pattern SENIOR_RE = Pattern.compile("\\b(senior|sr)\\b");
        private static final Pattern STAFF_RE = Pattern.compile("\\b(staff|principal|lead|architect|distinguished)\\b");
        private static final Pattern EXEC_RE = Pattern.compile("\\b(director|head of|vp|vice president|chief|cto|ceo|cfo|coo|svp|evp)\\b");
        private static final Pattern LEVEL_RE = Pattern.compile("\\b(i{1,3}|iv|[1-4])$");

        private Seniority() {}

        /** The level a job title states, or {@link #UNKNOWN} when it doesn't say. */
        public static int of(String title) {
            String t = title == null ? "" : title.toLowerCase(Locale.ROOT);
            if (EXEC_RE.matcher(t).find()) return EXECUTIVE;
            if (INTERN_RE.matcher(t).find()) return INTERN;
            if (STAFF_RE.matcher(t).find()) return STAFF;
            if (SENIOR_RE.matcher(t).find()) return SENIOR;
            if (JUNIOR_RE.matcher(t).find()) return JUNIOR;
            Matcher m = LEVEL_RE.matcher(t.replaceAll("[^a-z0-9 ]", " ").trim());
            if (m.find()) {
                return switch (m.group(1)) {
                    case "i", "1" -> JUNIOR;
                    case "ii", "2" -> MID;
                    case "iii", "3" -> SENIOR;
                    default -> STAFF;
                };
            }
            return UNKNOWN;
        }

        /** A level from years of experience, for a resume whose latest title doesn't say. */
        static int fromYears(int years) {
            if (years < 2) return JUNIOR;
            if (years < 5) return MID;
            if (years < 9) return SENIOR;
            return STAFF;
        }
    }

    private static final ObjectMapper OM = new ObjectMapper();
    private static final int MAX_SKILLS = 30;

    /** From the profile's JSON payload and the default resume's parsed JSON (either may be blank). */
    public static MatchPreferences from(String bioJson, String resumeJson, LocalDate today) {
        JsonNode bio = read(bioJson);
        JsonNode resume = read(resumeJson);

        List<String> titles = new ArrayList<>();
        for (JsonNode e : resume.path("experience")) {
            String t = e.path("title").asText("").trim();
            if (!t.isEmpty() && titles.size() < 2) titles.add(t);
        }
        Set<String> skills = new LinkedHashSet<>();
        resume.path("skills").forEach(s -> {
            String v = s.asText("").trim();
            if (!v.isEmpty() && v.length() <= 40 && skills.size() < MAX_SKILLS) skills.add(v);
        });
        int years = years(resume.path("experience"), today);
        int level = titles.isEmpty() ? Seniority.UNKNOWN : Seniority.of(titles.get(0));
        if (level == Seniority.UNKNOWN && years > 0) level = Seniority.fromYears(years);

        return new MatchPreferences(
            titles,
            level,
            years,
            List.copyOf(skills),
            text(bio, "city"),
            text(bio, "state"),
            text(bio, "country"),
            workPreference(text(bio, "workPreference")),
            yes(text(bio, "willingToRelocate")),
            yes(text(bio, "requireSponsorship"))
        );
    }

    /** Anything to match on at all: a role title or a handful of skills. */
    public boolean usable() {
        return !titles.isEmpty() || skills.size() >= 3;
    }

    static String workPreference(String raw) {
        String w = raw == null ? "" : raw.toLowerCase(Locale.ROOT);
        if (w.contains("remote")) return "REMOTE";
        if (w.contains("hybrid")) return "HYBRID";
        if (w.contains("site") || w.contains("office")) return "ONSITE";
        return null;
    }

    /** Whole years covered by the resume's roles, overlaps counted once. */
    static int years(JsonNode experience, LocalDate today) {
        List<int[]> spans = new ArrayList<>();
        int now = today.getYear() * 12 + today.getMonthValue() - 1;
        for (JsonNode e : experience) {
            Integer s = monthIndex(e.path("startDate").asText(""));
            if (s == null) continue;
            boolean current = e.path("current").asBoolean(false) || e.path("endDate").asText("").toLowerCase(Locale.ROOT).matches(".*(present|current|now).*");
            Integer end = current ? Integer.valueOf(now) : monthIndex(e.path("endDate").asText(""));
            if (end == null) end = s + 12; // a role with no end date: count a year, not a career
            if (end > s) spans.add(new int[] { s, Math.min(end, now) });
        }
        spans.sort((a, b) -> Integer.compare(a[0], b[0]));
        int months = 0, curS = -1, curE = -1;
        for (int[] sp : spans) {
            if (sp[0] > curE) {
                if (curE > curS) months += curE - curS;
                curS = sp[0];
                curE = sp[1];
            } else curE = Math.max(curE, sp[1]);
        }
        if (curE > curS) months += curE - curS;
        return months / 12;
    }

    private static final Pattern YEAR = Pattern.compile("(19|20)\\d{2}");
    private static final Pattern MONTH_NUM = Pattern.compile("^(\\d{1,2})[/.-](\\d{4})$|^(\\d{4})[/.-](\\d{1,2})");
    private static final String[] MONTHS = { "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec" };

    static Integer monthIndex(String s) {
        if (s == null || s.isBlank()) return null;
        String t = s.trim();
        Matcher mn = MONTH_NUM.matcher(t);
        if (mn.find()) {
            int month = Integer.parseInt(mn.group(1) != null ? mn.group(1) : mn.group(4));
            int year = Integer.parseInt(mn.group(2) != null ? mn.group(2) : mn.group(3));
            return month >= 1 && month <= 12 ? year * 12 + month - 1 : null;
        }
        Matcher y = YEAR.matcher(t);
        if (!y.find()) return null;
        int year = Integer.parseInt(y.group());
        String lc = t.toLowerCase(Locale.ROOT);
        for (int m = 0; m < 12; m++) if (lc.contains(MONTHS[m])) return year * 12 + m;
        return year * 12;
    }

    private static JsonNode read(String json) {
        try {
            JsonNode n = json == null || json.isBlank() ? null : OM.readTree(json);
            return n != null && n.isObject() ? n : OM.createObjectNode();
        } catch (Exception e) {
            return OM.createObjectNode();
        }
    }

    private static String text(JsonNode n, String key) {
        JsonNode v = n.get(key);
        String s = v == null || !v.isValueNode() ? "" : v.asText("").trim();
        return s.isEmpty() ? null : s;
    }

    private static boolean yes(String v) {
        return v != null && v.trim().toLowerCase(Locale.ROOT).startsWith("y");
    }
}
