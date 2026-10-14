package com.dossier.api.service.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Tile;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Wire shapes of the Consultant workspace My Applications page (docs/enterprise-v2/page-consultant-applications.md). Read-only. */
public final class ConsultantApplicationsDTO {

    private ConsultantApplicationsDTO() {}

    public record Tiles(Tile total, Tile underReview, Tile interviews, Tile rejected, Tile offers) {}

    /** One of the caller's own applications. {@code stage} is the raw stage; {@code closedReason} is set when it is CLOSED. {@code source} is the stored label as given. */
    public record Row(
        long applicationId,
        String code,
        long requirementId,
        String title,
        String company,
        LocalDate appliedOn,
        String source,
        String stage,
        String closedReason,
        String nextAction,
        LocalDate nextActionDue
    ) {}

    /** One funnel step: its count and its share (0-100, one decimal) of all applications; percent is null when there are none. */
    public record Step(String key, long count, Double percent) {}

    /** {@code by} is YOU, MARKETER or TEAM (never a name); {@code closedReason} is the application's reason when toStage is CLOSED. */
    public record Update(long id, long applicationId, String toStage, String closedReason, String title, String company, String by, Instant at) {}

    /** A status option of the filter: key is ALL or a stage / closed reason. */
    public record Option(String key, long count) {}

    public record Paging(int page, int size, long total, int pages) {}

    public record Response(
        long orgId,
        Instant generatedAt,
        String name,
        Tiles tiles,
        List<Row> rows,
        Paging paging,
        String status,
        String sort,
        List<Option> statuses,
        List<Step> funnel,
        List<Update> recent
    ) {}

    /** A stage-timeline entry (CREATED or STAGE_CHANGE only; notes are never shown). */
    public record TimelineEntry(long id, String type, String fromStage, String toStage, String by, Instant at) {}

    public record Detail(Row row, Instant createdAt, Instant stageChangedAt, List<TimelineEntry> timeline) {}
}
