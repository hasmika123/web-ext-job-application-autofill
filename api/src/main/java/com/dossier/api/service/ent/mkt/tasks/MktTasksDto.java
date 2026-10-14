package com.dossier.api.service.ent.mkt.tasks;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

/** Wire shapes of the Tasks page (`/api/orgs/{orgId}/mkt/tasks`). E1: nothing here submits for a consultant or mails anyone. */
public final class MktTasksDto {

    private MktTasksDto() {}

    /** The pill tabs of the board. ALL, MY, TEAM, OVERDUE and DUE_WEEK are OPEN tasks; COMPLETED is what was completed in the last 7 days. */
    public enum Tab { ALL, MY, TEAM, OVERDUE, DUE_WEEK, COMPLETED }

    /** The list query: every filter is optional; {@code owner} is a member id or {@code me}; {@code due} is a UTC day {@code yyyy-MM-dd}. */
    public record Query(Tab tab, String category, String priority, String status, String owner, String due, String q, int page, int size, String sort) {}

    /**
     * One task row. {@code overdue} is derived (open and due before now); {@code mine} says the caller owns it; {@code canDelete} is mine and open.
     * The related party is the consultant, else the client, else the free label; {@code avatarUrl} is null unless the org has one.
     */
    public record Row(
        Long id, String title, String detail, String category, String priority, String status, boolean overdue, Instant dueAt, Instant completedAt,
        Long consultantId, String consultantName, Long clientAccountId, String clientName, String relatedLabel,
        Long ownerMemberId, String ownerName, String avatarUrl, boolean mine, boolean canDelete
    ) {}

    public record Page(List<Row> items, long total, int page, int size) {}

    /** {@code deltaPct} is null when there is nothing to compare against. */
    public record Kpi(String key, long value, Double deltaPct, List<Long> sparkline) {}

    /** The counts on the tab pills. {@code team} is 0 unless the caller's scope is wider than ASSIGNED. */
    public record Tabs(long all, long my, long team, long overdue, long dueThisWeek, long completed) {}

    public record Option(Long id, String name) {}

    /** What the Add Task form and the Owner filter offer: only consultants the caller may see. */
    public record Options(List<Option> consultants, List<Option> clients, List<Option> owners) {}

    public record View(Instant generatedAt, boolean wide, List<Kpi> kpis, Tabs tabs, Page tasks, List<Row> upcoming, Options options) {}

    /** One day of the Calendar that has tasks. {@code topPriority} is the highest priority among them. */
    public record CalendarDay(String date, int total, int open, String topPriority) {}

    public record Calendar(String month, List<CalendarDay> days) {}

    public record CreateRequest(
        @NotBlank @Size(max = 160) String title, @Size(max = 200) String detail, String category, String priority, String status, @NotNull Instant dueAt,
        Long consultantId, Long clientAccountId, @Size(max = 120) String relatedLabel, Long ownerMemberId
    ) {}

    /** Every field optional: only what is sent changes. */
    public record UpdateRequest(
        @Size(max = 160) String title, @Size(max = 200) String detail, String category, String priority, String status, Instant dueAt, @Size(max = 120) String relatedLabel
    ) {}

    public record ReassignRequest(@NotNull Long ownerMemberId) {}

    /** What a write did. {@code emailed} is always false: nothing in the Tasks page sends a message. {@code item} is null after a delete. */
    public record ActionResult(Row item, String event, boolean emailed) {}
}
