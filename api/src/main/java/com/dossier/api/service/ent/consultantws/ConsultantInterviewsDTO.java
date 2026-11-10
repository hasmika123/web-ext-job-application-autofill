package com.dossier.api.service.ent.consultantws;

import java.time.Instant;
import java.util.List;

/** Wire shapes of the Consultant workspace Interviews page (docs/enterprise-v2/page-consultant-interviews.md). */
public final class ConsultantInterviewsDTO {

    private ConsultantInterviewsDTO() {}

    /** {@code vs} names the comparison ("last month" / "last week"); {@code deltaPct} is null when the earlier value was 0. */
    public record Tile(long value, Long previous, Double deltaPct, List<Long> sparkline, String vs) {}

    public record Tiles(Tile upcoming, Tile thisWeek, Tile completed, Tile feedbackPending) {}

    /**
     * One of the consultant's own interviews. {@code status} is the interview's own status (SCHEDULED, COMPLETED, CANCELLED); {@code chip} is
     * UPCOMING (starts within 7 days) or SCHEDULED (later) for a scheduled one, else null. {@code mode} (VIDEO, ONSITE, PHONE) is null until the
     * consultant sets it. {@code interviewerTitle} is whatever the consultant stored, null otherwise (never invented).
     */
    public record InterviewRow(
        long id,
        String title,
        String company,
        String location,
        String workMode,
        String round,
        String interviewerName,
        String interviewerTitle,
        Instant scheduledAt,
        int durationMinutes,
        String status,
        String chip,
        String mode,
        String meetingUrl,
        String prepNote,
        boolean hasFeedback
    ) {}

    /** A dot on the calendar: every non-cancelled interview. {@code state} is UPCOMING, SCHEDULED or COMPLETED. */
    public record CalendarEntry(long id, Instant scheduledAt, String state, String title, String company) {}

    public record FeedbackRow(long interviewId, String title, String company, Instant interviewedAt, String outcome, String summary, Instant updatedAt) {}

    /** A completed interview with no feedback yet. */
    public record PendingFeedback(long interviewId, String title, String company, Instant interviewedAt) {}

    public record Response(
        long orgId,
        Instant generatedAt,
        String name,
        Tiles tiles,
        List<InterviewRow> upcoming,
        List<CalendarEntry> calendar,
        List<FeedbackRow> feedback,
        List<PendingFeedback> pendingFeedback
    ) {}

    public record Detail(InterviewRow interview, String applicationCode, FeedbackRow feedback, boolean canEditDetails, boolean canRecordFeedback) {}

    /** Full replace of the four consultant-owned fields; blank or null clears one. */
    public record DetailRequest(String mode, String meetingUrl, String interviewerTitle, String prepNote) {}

    public record FeedbackRequest(String outcome, String summary) {}
}
