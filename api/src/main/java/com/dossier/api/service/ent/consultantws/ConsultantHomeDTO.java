package com.dossier.api.service.ent.consultantws;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Wire shape of {@code GET /api/orgs/{orgId}/me-workspace/home}: the signed-in consultant's own landing page, one call.
 * Everything is computed from that consultant's rows. A block flagged {@code sample = true} is placeholder data for something that
 * belongs to another role's module (marketer messages, submission approvals, interview mode); it is replaced when the roles merge.
 */
public final class ConsultantHomeDTO {

    private ConsultantHomeDTO() {}

    public record Response(
        Long orgId,
        Instant generatedAt,
        Me me,
        Tiles tiles,
        List<MatchRow> recommendedMatches,
        List<OpportunityRow> assignedOpportunities,
        List<ApplicationRow> applications,
        List<InterviewRow> interviews,
        ResumeStrength resumeStrength,
        Focus todaysFocus,
        List<TaskRow> tasks,
        Messages marketerMessages
    ) {}

    public record Me(Long consultantId, String name, String jobTitle) {}

    /** A count with its change since a week ago; deltaPct is null when the earlier value was 0. */
    public record Tile(long value, Long previous, Double deltaPct, List<Long> sparkline, boolean sample) {}

    public record Tiles(Tile jobMatches, Tile assignedOpportunities, Tile activeApplications, Tile upcomingInterviews, Tile submissionsPending, Placement activePlacement) {}

    public record Placement(long value, String label) {}

    public record MatchRow(Long matchId, Long requirementId, String title, String company, int score, String location, String workMode, String employment) {}

    /** status: REVIEW_NEEDED (assigned, no application yet), AWAITING_APPROVAL (application prepared), INTERESTED (application submitted or later). */
    public record OpportunityRow(Long matchId, Long requirementId, String title, String company, String status, Instant assignedAt) {}

    public record ApplicationRow(Long id, String code, String title, String company, String stage, String closedReason, LocalDate appliedOn) {}

    public record InterviewRow(Long id, Instant scheduledAt, int durationMinutes, String title, String company, String round, String mode, boolean modeSample) {}

    public record Check(String key, String label, boolean done) {}

    public record ResumeStrength(int percent, boolean hasResume, List<Check> checks) {}

    public record FocusItem(String key, String label) {}

    public record Focus(LocalDate date, List<FocusItem> items) {}

    public record TaskRow(Long id, String title, LocalDate dueOn, String priority, String status) {}

    public record Message(String from, String preview, Instant at, boolean unread) {}

    public record Messages(boolean sample, List<Message> items) {}
}
