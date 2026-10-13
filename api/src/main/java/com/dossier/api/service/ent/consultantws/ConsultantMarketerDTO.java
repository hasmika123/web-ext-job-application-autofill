package com.dossier.api.service.ent.consultantws;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Wire shape of {@code GET /api/orgs/{orgId}/me-workspace/marketer}: the signed-in consultant's "My Marketer" page, one call.
 * The marketer card, current-focus opportunities, follow-ups and the focus summary are computed from the consultant's own rows.
 * Every block flagged {@code sample = true} is placeholder content for the marketer's side of the relationship (messages, shared plan,
 * collaboration notes, response badge); it is replaced when the role branches merge.
 */
public final class ConsultantMarketerDTO {

    private ConsultantMarketerDTO() {}

    public record Response(
        Long orgId,
        Instant generatedAt,
        Marketer marketer,
        Badge responseBadge,
        List<FocusRow> focusOpportunities,
        List<Followup> followups,
        List<FocusItem> marketerFocus,
        Messages messages,
        ActionPlan actionPlan,
        Notes notes
    ) {}

    /** The consultant's current marketer; the whole object is null when nobody is assigned. No photo, no email, no phone. */
    public record Marketer(Long memberId, String name, String title, Instant assignedAt) {}

    /** SAMPLE: how quickly the marketer replies is not measured anywhere yet. */
    public record Badge(boolean sample, String label, String detail) {}

    /** stage: MARKETING (assigned, no application yet) or the application stage; priority: HIGH/MEDIUM/LOW derived from the match score. */
    public record FocusRow(Long matchId, Long requirementId, String title, String company, String location, String workMode, String stage, String priority, String nextStep, LocalDate nextStepDue) {}

    /** kind: APPLICATION (talent_application next action) or TASK (cws_task). status: OVERDUE/TODAY/UPCOMING for applications, the task status for tasks. */
    public record Followup(String key, String kind, LocalDate dueOn, String description, String status, String relatedTitle, String relatedCompany) {}

    /** key drives the icon: marketing, skills, assigned, strong. */
    public record FocusItem(String key, String title, String detail) {}

    public record Message(String from, boolean mine, String preview, Instant at, boolean unread) {}

    public record Messages(boolean sample, List<Message> items) {}

    public record PlanItem(String title, String status, LocalDate dueOn, LocalDate completedOn) {}

    public record ActionPlan(boolean sample, List<PlanItem> items) {}

    public record Note(String title, LocalDate on, String body) {}

    public record Notes(boolean sample, List<Note> items) {}
}
