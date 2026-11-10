package com.dossier.api.service.ent.consultantws;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Wire shapes of the Consultant workspace Tasks and Follow-ups page (docs/enterprise-v2/page-consultant-tasks.md). */
public final class ConsultantTasksDTO {

    private ConsultantTasksDTO() {}

    /** A tile: the value, the earlier value, the change and six weekly counts. {@code deltaPct} is null when there is nothing earlier to compare with. */
    public record Tile(long value, Long previous, Double deltaPct, List<Long> sparkline) {}

    public record Tiles(Tile total, Tile dueToday, Tile upcoming, Tile overdue, Tile completedThisWeek) {}

    /** The count on each tab (always over all of the consultant's tasks, never the filtered set). */
    public record TabCounts(long all, long today, long week, long overdue, long completed) {}

    /** Who assigned a task: {@code kind} is SELF (the consultant) or MARKETER; {@code sample} marks a demo stand-in. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record AssignedBy(String kind, String name, boolean sample) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Row(
        long id,
        String title,
        String type,
        Long requirementId,
        String jobTitle,
        String company,
        String priority,
        String status,
        LocalDate dueOn,
        boolean overdue,
        boolean dueToday,
        AssignedBy assignedBy,
        Instant completedAt,
        Instant createdAt
    ) {}

    public record TaskPage(List<Row> items, int page, int size, long total, int totalPages, TabCounts counts) {}

    /** A checkable item of Today's Focus (a task due today or already overdue and still open). */
    public record FocusItem(long taskId, String title, String status, boolean done) {}

    /** One upcoming deadline: an open task due today or later. */
    public record Deadline(long taskId, String title, String jobTitle, String company, LocalDate dueOn, String priority) {}

    /** The completion ring: every one of the consultant's tasks lands in exactly one of the four counts, so they add up to {@code total}. */
    public record Insights(long total, long completed, long inProgress, long notStarted, long overdue, int completionPct, long completedThisWeek, long completedLastWeek, String note) {}

    /** A derived reminder (an interview, a submission waiting for approval, an application follow-up). {@code href} is a workspace-relative path. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Reminder(String kind, String title, String subtitle, Instant at, String href) {}

    /** A job the consultant may link a task to (their own matches and applications). */
    public record JobOption(long id, String title, String company) {}

    public record Response(
        long orgId,
        Instant generatedAt,
        LocalDate today,
        String name,
        Tiles tiles,
        TaskPage tasks,
        List<FocusItem> focus,
        List<Deadline> deadlines,
        Insights insights,
        List<Reminder> reminders,
        List<JobOption> jobs,
        List<String> assigners
    ) {}

    /** The body of a create or an update: the whole editable set (an update replaces it; an omitted due date or job clears it). */
    public record TaskRequest(String title, String dueOn, String priority, String type, Long requirementId) {}

    public record StatusRequest(String status) {}
}
