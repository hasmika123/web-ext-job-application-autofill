package com.dossier.api.service.ent.mkt.matches;

import java.time.Instant;
import java.util.List;

/** Wire shapes of {@code /api/orgs/{orgId}/mkt/matches}. No contact data, no phone, no documents: names, titles, skills and scores only. */
public final class MktMatchesDto {

    private MktMatchesDto() {}

    /** One KPI tile: value, percent change against last month (null = nothing to compare) and the last 8 weekly buckets. */
    /** Optional body of {@code POST .../assign}: the answer to a 409 DUPLICATE_WARNING (confirm with a reason of 1 to 200 characters). */
    public record AssignRequest(Boolean confirmDuplicate, String duplicateReason) {}

    public record Kpi(String key, long value, Double deltaPct, List<Long> sparkline) {}

    public record Option(String key, String label) {}

    public record Filters(List<Option> consultants, List<String> skills, List<Option> clients, List<Option> scores) {}

    public record Availability(String key, String label, String tone, int pct) {}

    public record ResumeUpdate(boolean needed, List<String> reasons) {}

    /** A row of the Consultant - Job Matches table (also the shape of "Top Matches Today"). */
    public record Row(
        Long id,
        Long consultantId,
        String consultantName,
        String avatarUrl,
        String consultantRole,
        String primarySkill,
        Long requirementId,
        String jobTitle,
        Long clientId,
        String client,
        int score,
        String status,
        boolean stale,
        boolean highConfidence,
        Availability availability,
        ResumeUpdate resumeUpdate,
        Instant createdAt
    ) {}

    /** One line of "Why this is a great match": {@code ok} false = a gap the marketer should know about. */
    public record Tick(String key, boolean ok, String text) {}

    /** One bar of Match Insights; {@code pct} null = no data (never a made-up number). */
    public record Insight(String key, String label, Integer pct) {}

    public record Person(Long id, String name, String role, String avatarUrl, List<String> skills) {}

    public record Job(Long id, String title, String client, String location, List<String> skills) {}

    /** Match Explanation + Match Insights of one match; also the body of the Review and Compare drawers. */
    public record Detail(
        Row row,
        Person consultant,
        Job job,
        List<Tick> ticks,
        List<Insight> insights,
        List<String> missingSkills,
        String reason,
        Instant assignedAt
    ) {}

    public record Response(
        List<Kpi> kpis,
        Filters filters,
        List<Row> items,
        long total,
        int page,
        int size,
        List<Row> topToday,
        Detail explanation,
        int highConfidenceMin,
        int staleDays
    ) {}

    public record Compare(Detail a, Detail b) {}
}
