package com.dossier.api.service.ent.consultantws;

import java.time.Instant;
import java.util.List;

/**
 * Wire shapes of the Consultant workspace's Job Discovery page ({@code /api/orgs/{orgId}/me-workspace/job-discovery/**}). Everything
 * is computed from OPEN jobs of the caller's own organization and the caller's own rows; nothing here is placeholder data.
 */
public final class JobDiscoveryDTO {

    private JobDiscoveryDTO() {}

    /** The search filters, as the page sends them (every field optional). Also the body of "save this search". */
    public record Filters(String q, String location, String jobType, String workMode, String experience, String industry, String skill, Long clientId, Long minRateMinor) {}

    /** Body of {@code POST /saved-searches}. */
    public record SaveSearchRequest(String name, Filters filters) {}

    /**
     * One job card. {@code score} is the caller's own {@code requirement_match.score} when there is one ({@code scoreSource = MATCH}),
     * else the share of the job's required skills the consultant has ({@code SKILLS}); null when neither exists (no skills on the job
     * or on the profile). {@code relation} is NONE, MATCHED, ASSIGNED or APPLIED. {@code sourceUrl} (https only, or null), {@code sourceName} and {@code quickInfo} are the marketer's entries (table cws_job_source; Kiwiply holds no full posting); {@code sourceSample} marks demo stand-in rows.
     */
    public record Job(
        Long id,
        String title,
        Long clientId,
        String clientName,
        String industry,
        String location,
        String workMode,
        String employment,
        String duration,
        String experience,
        Long rateMinMinor,
        Long rateMaxMinor,
        String rateUnit,
        String currency,
        List<String> skills,
        Instant postedAt,
        boolean featured,
        boolean saved,
        Integer score,
        String scoreSource,
        int matchedSkills,
        int totalSkills,
        String relation,
        String applicationStage,
        String sourceUrl,
        String sourceName,
        String quickInfo,
        boolean sourceSample
    ) {}

    public record SearchResponse(Long orgId, long total, int page, int size, String sort, List<Job> items) {}

    /** {@code description} is the marketer's job notes on the requirement, not a full posting. */
    public record Detail(Job job, String description, int openPositions) {}

    public record SavedJobResult(Long requirementId, boolean saved) {}

    public record Option(String value, String label, Long count) {}

    public record FilterOptions(List<Option> jobTypes, List<Option> experience, List<Option> workModes, List<Option> industries, List<Option> clients, List<Option> skills) {}

    /** A recommended filter chip: {@code kind} is workMode, jobType, minRate, skill or industry; {@code source} is profile or market. */
    public record Chip(String key, String label, String kind, String value, String source) {}

    /** Open-job demand for a skill; {@code changePct} (postings in the last 30 days vs the 30 days before) is null when the earlier window is too small to compare. */
    public record TrendingSkill(String skill, long openJobs, long recent, long prior, Double changePct) {}

    public record SavedSearch(Long id, String name, Filters filters, long newResults, Instant createdAt, Instant lastViewedAt) {}

    public record RecentSearch(Long id, String label, Filters filters, Instant at) {}

    public record Me(Long consultantId, String name) {}

    public record Overview(
        Long orgId,
        Instant generatedAt,
        Me me,
        long openJobs,
        FilterOptions filterOptions,
        List<Chip> recommended,
        List<TrendingSkill> trending,
        List<SavedSearch> savedSearches,
        List<RecentSearch> recentSearches
    ) {}
}
