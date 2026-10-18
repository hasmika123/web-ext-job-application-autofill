package com.dossier.api.service.ent.consultantws;

import java.time.LocalDate;
import java.util.List;

/**
 * Wire shape of {@code GET /api/orgs/{orgId}/me-workspace/profile} (and of every write under it: each write answers with the fresh
 * view). Everything is the signed-in consultant's own data. No photo, no date of birth, no document numbers: work authorization is a
 * status choice only.
 */
public final class ConsultantProfileDTO {

    private ConsultantProfileDTO() {}

    public record Response(
        Long orgId,
        Me me,
        Availability availability,
        Strength strength,
        Summary summary,
        List<Skill> skills,
        List<Certification> certifications,
        Experience experience,
        Preferences preferences,
        String workAuthorization,
        String careerGoals
    ) {}

    /** phone / timeZone (IANA id) / preferredContact (EMAIL, PHONE or TEXT) are the contact fields the assigned marketer sees; all optional. */
    public record Me(Long consultantId, String name, String jobTitle, Integer yearsExperience, String location, String workMode, String phone, String timeZone, String preferredContact) {}

    public record ContactBody(String phone, String timeZone, String preferredContact) {}

    /** status: AVAILABLE, ON_PROJECT, NOTICE or UNAVAILABLE. */
    public record Availability(String status, LocalDate since, LocalDate availableFrom) {}

    /** percent is the stored profile_completeness; missing lists what is actually absent (section = the card to jump to). */
    public record Strength(int percent, List<Missing> missing) {}

    public record Missing(String key, String label, String section) {}

    /** source: RESUME (the primary resume's summary), PROFILE (kept on the profile while there is no resume) or NONE. */
    public record Summary(String text, String source, boolean hasResume) {}

    public record Skill(Long id, String skill, boolean primary) {}

    /** issuedOn is the first day of the month (the page shows month and year). */
    public record Certification(Long id, String name, String issuer, LocalDate issuedOn) {}

    /** The primary (else latest) resume's experience rows; read-only here (edited on My Resumes). endYear null = present. */
    public record Experience(String resumeName, List<ExperienceItem> items) {}

    public record ExperienceItem(Long id, String title, String employer, Integer startYear, Integer endYear) {}

    public record PrefItem(Long id, String value) {}

    /** employmentTypes: chosen codes among CONTRACT, CONTRACT_TO_HIRE, FULL_TIME, PART_TIME. */
    public record Preferences(List<PrefItem> roles, List<PrefItem> locations, List<String> employmentTypes) {}
}
