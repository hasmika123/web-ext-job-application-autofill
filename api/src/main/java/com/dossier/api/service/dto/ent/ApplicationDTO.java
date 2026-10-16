package com.dossier.api.service.dto.ent;

import com.dossier.api.service.dto.ChangeActorDTO;
import com.dossier.api.service.dto.TrackerDTOs.ChangeDTO;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * The Applications board (docs/enterprise-v2/page-applications.md): table rows, KPI tiles, pipeline columns, analytics and the detail drawer.
 * Every figure is read from {@code talent_application} and its event/note tables; a figure with no history behind it is {@code null}, never a
 * guess. No sensitive PII appears anywhere (no phone, date of birth or document numbers). A stage change is a RECORD of what happened: Kiwiply
 * never submits an application, the consultant does (CLAUDE.md, Enterprise V2 E1).
 */
public final class ApplicationDTO {

    private ApplicationDTO() {}

    /** A person in the table or drawer; {@code memberId} is null for a consultant who is not a seat. */
    public record PersonRef(Long id, String name, String initials, String subtitle) {}

    /** The client company: an initials tile is drawn from {@code initials}. */
    public record ClientRef(Long id, String name, String initials, String industry) {}

    public record Marketer(Long memberId, String name, String initials) {}

    /** One row of the table (and one card of the pipeline board). */
    public record Row(
        Long id,
        String code,
        Long requirementId,
        String jobTitle,
        String employmentLabel,
        PersonRef consultant,
        ClientRef client,
        LocalDate appliedOn,
        String stage,
        String closedReason,
        Marketer marketer,
        String nextAction,
        LocalDate nextActionDue,
        boolean overdue,
        Instant stageChangedAt,
        Instant updatedAt,
        ChangeActorDTO updatedBy
    ) {}

    /** {@code PageDTO} of 40-api-specs.md section 7. */
    public record Page(List<Row> items, int page, int size, long total, boolean hasNext) {}

    /** One KPI tile: {@code previous} is the figure thirty days ago rebuilt from the event history; null when no history reaches back that far. */
    public record Tile(long value, Long previous, Long delta, Double deltaPercent, List<Long> series) {
        public static Tile of(long value, Long previous, List<Long> series) {
            if (previous == null) return new Tile(value, null, null, null, series);
            long d = value - previous;
            Double pct = previous == 0 ? null : Math.round(1000.0 * d / previous) / 10.0;
            return new Tile(value, previous, d, pct, series);
        }
    }

    /** {@code seriesFrom} .. {@code asOf} is the sparkline window: one point per week, oldest first. */
    public record Counts(Instant asOf, Instant seriesFrom, String scope, Tile total, Tile inReview, Tile interviewing, Tile offers, Map<String, Long> byStage) {}

    public record Option(String value, String label) {}

    /** The filter dropdowns: job titles that exist, clients, marketers and the stage names. */
    public record Filters(List<Option> jobTitles, List<Option> clients, List<Option> marketers, List<Option> stages) {}

    public record PickerItem(Long id, String label, String sub) {}

    public record Pickers(String kind, List<PickerItem> items) {}

    public record Column(String stage, String label, long count, List<Row> items) {}

    public record Pipeline(List<Column> columns) {}

    public record Bucket(String key, String label, long count) {}

    /** The Analytics tab: aggregates of the rows the caller can see. Everything is a count of real rows; ratios are computed by the page. */
    public record Analytics(
        long total,
        long open,
        Double avgDaysOpen,
        List<Bucket> byStage,
        List<Bucket> reached,
        List<Bucket> perMonth,
        List<Bucket> closedReasons,
        List<Bucket> topClients,
        List<Bucket> bySource,
        List<Bucket> byMarketer
    ) {}

    /** One step of the stepper: {@code state} is DONE, CURRENT or FUTURE; {@code reachedAt} is the first time that stage was recorded. */
    public record Step(String stage, String label, Instant reachedAt, String state) {}

    /**
     * One history row. {@code actor} is the original {name, initials} shape (kept so the existing screens keep working); {@code by} is who did it in the
     * change-audit words: label (never an enterprise login), relation to the consultant (marketer | admin | consultant | member | system) and kind
     * (PERSON | SYSTEM). {@code changes} lists the fields that changed (names, and enum / date values only: never free text).
     */
    public record EventItem(Long id, String type, String fromStage, String toStage, Marketer actor, String detail, Instant at, ChangeActorDTO by, List<ChangeDTO> changes) {}

    public record NoteItem(Long id, Marketer author, String body, Instant createdAt, ChangeActorDTO by) {}

    /** What the caller may do with this application (the page draws a control only when true; the API is the real gate). */
    public record Actions(boolean edit, boolean moveStage, boolean addNote, boolean reassign) {}

    public record Detail(
        Long id,
        String code,
        Long requirementId,
        String jobTitle,
        String employmentLabel,
        PersonRef consultant,
        ClientRef client,
        LocalDate appliedOn,
        String stage,
        String closedReason,
        String source,
        Marketer marketer,
        String nextAction,
        LocalDate nextActionDue,
        boolean overdue,
        Instant stageChangedAt,
        List<Step> steps,
        List<String> nextStages,
        List<EventItem> timeline,
        List<EventItem> activity,
        List<NoteItem> notes,
        long notesCount,
        Actions actions,
        UndoToken undo,
        Instant createdAt,
        ChangeActorDTO createdBy,
        Instant updatedAt,
        ChangeActorDTO updatedBy
    ) {}

    /** Present for a few minutes after the caller's own latest stage move: the id to send back to undo it. */
    public record UndoToken(Long eventId, Instant expiresAt, String fromStage, String toStage) {}

    /** Body of {@code POST /applications}. */
    public record CreateRequest(
        Long requirementId,
        Long consultantId,
        Long marketerMemberId,
        String source,
        String nextAction,
        LocalDate nextActionDue,
        LocalDate appliedOn,
        String stage
    ) {}

    /** Body of {@code POST /applications/{id}/stage}. {@code undoEventId} reverts the caller's own latest move. */
    public record StageRequest(String stage, String closedReason, Long undoEventId) {}

    public record NoteRequest(String body) {}
}
