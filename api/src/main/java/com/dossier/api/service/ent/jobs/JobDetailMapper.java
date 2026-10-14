package com.dossier.api.service.ent.jobs;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

/**
 * The single place a job's fields are chosen for a page (docs/enterprise-v2/60 section 10): every {@code Con*} and {@code Mkt*} job DTO is built
 * from {@code (row, cap)} through here, and the fields above the effective level are ABSENT, never hidden by the client.
 *
 * <p>Two controls, one table. The stored level is the job's own {@code detail_level} (what we hold; the extension only ever writes MINIMAL). The cap is
 * the organization's {@code enterprise.jobs.detail_cap} (what the pages may show). {@link #effectiveLevel} is the LOWER of the two, evaluated at read
 * time, so raising or lowering the cap takes effect at once.
 *
 * <p>Skeleton: today only the MINIMAL field set exists ({@link MinimalJob}); a FULL job returns the same fields until the licensed source writes
 * FULL-only data (Phase 2), at which point the extra fields are added here and nowhere else. The description is deliberately not in the minimal set:
 * {@code client_requirement.description_text} is the marketer's own summary and reaches a page only through the opportunity's marketer note.
 */
public final class JobDetailMapper {

    public static final String MINIMAL = "MINIMAL";
    public static final String FULL = "FULL";

    /**
     * Names that may never appear in a MINIMAL job DTO or export (the leak test reflects over {@link MinimalJob} against this list). Extend it when a
     * FULL-only field is added to the model.
     */
    public static final Set<String> FULL_ONLY_FIELDS = Set.of(
        "description", "descriptionText", "descriptionLong", "jobDescription", "fullText", "structuredJson", "responsibilities", "requirements", "qualifications",
        "benefits", "contacts", "contactName", "contactEmail", "recruiter", "recruiterName", "recruiterEmail", "applicantCount", "licenseKind", "termsRef"
    );

    /**
     * The facts a MINIMAL job carries: what the posting is and where to read it. {@code payMinMinor}/{@code payMaxMinor} are minor currency units
     * ({@code payPeriod} HOUR, MONTH or YEAR); a consultant-facing DTO shows {@code payLabel} only.
     */
    public record MinimalJob(
        Long id,
        String title,
        String employer,
        String location,
        String workMode,
        String employmentType,
        String payLabel,
        Long payMinMinor,
        Long payMaxMinor,
        String payPeriod,
        String currency,
        String jobUrl,
        String atsPlatform,
        String externalJobId,
        LocalDate postedOn,
        List<String> skills
    ) {}

    /** A job as a page may show it: the effective level, and the fields that level allows. */
    public record View(String detailLevel, MinimalJob job) {}

    private JobDetailMapper() {}

    /** The lower of the job's stored level and the organization's cap; anything unrecognised counts as MINIMAL (fail closed). */
    public static String effectiveLevel(String rowLevel, String orgCap) {
        return FULL.equals(rowLevel) && FULL.equals(orgCap) ? FULL : MINIMAL;
    }

    /** {@link #minimalJobFields(ClientRequirement, String, List)} with no employer name and no skills (the caller joins those in). */
    public static MinimalJob minimalJobFields(ClientRequirement job) {
        return minimalJobFields(job, null, List.of());
    }

    /** The MINIMAL field set of {@code job}: {@code employer} is the {@code client_account} name, {@code skills} the {@code requirement_skill} names. */
    public static MinimalJob minimalJobFields(ClientRequirement job, String employer, List<String> skills) {
        return new MinimalJob(
            job.getId(),
            job.getTitle(),
            employer,
            job.getLocation(),
            job.getWorkMode(),
            job.getEmploymentLabel(),
            job.getPayLabel(),
            job.getRateMinMinor(),
            job.getRateMaxMinor(),
            job.getRateUnit(),
            job.getCurrency(),
            job.getJobUrl(),
            job.getAtsPlatform(),
            job.getExternalJobId(),
            job.getPostedOn(),
            skills == null ? List.of() : List.copyOf(skills)
        );
    }

    /** The job as a page of an organization with cap {@code orgCap} may show it. */
    public static View view(ClientRequirement job, String employer, List<String> skills, String orgCap) {
        return new View(effectiveLevel(job.getDetailLevel(), orgCap), minimalJobFields(job, employer, skills));
    }
}
