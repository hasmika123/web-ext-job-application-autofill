package com.dossier.api.service.resume;

import com.dossier.api.domain.ProfileItem;
import com.dossier.api.domain.enumeration.ProfileSection;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The profile completeness meter (Resume Builder DESIGN v1 2.4, kept by v2 section 2). Pure: it
 * reads the flat bio payload and the user's live profile items and returns a score out of 100, the
 * nine parts it is made of, and the one next action (the highest-weight missing part).
 *
 * <p>Weights (sum 100): identity+contact 15 - location 5 - headline 5 - summary 10 - at least one
 * experience with at least two bullets 25 - education 10 - at least five skills 15 - links (any) 5 -
 * preferences (at least two answers) 10. A part is all-or-nothing, as the thresholds in the design
 * are. Definitions the design leaves open, fixed here and covered by {@code CompletenessTest}:
 * <ul>
 *   <li><b>identity</b>: firstName, lastName, email and phone all non-blank.</li>
 *   <li><b>location</b>: city and country non-blank.</li>
 *   <li><b>links</b>: linkedin, github or website non-blank, or any LINK item.</li>
 *   <li><b>skills</b>: five distinct skill names across all SKILL items (case-insensitive).</li>
 *   <li><b>preferences</b>: two of {@link #PREFERENCE_KEYS} non-blank.</li>
 *   <li>Hidden items count - hidden only means "leave out of new resumes by default".</li>
 * </ul>
 */
public final class ProfileCompleteness {

    /** Bio keys that are job-preference answers (the /welcome questions plus salary and referral). */
    public static final Set<String> PREFERENCE_KEYS = Set.of(
        "authorizedToWork",
        "requireSponsorship",
        "desiredSalary",
        "noticePeriod",
        "earliestStartDate",
        "workPreference",
        "willingToRelocate",
        "referralSource"
    );

    public static final int MIN_SKILLS = 5;
    public static final int MIN_BULLETS = 2;
    public static final int MIN_PREFERENCES = 2;

    /** A part's weight and whether it is satisfied. */
    public record Part(int weight, boolean done) {}

    /** The next thing to fill in: a part key, a short label and the profile tab that holds it. */
    public record NextAction(String key, String label, String href) {}

    /** {@code score} 0-100, {@code parts} by key in display order, {@code nextAction} null at 100. */
    public record Result(int score, Map<String, Part> parts, NextAction nextAction) {}

    private record Def(String key, int weight, String label, String tab) {}

    /** Display order = tie-break order for the next action. */
    private static final List<Def> DEFS = List.of(
        new Def("identity", 15, "Complete your name, email and phone", "personal"),
        new Def("location", 5, "Add your city and country", "personal"),
        new Def("headline", 5, "Add a headline", "personal"),
        new Def("summary", 10, "Write a short summary", "personal"),
        new Def("experience", 25, "Add a role with two or more bullet points", "work"),
        new Def("education", 10, "Add your education", "education"),
        new Def("skills", 15, "Add at least five skills", "skills"),
        new Def("links", 5, "Add a link (LinkedIn, GitHub or a website)", "personal"),
        new Def("preferences", 10, "Answer two job-preference questions", "preferences")
    );

    private ProfileCompleteness() {}

    /**
     * @param bio   the parsed bio payload (flat keys); {@code null} or a non-object reads as empty
     * @param items the user's live (not deleted) profile items, any order
     */
    public static Result compute(JsonNode bio, List<ProfileItem> items) {
        boolean[] done = new boolean[DEFS.size()];
        done[0] = filled(bio, "firstName") && filled(bio, "lastName") && filled(bio, "email") && filled(bio, "phone");
        done[1] = filled(bio, "city") && filled(bio, "country");
        done[2] = filled(bio, "headline");
        done[3] = filled(bio, "summary");
        done[4] = hasExperienceWithBullets(items);
        done[5] = items.stream().anyMatch(i -> i.getSection() == ProfileSection.EDUCATION);
        done[6] = skillNames(items).size() >= MIN_SKILLS;
        done[7] = filled(bio, "linkedin") || filled(bio, "github") || filled(bio, "website") || items.stream().anyMatch(i -> i.getSection() == ProfileSection.LINK);
        done[8] = PREFERENCE_KEYS.stream().filter(k -> filled(bio, k)).count() >= MIN_PREFERENCES;

        Map<String, Part> parts = new LinkedHashMap<>();
        int score = 0;
        Def best = null;
        for (int i = 0; i < DEFS.size(); i++) {
            Def d = DEFS.get(i);
            parts.put(d.key(), new Part(d.weight(), done[i]));
            if (done[i]) score += d.weight();
            else if (best == null || d.weight() > best.weight()) best = d;
        }
        NextAction next = best == null ? null : new NextAction(best.key(), best.label(), "/profiles?tab=" + best.tab());
        return new Result(score, parts, next);
    }

    private static boolean filled(JsonNode bio, String key) {
        if (bio == null || !bio.isObject()) return false;
        JsonNode v = bio.get(key);
        return v != null && !v.isNull() && v.isValueNode() && !v.asText("").trim().isEmpty();
    }

    private static boolean hasExperienceWithBullets(List<ProfileItem> items) {
        for (ProfileItem i : items) {
            if (i.getSection() != ProfileSection.EXPERIENCE) continue;
            if (bulletCount(parse(i.getDataJson())) >= MIN_BULLETS) return true;
        }
        return false;
    }

    private static int bulletCount(JsonNode data) {
        int n = 0;
        for (JsonNode b : ResumeDocument.list(data, "bullets")) {
            String t = b.isTextual() ? b.textValue() : b.isObject() ? ResumeDocument.str(b, "text") : "";
            if (!ResumeDocument.trimWs(t).isEmpty()) n++;
        }
        return n;
    }

    /** Distinct skill names (lower-cased) across every SKILL item; entries are strings or {@code {name}}. */
    static Set<String> skillNames(List<ProfileItem> items) {
        Set<String> names = new LinkedHashSet<>();
        for (ProfileItem i : items) {
            if (i.getSection() != ProfileSection.SKILL) continue;
            for (JsonNode s : ResumeDocument.list(parse(i.getDataJson()), "skills")) {
                String t = s.isTextual() ? s.textValue() : s.isObject() ? ResumeDocument.str(s, "name") : "";
                t = ResumeDocument.trimWs(t);
                if (!t.isEmpty()) names.add(t.toLowerCase(java.util.Locale.ROOT));
            }
        }
        return names;
    }

    private static JsonNode parse(String json) {
        try {
            return json == null ? null : ResumeDocument.parse(json);
        } catch (RuntimeException e) {
            return null;
        }
    }
}
