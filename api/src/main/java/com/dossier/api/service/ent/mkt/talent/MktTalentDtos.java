package com.dossier.api.service.ent.mkt.talent;

import java.time.Instant;
import java.util.List;

/**
 * The wire types of the Marketing "My Assigned Talent" page ({@code /api/orgs/{orgId}/mkt/talent}). One call draws the board:
 * KPI tiles, status counts, filter facets, the table page, the three bottom cards, the caller's saved views and whether "Add
 * Consultant" is allowed. No sensitive PII anywhere: no phone, birth date, document or bank numbers, and no e-mail address.
 */
public final class MktTalentDtos {

    private MktTalentDtos() {}

    /** Percent change against last month; {@code deltaPct} is null when there is nothing to compare (no chip is drawn). */
    public record Kpi(String key, long value, Double deltaPct, List<Long> sparkline) {}

    public record Counts(long all, long availableNow, long inInterview, long needsUpdate, long pendingApproval) {}

    public record Facets(List<String> skills, List<String> locations) {}

    /** {@code code}: AVAILABLE_NOW, IN_INTERVIEW, SOON, LATER, ON_PROJECT, UNAVAILABLE. {@code tone}: green, blue, violet, amber, grey. */
    public record Availability(String code, String label, String tone) {}

    /** {@code state}: UP_TO_DATE, NEEDS_UPDATE, PENDING_APPROVAL. */
    public record ResumeStatus(String state, String label) {}

    public record Row(
        Long id,
        String name,
        String avatarUrl,
        String title,
        String primarySkill,
        Integer yearsExperience,
        String location,
        Availability availability,
        ResumeStatus resume,
        int activeApps,
        int assignedJobs
    ) {}

    public record Cards(List<Row> available, List<Row> needsUpdate, List<Row> inInterview) {}

    public record Filters(String q, String status, String skill, String location, String experience, String availability) {}

    public record View(Long id, String name, Filters filters) {}

    public record Response(
        List<Kpi> kpis,
        Counts counts,
        Facets facets,
        List<Row> items,
        long total,
        int page,
        int size,
        Cards cards,
        List<View> views,
        boolean canAddConsultant
    ) {}

    // ---- the consultant drawer (read-only summary, consent level SUMMARY: nothing sensitive) ------------------------------------

    public record DetailResume(Long id, String name, int version, boolean primary, String approval, Instant updatedAt) {}

    public record DetailApplication(String code, String jobTitle, String client, String stage, String nextAction) {}

    public record DetailInterview(Instant scheduledAt, String round, String client, int durationMinutes) {}

    public record DetailJob(Long jobId, String title, String client, int matchPct) {}

    public record Detail(
        Long id,
        String name,
        String avatarUrl,
        String title,
        String headline,
        Integer yearsExperience,
        String location,
        String workMode,
        Availability availability,
        ResumeStatus resume,
        int profileCompleteness,
        List<String> skills,
        List<DetailResume> resumes,
        List<DetailApplication> applications,
        List<DetailInterview> interviews,
        List<DetailJob> assignedJobs,
        String consent
    ) {}

    // ---- saved views ------------------------------------------------------------------------------------------------------------

    public record SaveViewRequest(String name, String q, String status, String skill, String location, String experience, String availability) {}
}
