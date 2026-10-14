package com.dossier.api.service.ent.mkt.home;

import java.time.Instant;
import java.util.List;

/**
 * The Marketing Home board (`GET /api/orgs/{orgId}/mkt/home`), exactly the JSON the web lib {@code marketer-ws/home.ts} parses. A section whose source has no
 * rows (or that the caller may not read) is an empty list / null, never a made-up number. E1: nothing here submits for a consultant.
 */
public final class MktHomeDto {

    private MktHomeDto() {}

    /** {@code key}: assigned, profilesReady, newMatches, pendingSubmissions, upcomingInterviews, overdueFollowups. {@code deltaPct} null = nothing to compare. */
    public record Kpi(String key, long value, Double deltaPct, List<Long> sparkline) {}

    /** {@code tone}: green, amber, blue, red, violet. */
    public record Chip(String label, String tone) {}

    /** {@code state}: UPDATED or NEEDS_UPDATE. */
    public record ResumeChip(String label, String state) {}

    public record Talent(Long id, String name, String avatarUrl, String primarySkill, Chip availability, ResumeChip resume, int activeApps, Chip nextAction) {}

    public record Stream(String source, String status, int newOpenings, Instant lastSyncAt) {}

    public record Opening(Long id, String title, String client, String location, int matchPct) {}

    public record Stage(String key, String label, long count, int pct) {}

    public record Pipeline(long total, Double deltaPct, List<Stage> stages) {}

    /** {@code kind}: CALL, EMAIL, CHAT, NOTE or DOC. */
    public record Task(Long id, String title, String sub, Instant dueAt, String kind, boolean done) {}

    public record Interview(Long id, Instant startsAt, String consultant, String avatarUrl, String role, String client, String type, String status) {}

    public record Activity(Long id, String actor, String avatarUrl, String text, String detail, Instant at) {}

    public record View(
        List<Kpi> kpis, List<Talent> talent, List<Stream> streams, List<Opening> openings, Pipeline pipeline, List<Task> tasks, List<Interview> interviews, List<Activity> activity
    ) {}
}
