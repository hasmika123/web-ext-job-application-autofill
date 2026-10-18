package com.dossier.api.service.dto.ent;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * The Marketing Assignments board (design/enterprise-talent/marketing-assignments.png). Every figure is computed from
 * {@code marketer_assignment}, {@code marketer_capacity} and {@code consultant_profile} rows; requests carry only the fields named here and
 * never an organization id (the organization is the path).
 */
public final class MarketingAssignmentsDTO {

    private MarketingAssignmentsDTO() {}

    /** Most consultants one call may name. */
    public static final int BULK_MAX = 200;

    /** A marketer as a person on the board: the seat id and the name to show (initials are drawn by the client). */
    public record Person(Long memberId, String name) {}

    /** One marketing specialist card. {@code percent} = assigned * 100 / capacity (0 when capacity is 0). */
    public record Marketer(Long memberId, String name, String title, String status, int capacity, int assigned, int percent, boolean overloaded, boolean canManage) {}

    /** The footer of the left panel. {@code avgPerMarketer} is null when there is no active marketer. */
    public record Summary(int marketers, int totalAssigned, Double avgPerMarketer, int overloaded, int unassigned) {}

    public record MarketerList(List<Marketer> items, Summary summary, boolean canManage) {}

    /** One row of the right table. */
    public record Row(
        Long consultantId,
        String name,
        String jobTitle,
        String email,
        String availability,
        Person marketer,
        Person backup,
        String status,
        String priority,
        int activeApps,
        Instant lastActivityAt,
        Instant assignedAt
    ) {}

    public record Page(List<Row> items, int page, int size, long total, boolean hasMore) {}

    /**
     * One KPI tile. {@code previous} is the figure 30 days ago rebuilt from the rows' own timestamps (null when it cannot be known),
     * {@code delta} = current - previous, {@code deltaPct} = delta / previous (null when previous is 0). {@code series} is the same figure at the
     * end of each of the last 8 weeks, oldest first. {@code good} says which direction is good: UP, DOWN or NEUTRAL.
     */
    public record Tile(String key, long current, Long previous, Long delta, Double deltaPct, List<Long> series, String good) {}

    public record Kpis(List<Tile> tiles, Instant generatedAt, String note) {}

    /** One marketer of the workload report. */
    public record WorkloadRow(
        Long memberId, String name, String title, String status, int capacity, int assigned, int percent, boolean overloaded,
        int highPriority, int paused, int withoutBackup, int activeApps, int backupFor
    ) {}

    public record WorkloadReport(List<WorkloadRow> items, Summary summary, Instant generatedAt) {}

    /** A choice for a filter or a picker. */
    public record Option(Long id, String name, String detail) {}

    /** Filter options for the table: clients are listed only for a caller who may see clients. */
    public record Filters(List<Option> clients, List<String> statuses, List<String> priorities, List<String> availabilities) {}

    public record MarketerCandidates(List<Option> items) {}

    // ---- writes ----

    /** Assign or reassign. {@code allowOverCapacity} must be true to push the marketer above capacity. priority/status/backup are optional extras applied to every row. */
    public record AssignRequest(List<Long> consultantIds, Long marketerMemberId, Long backupMemberId, String priority, String status, Boolean allowOverCapacity, String reason) {}

    /** Set a field on many assignments. Exactly one of priority, status, backupMemberId or clearBackup is applied. */
    public record UpdateRequest(List<Long> consultantIds, String priority, String status, Long backupMemberId, Boolean clearBackup, String reason) {}

    public record UnassignRequest(List<Long> consultantIds, String reason) {}

    /** One assignment as it was (marketerMemberId null = there was none): what Undo sends back. */
    public record RestoreRow(Long consultantId, Long marketerMemberId, Long backupMemberId, String priority, String status) {}

    public record RestoreRequest(List<RestoreRow> rows) {}

    /** One move of a rebalance: this consultant goes to that marketer. */
    public record Move(Long consultantId, Long toMarketerMemberId) {}

    /** The Marketing Manager's rebalance: several moves in one call, one optional reason for all of them. */
    public record RebalanceRequest(List<Move> moves, String reason) {}

    public record AddMarketerRequest(Long memberId, Integer capacity, String title) {}

    public record UpdateMarketerRequest(Integer capacity, String status, String title) {}

    public record Skipped(Long consultantId, String reason) {}

    /** Outcome for one consultant; {@code previous} holds the assignment as it was (marketerMemberId, backupMemberId, priority, status) or an empty map when there was none. */
    public record RowResult(Long consultantId, boolean ok, String reason, Map<String, Object> previous) {}

    public record BulkResult(String action, int requested, int ok, List<Skipped> skipped, List<RowResult> results) {}

    // ---- history (Sprint 2 / B1) ----

    /** One line of a consultant assignment history: who changed what, when and why, and what open work moved with it. */
    public record HistoryItem(
        Long id, String action, Person fromMarketer, Person toMarketer, Person fromBackup, Person toBackup, String reason, Person actor, String handover, Instant at
    ) {}

    public record History(Long consultantId, String consultantName, Person currentMarketer, Person currentBackup, List<HistoryItem> items) {}
}
