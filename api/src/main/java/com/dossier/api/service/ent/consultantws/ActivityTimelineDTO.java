package com.dossier.api.service.ent.consultantws;

import java.time.Instant;
import java.util.List;

/** Wire shapes of the Consultant workspace Activity Timeline page (docs/enterprise-v2/page-consultant-activity-timeline.md). Read-only. */
public final class ActivityTimelineDTO {

    private ActivityTimelineDTO() {}

    /** A tile: the count in the window, the count in the window before it, the change (null when the earlier count is 0) and six weekly counts. */
    public record Tile(long value, Long previous, Double deltaPct, List<Long> sparkline, String vs) {}

    public record Tiles(Tile total, Tile thisWeek, Tile applications, Tile interviews, Tile profile) {}

    /**
     * The right-hand context chip of a row. {@code kind}: FILE (primary = file name), JOB (primary = role, secondary = company), DATES (from..to),
     * AVAILABILITY (primary = status, secondary = ISO date or null), TEXT (primary / secondary as written).
     */
    public record Chip(String kind, String primary, String secondary, String company, Instant from, Instant to) {}

    /**
     * One event. {@code group} is the filter group, {@code target} the workspace page that owns it (a path segment under /w/consultant),
     * {@code category} (APPLICATION, INTERVIEW, PROFILE or null) feeds the tiles, {@code sample} is true when the owning row is a demo stand-in.
     */
    public record Event(
        String key,
        String type,
        String group,
        String category,
        Instant at,
        String title,
        String description,
        Chip chip,
        String actionLabel,
        String target,
        boolean sample
    ) {}

    /** A milestone: reached when {@code reached}; {@code on} is the date (ISO instant or date) or null when open. */
    public record Milestone(String key, String label, boolean reached, String on) {}

    public record Response(
        Long orgId,
        Instant generatedAt,
        String consultantName,
        Tiles tiles,
        String type,
        int days,
        long total,
        List<Event> events,
        String nextCursor,
        List<Milestone> milestones
    ) {}
}
