package com.dossier.api.service.ent.mkt.jobs;

import java.time.Instant;
import java.util.List;

/** Wire shapes of the Job Discovery page (`/api/orgs/{orgId}/mkt/jobs`). One call draws the whole board. */
public final class MktJobsDTO {

    private MktJobsDTO() {}

    /** The list parameters of the board: paging, the search box and the filter row. {@code sort}: posted_desc (default), posted_asc, rate_desc, title_asc, client_asc. */
    public record Query(int page, int size, String q, List<String> skills, String location, String workType, String visa, String source, Integer rateMin, Integer rateMax, String sort) {}

    /** The filter row as the Saved Searches card stores it ({@code mkt_saved_search.criteria}); also what a saved search puts back into the filters. */
    public record Criteria(String q, List<String> skills, String location, String workType, String visa, String source, Integer rateMin, Integer rateMax) {}

    public record Client(Long id, String name, String logoUrl) {}

    /** The job's own rate fields (minor units, its own unit and currency). */
    public record Rate(Long min, Long max, String unit, String currency) {}

    public record Job(
        Long id,
        String title,
        Client client,
        String location,
        String workMode,
        String rateLabel,
        Rate rate,
        String source,
        Instant postedAt,
        String priority,
        String visa,
        List<String> skills,
        Integer positions,
        String status,
        /** The effective display level of this job for the organization (MINIMAL or FULL): the lower of the stored level and the org cap. */
        String detailLevel
    ) {}

    /** A KPI tile: the number, the percent change against the comparison window (null = nothing to compare) and the last 8 buckets. */
    public record Tile(long value, Double deltaPct, List<Long> sparkline) {}

    public record Kpis(Tile newToday, Tile highMatch, Tile assigned, Tile savedSearches) {}

    public record TrendingSkill(int rank, String skill, int openings, Double deltaPct, int barPct) {}

    public record TopClient(Long id, String name, String logoUrl, int openings, List<String> topSkills, Double deltaPct) {}

    /** {@code kind}: CLIENT (a client posted new roles) or SEARCH (new roles match a saved search of the caller). */
    public record Alert(String id, String kind, String text, Instant at, Long clientId, String logoUrl) {}

    public record SavedSearch(Long id, String name, Criteria criteria, int newCount) {}

    public record Stream(Long clientId, String name, String subtitle, String logoUrl, int newThisWeek, String status) {}

    public record Facets(List<String> skills, List<String> locations, List<String> workTypes, List<String> visas, List<String> sources) {}

    public record Response(
        Kpis kpis,
        List<Job> items,
        long total,
        int page,
        int size,
        boolean canAssign,
        Facets facets,
        List<TrendingSkill> trendingSkills,
        List<TopClient> topClients,
        List<Alert> alerts,
        List<SavedSearch> savedSearches,
        List<Stream> streams
    ) {}

    /** One consultant's match to the job, restricted to consultants the caller may see. */
    public record MatchRow(Long consultantId, String name, int score, String status) {}

    public record Detail(Job job, String description, String employment, String duration, String experienceLevel, List<MatchRow> matches, String summaryNote) {}

    /** A consultant the caller may assign; {@code score}/{@code matchStatus} are null when there is no match row yet. */
    /** {@code pausedReason} is non-null for a consultant who cannot be assigned right now (the picker shows them disabled with these words). {@code memberId} is the organization seat (what "Save for a consultant" names). */
    public record Candidate(Long consultantId, String name, String title, String availability, Integer score, String matchStatus, String pausedReason, Long memberId) {}

    public record AssignRequest(Long consultantId, Boolean confirmDuplicate, String duplicateReason) {}

    /** The record the assignment created or updated (a match row in ASSIGNED). Never a submission (E1). */
    public record AssignResult(Long matchId, Long requirementId, Long consultantId, String status, int score, boolean created) {}

    public record SavedSearchRequest(String name, Criteria criteria) {}
}
