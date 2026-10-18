package com.dossier.api.service.ent.consultantws;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.dossier.api.service.dto.ChangeActorDTO;
import java.time.Instant;
import java.util.List;

/** Wire shapes of the Consultant workspace Submissions and Approvals page (docs/enterprise-v2/page-consultant-submissions.md). */
public final class ConsultantSubmissionsDTO {

    private ConsultantSubmissionsDTO() {}

    /** A tile: the value, the earlier value, the change and six weekly counts. {@code vs} is the comparison window the delta is about: "week" or "month". */
    public record Tile(long value, Long previous, Double deltaPct, List<Long> sparkline, String vs) {}

    public record Tiles(Tile pending, Tile approved, Tile submitted, Tile attention) {}

    /**
     * One submission, as a row of either table. {@code attention} is true for a pending row due within 24 hours or already past due.
     * {@code sample} is true for a demo stand-in row (the marketer / client side is not built yet).
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Row(
        long id,
        long requirementId,
        String title,
        String employment,
        String company,
        Long resumeId,
        Integer resumeVersion,
        Instant resumeUpdatedAt,
        String marketerNote,
        String marketerName,
        Instant dueAt,
        boolean attention,
        String status,
        Instant submittedOn,
        Instant decidedAt,
        String clientUpdate,
        Instant clientUpdateAt,
        boolean sample
    ) {}

    public record PastPage(List<Row> items, int page, int size, long total, int totalPages, String status) {}

    public record Response(long orgId, Instant generatedAt, String name, Tiles tiles, List<Row> pending, PastPage past) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record ResumeSummary(long id, String name, Integer versionNo, String headline, String summary, String fileName, Instant updatedAt) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    /** {@code updatedBy} / {@code createdBy}: who last changed it and who prepared it, by name with the relation to this consultant (change audit). */
    public record Detail(Row row, String declineReason, String location, String workMode, String description, ResumeSummary resume, Instant createdAt, Instant updatedAt, ChangeActorDTO updatedBy, ChangeActorDTO createdBy) {}

    public record DeclineRequest(String reason) {}

    public record Decision(long id, String status, Instant decidedAt) {}
}
