package com.dossier.api.service.ent.mgmt;

import com.dossier.api.service.ent.mkt.escalations.EscalationDTO;
import java.time.Instant;
import java.util.List;

/**
 * The Marketing Manager's Home (docs/enterprise-v2/deferred/marketing-manager.md section 4.3). Every number is a count of the team's own rows; people appear by
 * display name only. {@code empty} is true for a manager with no marketer in scope (the page shows its "Build your team" state; it is never a 404).
 */
public record MgmtHomeDTO(
    boolean empty,
    Instant generatedAt,
    Tiles tiles,
    Pipeline pipeline,
    List<LoadRow> workload,
    List<NeedsYou> needsYou,
    List<ActivityRow> activity
) {
    /** The tiles: marketers (active and paused), consultants covered, open opportunities, approvals waiting (the badge), and the live escalations by severity. */
    public record Tiles(long marketersActive, long marketersPaused, long consultantsCovered, long openOpportunities, long approvalsWaiting, EscalationDTO.Counts escalations) {}

    /** The pipeline this week against the week before; {@code deltaPct} is null when last week was 0. */
    public record Pipeline(Stat assigned, Stat interested, Stat submitted, Stat interviews) {}

    public record Stat(long thisWeek, long lastWeek, Double deltaPct) {}

    /** One of the most loaded marketers: assigned consultants against capacity. */
    public record LoadRow(Long memberId, String name, int assigned, int capacity, int percent, boolean overloaded) {}

    /** One thing that waits for the manager: the oldest approvals and the most severe escalations. {@code type} is APPROVAL or ESCALATION. */
    public record NeedsYou(String type, Long id, String title, String severity, String who, Instant since, String link) {}

    /** A line of the team's activity feed (what the marketers recorded). */
    public record ActivityRow(Long id, String type, String text, String consultant, String actor, Instant at) {}
}
