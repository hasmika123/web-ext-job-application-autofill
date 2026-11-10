package com.dossier.api.service.ent.mkt.interviews;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Wire shapes of the Marketing Interviews page ({@code /api/orgs/{orgId}/mkt/interviews}). No sensitive PII: names, labels and times only. */
public final class MktInterviewsDto {

    private MktInterviewsDto() {}

    /** KPI tile: {@code deltaPct} is null when there is no previous value to compare; {@code sparkline} = last 8 weekly buckets, oldest first. */
    public record Kpi(String key, long value, Double deltaPct, List<Long> sparkline) {}

    /**
     * One interview as the board draws it. {@code type}: VIDEO / ONSITE / TECHNICAL / PANEL / CLIENT. {@code status}: CONFIRMED / SCHEDULED /
     * PENDING_FEEDBACK / RESCHEDULED / AWAITING_CONFIRMATION / COMPLETED (derived from the meta row, the slot's status and the time).
     * {@code proposedFor} is a reschedule PROPOSAL the consultant has not confirmed yet.
     */
    public record Row(
        Long id, Long consultantId, String consultant, String avatarUrl, String role, Long clientId, String client, String type,
        Instant startsAt, int durationMinutes, String round, String recruiter, String status, Instant proposedFor, int rescheduleCount
    ) {}

    public record Schedule(List<Row> items, long total, int page, int size, LocalDate from, LocalDate to) {}

    public record FeedbackRow(Long id, Instant interviewAt, String consultant, String avatarUrl, String client, String round, int daysOverdue) {}

    public record PrepItem(Long id, String label, boolean done) {}

    public record Checklist(Long interviewId, String consultant, String client, List<PrepItem> items) {}

    public record Reminder(Long id, Instant startsAt, String consultant, String client, String type) {}

    public record ClientOption(Long id, String name) {}

    public record Overview(
        Instant generatedAt, List<Kpi> kpis, Schedule schedule, List<Row> upcoming, List<FeedbackRow> pendingFeedback, Checklist checklist,
        List<Reminder> reminders, List<ClientOption> clients
    ) {}

    /** Filters of the list (all optional). {@code tzOffsetMinutes} = the viewer's local minus UTC, so "the week" is the viewer's week. */
    public record Query(LocalDate from, LocalDate to, String status, Long clientId, String q, String sort, String dir, int page, int size, int tzOffsetMinutes) {}

    /** Propose a new time. E1: a proposal; the consultant confirms. */
    public record RescheduleRequest(@NotNull Instant proposedAt, @Size(max = 300) String note) {}

    /** Record what the marketer learned after the interview. {@code outcome}: PASSED / REJECTED / NO_SHOW / PENDING. */
    public record FeedbackRequest(@NotBlank @Size(max = 20) String outcome, @Size(max = 2000) String note) {}

    public record PrepTickRequest(@NotNull Boolean done) {}
}
