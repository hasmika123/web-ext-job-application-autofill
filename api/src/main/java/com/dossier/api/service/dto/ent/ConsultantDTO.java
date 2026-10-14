package com.dossier.api.service.dto.ent;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * The Consultants board (talent-foundation.md section 5): directory rows, the four KPI tiles with real week-over-week sparkline series, the drawer
 * and its three lazy tabs. Everything comes from rows; a field with no backing data is null (never a placeholder). There is no phone number, no
 * photo and no date of birth anywhere: the platform never stores them.
 */
public final class ConsultantDTO {

    private ConsultantDTO() {}

    /** A marketer or an actor: the seat id and the name drawn as initials. */
    public record PersonRef(Long memberId, String name) {}

    public record GroupRef(Long id, String name) {}

    public record NextInterview(Instant scheduledAt, String roundLabel) {}

    /** One row of the directory. {@code primarySkills} are the chips of the table (the primary ones, in order); {@code skillCount} counts all of them. */
    public record Row(
        Long id,
        String name,
        String email,
        String jobTitle,
        List<String> primarySkills,
        int skillCount,
        Integer yearsExperience,
        String location,
        String workMode,
        PersonRef marketer,
        String availability,
        LocalDate availableFrom,
        String license,
        LocalDate licenseValidUntil,
        int profileCompleteness,
        int activeApplications,
        NextInterview nextInterview,
        String status,
        Instant createdAt
    ) {}

    /** {@code PageDTO} of 40-api-specs.md section 7. */
    public record Page(List<Row> items, int page, int size, long total, boolean hasNext) {}

    /**
     * One KPI tile. {@code previous} is the same figure counting only consultants created more than 30 days ago (no state history exists, see the
     * foundation formulas); it is null, and so are the deltas, when the organization has no consultant older than that. {@code series} is eight weekly
     * points (oldest first, the last equals {@code value}): how many of today's matching consultants had joined by the end of each week.
     */
    public record Tile(long value, Long previous, Long delta, Double deltaPercent, List<Long> series) {
        public static Tile of(long value, Long previous, List<Long> series) {
            if (previous == null) return new Tile(value, null, null, null, series);
            long d = value - previous;
            Double pct = previous == 0 ? null : Math.round(1000.0 * d / previous) / 10.0;
            return new Tile(value, previous, d, pct, series);
        }
    }

    public record Counts(Instant asOf, String scope, Tile total, Tile available, Tile onProject, Tile needsReview) {}

    public record Skill(String skill, boolean primary) {}

    /** The five ticks of the profile checklist: basic is always true, the others come from rows. */
    public record Checklist(boolean basic, boolean skills, boolean resume, boolean certifications, boolean preferences) {}

    public record AssignmentInfo(PersonRef marketer, PersonRef backup, String priority, String status, Instant assignedAt) {}

    /** What the caller may do with this consultant; the page draws only these buttons (the API is the gate). */
    public record Actions(boolean edit, boolean assignMarketer, boolean deactivate, boolean reactivate, boolean createApplication) {}

    public record Detail(
        Row consultant,
        Long memberId,
        String headline,
        List<Skill> skills,
        LocalDate availabilitySince,
        String marketingStatus,
        GroupRef department,
        AssignmentInfo assignment,
        Checklist checklist,
        int applicationsTotal,
        int upcomingInterviews,
        int resumeCount,
        Actions actions,
        String version
    ) {}

    public record JobAssignment(Long requirementId, String title, String clientName, String jobStatus, Integer score, Instant assignedAt) {}

    public record PlacementItem(Long id, String roleTitle, String clientName, String status, LocalDate startDate, LocalDate endDate) {}

    public record Assignments(AssignmentInfo assignment, List<JobAssignment> jobs, List<PlacementItem> placements) {}

    public record ApplicationItem(
        Long id,
        String code,
        String jobTitle,
        String clientName,
        String stage,
        String closedReason,
        LocalDate appliedOn,
        String nextAction,
        LocalDate nextActionDue,
        Instant stageChangedAt
    ) {}

    public record InterviewItem(Long id, String clientName, Instant scheduledAt, Integer durationMinutes, String roundLabel, String status) {}

    public record Applications(List<ApplicationItem> items, List<InterviewItem> interviews) {}

    /** kind APPLICATION (a stage event of one of the consultant's applications) or AUDIT (an organization audit row about the consultant). */
    public record ActivityItem(String kind, Instant at, String actor, String action, String code, String jobTitle, String fromStage, String toStage, String detail) {}

    public record Activity(List<ActivityItem> items) {}

    public record MarketerOption(Long memberId, String name, long workload, int capacity, String status) {}

    /** The pickers of the board: skills seen in the directory, the marketers with their workload, and the departments. */
    public record Filters(List<String> skills, List<MarketerOption> marketers, List<GroupRef> departments) {}

    public record JobOption(Long id, String title, String clientName, Integer score) {}

    /** The result of a single "create application" call. */
    public record ApplicationCreated(Long id, String code, String stage) {}

    /** One row of a bulk answer: {@code ok} with {@code previous} (what Undo restores) or skipped with a {@code reason}. */
    public record RowResult(Long id, boolean ok, String reason, Map<String, Object> previous) {}

    public record BulkResult(String action, int requested, int ok, List<RowResult> results) {}
}
