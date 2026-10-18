package com.dossier.api.service.dto.ent;

import com.dossier.api.service.dto.ChangeActorDTO;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * The Interviews board (docs/enterprise-v2/page-interviews.md): table rows, KPI tiles, pipeline columns, analytics and the detail drawer.
 * Every figure is read from {@code talent_interview} and its child tables; a figure with no history behind it is {@code null}, never a
 * guess. No sensitive PII appears anywhere. Everything the page does is a RECORD of something that happened or was arranged outside
 * Kiwiply: Kiwiply never attends, runs or sends anything for an interview (CLAUDE.md, Enterprise V2 E1).
 */
public final class InterviewDTO {

    private InterviewDTO() {}

    public record PersonRef(Long id, String name, String initials, String subtitle, String status) {}

    public record ClientRef(Long id, String name, String initials, String industry) {}

    public record Marketer(Long memberId, String name, String initials) {}

    /** A client-side interviewer: name and job title as typed text. */
    public record Interviewer(Long id, String name, String title, String initials, boolean primary) {}

    /** {@code jobTitle}/{@code jobCode} are null for an interview that is not linked to an application. */
    public record Row(
        Long id,
        String code,
        Long applicationId,
        String jobTitle,
        String jobCode,
        PersonRef consultant,
        ClientRef client,
        String round,
        Integer roundNo,
        Instant scheduledAt,
        int durationMinutes,
        String mode,
        String location,
        String status,
        String nextStep,
        List<Interviewer> interviewers
    ) {}

    public record Page(List<Row> items, int page, int size, long total, boolean hasNext) {}

    /** One KPI tile: {@code previous} is the comparison figure rebuilt from the history (a month, or last week for "Scheduled This Week"); null when no history reaches back. */
    public record Tile(long value, Long previous, Long delta, Double deltaPercent, List<Long> series) {
        public static Tile of(long value, Long previous, List<Long> series) {
            if (previous == null) return new Tile(value, null, null, null, series);
            long d = value - previous;
            Double pct = previous == 0 ? null : Math.round(1000.0 * d / previous) / 10.0;
            return new Tile(value, previous, d, pct, series);
        }
    }

    public record Counts(Instant asOf, Instant seriesFrom, String scope, Tile total, Tile scheduledThisWeek, Tile inProgress, Tile completed, Map<String, Long> byStatus) {}

    public record Option(String value, String label) {}

    public record Limits(int maxInterviewers, int maxDurationMinutes, int undoMinutes) {}

    public record Filters(List<Option> clients, List<Option> consultants, List<Option> rounds, List<Option> statuses, List<Option> modes, Limits limits) {}

    public record PickerItem(Long id, String label, String sub, Long clientId) {}

    public record Pickers(String kind, List<PickerItem> items) {}

    public record Column(String status, String label, long count, List<Row> items) {}

    public record Pipeline(List<Column> columns) {}

    public record Bucket(String key, String label, long count) {}

    public record Analytics(
        long total,
        long upcoming7,
        Double completionRate,
        Double avgPerWeek,
        List<Bucket> byStatus,
        List<Bucket> perMonth,
        List<Bucket> byMode,
        List<Bucket> byRound,
        List<Bucket> topClients
    ) {}

    /** {@code state}: DONE (completed), CURRENT (the interview open in the drawer), UPCOMING, CANCELLED or NOT_SCHEDULED. {@code interviewId} is null for a step that has no interview yet. */
    public record Step(String key, String label, Instant at, String state, Long interviewId) {}

    public record EventItem(Long id, String type, String fromStatus, String toStatus, Marketer actor, String detail, Instant at) {}

    public record FeedbackItem(Long id, Marketer author, int rating, String recommendation, String note, Instant createdAt) {}

    /** The resume that went with the application. */
    public record DocumentItem(Long id, String name, String fileName, Integer versionNo, boolean primary, String kind) {}

    /** What the caller may do (the page draws a control only when true; the API is the real gate). */
    public record Actions(boolean edit, boolean reschedule, boolean changeStatus, boolean remind, boolean feedback) {}

    public record UndoToken(Long eventId, Instant expiresAt, String fromStatus, String toStatus) {}

    public record Detail(
        Long id,
        String code,
        Long applicationId,
        String applicationCode,
        String jobTitle,
        String jobCode,
        String employmentLabel,
        String location,
        String workMode,
        PersonRef consultant,
        ClientRef client,
        Marketer marketer,
        String round,
        Integer roundNo,
        Instant scheduledAt,
        int durationMinutes,
        String mode,
        String meetingLink,
        String interviewLocation,
        String status,
        String nextStep,
        String nextStepCustom,
        String notes,
        Instant reminderRequestedAt,
        List<Interviewer> interviewers,
        List<Step> steps,
        List<EventItem> timeline,
        List<FeedbackItem> feedback,
        List<DocumentItem> documents,
        List<String> nextStatuses,
        Actions actions,
        UndoToken undo,
        Instant createdAt,
        Instant updatedAt,
        ChangeActorDTO updatedBy,
        ChangeActorDTO createdBy
    ) {}

    /** Body of {@code POST /interviews}. */
    public record CreateRequest(
        Long consultantId,
        Long applicationId,
        Long clientId,
        String round,
        Instant scheduledAt,
        Integer durationMinutes,
        String mode,
        String meetingLink,
        String location,
        String notes,
        List<InterviewerInput> interviewers
    ) {}

    public record InterviewerInput(String name, String title, Boolean primary) {}

    /** Body of {@code POST /interviews/{id}/reschedule}. */
    public record RescheduleRequest(Instant scheduledAt, Integer durationMinutes, String reason) {}

    /** Body of {@code POST /interviews/{id}/status}: a status, or {@code undoEventId} to revert the caller's own latest change. */
    public record StatusRequest(String status, String reason, Long undoEventId) {}

    public record FeedbackRequest(Integer rating, String recommendation, String note) {}
}
