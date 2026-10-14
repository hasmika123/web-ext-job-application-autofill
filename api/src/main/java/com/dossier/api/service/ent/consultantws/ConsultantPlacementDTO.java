package com.dossier.api.service.ent.consultantws;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Wire shapes of the Consultant workspace My Placement page (docs/enterprise-v2/page-consultant-placements.md). No rate field exists in any
 * of these records on purpose: a consultant never sees the bill rate (35-placements.md), and nothing here carries an email address or phone.
 */
public final class ConsultantPlacementDTO {

    private ConsultantPlacementDTO() {}

    /**
     * The current ACTIVE placement. {@code durationMonths} is the planned length when {@code endDate} is set and the months elapsed so far
     * otherwise ({@code openEnded}). {@code billable} comes from the status only (an ACTIVE placement is billable); no rate is involved.
     * {@code sample} is true when the employer-side facts (manager, schedule, engagement status, milestones, meetings, checklist) are demo stand-ins.
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Placement(
        long id,
        String roleTitle,
        String status,
        String clientName,
        String endClientName,
        String projectName,
        String locationLabel,
        String workMode,
        String managerName,
        String managerTitle,
        Integer hoursPerWeek,
        String scheduleLabel,
        String engagementStatus,
        String statusNote,
        LocalDate startDate,
        LocalDate endDate,
        LocalDate nextCheckIn,
        int durationMonths,
        boolean openEnded,
        boolean billable,
        boolean sample
    ) {}

    /** The consultant's marketer (name and title only, no email or phone); null when none is assigned. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Marketer(long memberId, String name, String title) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record ChecklistItem(long id, String label, LocalDate dueOn, Instant completedAt) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Milestone(long id, String label, String description, LocalDate onDate, boolean completed) {}

    /** {@code joinUrl} is only ever an https link, or null. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Meeting(long id, String label, Instant startsAt, int durationMinutes, String withLabel, String joinUrl) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Activity(long id, String type, String description, String actorLabel, Instant occurredAt, boolean sample) {}

    /** An ended placement of the same consultant (title, client and dates only). */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Past(long id, String roleTitle, String clientName, LocalDate startDate, LocalDate endDate) {}

    /** {@code active} is null (and every list empty) when the consultant has no ACTIVE placement; {@code activeCount} counts their ACTIVE rows. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Response(
        long orgId,
        Instant generatedAt,
        String name,
        int activeCount,
        Placement active,
        Marketer marketer,
        List<ChecklistItem> checklist,
        List<Milestone> milestones,
        List<Meeting> meetings,
        List<Activity> activity,
        List<Past> past
    ) {}

    public record ChecklistRequest(Boolean completed) {}

    public record StatusNoteRequest(String note) {}
}
