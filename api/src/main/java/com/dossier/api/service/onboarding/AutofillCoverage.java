package com.dossier.api.service.onboarding;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The honest "~N fields" of the setup payoff (Onboarding v2 DESIGN 10, DECISIONS #33f). Pure: how many form
 * fields the extension can fill for this person, computed from what is really in the profile, never a
 * marketing constant.
 *
 * <ul>
 *   <li><b>Direct fields</b>: the extension's canonical schema keys ({@link #FIELD_KEYS}, the keys of
 *       {@code job-autofill/src/lib/schema.js FIELDS}) that are non-blank in {@code bio.payload}. {@code fullName}
 *       counts when first and last name are both set. EEO keys count only when the user answered.</li>
 *   <li><b>Repeated fields</b>: 5 per profile experience (at most 3 experiences), 4 per education (at most 2),
 *       and 1 when there is at least one skill.</li>
 * </ul>
 *
 * Each field belongs to one of seven groups ({@code contact, links, work, education, skills, preferences, eeo}),
 * so the groups always sum to {@code fields}. The web twin is {@code web/src/lib/onboarding/coverage.ts}; both run
 * the same fixtures ({@code coverage-*.json}), and a web parity test fails when the extension's schema keys change.
 */
public final class AutofillCoverage {

    public static final int EXPERIENCE_FIELDS_EACH = 5;
    public static final int EXPERIENCE_MAX_ITEMS = 3;
    public static final int EDUCATION_FIELDS_EACH = 4;
    public static final int EDUCATION_MAX_ITEMS = 2;

    /** The 31 canonical keys of the extension's schema, in schema order. */
    public static final List<String> FIELD_KEYS = List.of(
        "firstName",
        "lastName",
        "fullName",
        "preferredName",
        "email",
        "phone",
        "addressLine1",
        "addressLine2",
        "city",
        "state",
        "postalCode",
        "country",
        "linkedin",
        "github",
        "website",
        "authorizedToWork",
        "requireSponsorship",
        "desiredSalary",
        "noticePeriod",
        "earliestStartDate",
        "workPreference",
        "willingToRelocate",
        "referralSource",
        "summary",
        "skills",
        "coverLetter",
        "gender",
        "race",
        "ethnicity",
        "veteranStatus",
        "disabilityStatus"
    );

    public static final List<String> GROUPS = List.of("contact", "links", "work", "education", "skills", "preferences", "eeo");

    private static final List<String> CONTACT = List.of(
        "firstName", "lastName", "fullName", "preferredName", "email", "phone", "addressLine1", "addressLine2", "city", "state", "postalCode", "country"
    );
    private static final List<String> LINKS = List.of("linkedin", "github", "website");
    private static final List<String> PREFERENCES = List.of(
        "authorizedToWork", "requireSponsorship", "desiredSalary", "noticePeriod", "earliestStartDate", "workPreference", "willingToRelocate", "referralSource"
    );
    private static final List<String> EEO = List.of("gender", "race", "ethnicity", "veteranStatus", "disabilityStatus");
    // The summary and cover letter are the career narrative: they count with the work group.
    private static final List<String> WORK_TEXT = List.of("summary", "coverLetter");

    /** How many live profile items of each repeated kind the profile holds. */
    public record Counts(int experience, int education, int skills) {}

    /** {@code fields} = the sum of {@code groups}. */
    public record Result(int fields, Map<String, Integer> groups) {}

    private AutofillCoverage() {}

    public static Result compute(JsonNode bio, Counts counts) {
        Counts c = counts == null ? new Counts(0, 0, 0) : counts;
        Map<String, Integer> groups = new LinkedHashMap<>();
        for (String g : GROUPS) groups.put(g, 0);

        groups.put("contact", present(bio, CONTACT));
        groups.put("links", present(bio, LINKS));
        groups.put("preferences", present(bio, PREFERENCES));
        groups.put("eeo", present(bio, EEO));
        groups.put("work", present(bio, WORK_TEXT) + EXPERIENCE_FIELDS_EACH * Math.min(Math.max(0, c.experience()), EXPERIENCE_MAX_ITEMS));
        groups.put("education", EDUCATION_FIELDS_EACH * Math.min(Math.max(0, c.education()), EDUCATION_MAX_ITEMS));
        // The schema's "skills" key and the profile's skill items are the same field: counted once.
        groups.put("skills", filled(bio, "skills") || c.skills() >= 1 ? 1 : 0);

        int total = groups.values().stream().mapToInt(Integer::intValue).sum();
        return new Result(total, groups);
    }

    private static int present(JsonNode bio, List<String> keys) {
        int n = 0;
        for (String k : keys) {
            if (k.equals("fullName") ? filled(bio, "firstName") && filled(bio, "lastName") : filled(bio, k)) n++;
        }
        return n;
    }

    /** A key with a real value: non-blank text, a number or boolean, or a non-empty array / object. */
    private static boolean filled(JsonNode bio, String key) {
        if (bio == null || !bio.isObject()) return false;
        JsonNode v = bio.get(key);
        if (v == null || v.isNull() || v.isMissingNode()) return false;
        if (v.isTextual()) return !v.textValue().isBlank();
        if (v.isContainerNode()) return v.size() > 0;
        return true;
    }
}
