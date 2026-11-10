package com.dossier.api.service.dto.ent;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

/**
 * The wire shape of {@code GET /api/orgs/{orgId}/reports/overview}: a few canned reports computed from the organization's own rows. Counts and
 * durations only: no money, no email, no personal data (people appear by display name). An empty list or a zero is a real zero.
 */
public final class ReportsDTO {

    private ReportsDTO() {}

    @Schema(description = "One headline number. previous is the same measure over the period before (null when there is no comparison); value is null when nothing has happened yet.")
    public record Tile(String key, String label, Double value, Double previous, String unit) {}

    @Schema(description = "A count by a named bucket.")
    public record Slice(String key, String label, long count) {}

    public record Roster(long total, List<Slice> byMarketingStatus, List<Slice> byAvailability) {}

    @Schema(description = "enteredThisWeek / enteredLastWeek: applications that entered the stage in the last 7 days and the 7 days before; deltaPct is null when last week was 0.")
    public record StageRow(String key, String label, long count, long enteredThisWeek, long enteredLastWeek, Double deltaPct) {}

    @Schema(description = "One week (starting Monday): value is the main count, second the comparison count (see the report).")
    public record WeekPoint(String weekStart, long value, long second) {}

    public record Funnel(long total, long thisWeek, long lastWeek, Double deltaPct, List<StageRow> stages, List<WeekPoint> weekly) {}

    @Schema(description = "weekly: value = interviews scheduled that week, second = completed that week.")
    public record Interviews(long scheduled, long completed, long cancelled, long awaitingOutcome, long upcoming14Days, List<WeekPoint> weekly) {}

    public record MonthPoint(String month, long started, long ended) {}

    public record Placements(long active, long startedInRange, long endedInRange, List<MonthPoint> months) {}

    public record ClientRow(String name, long activePlacements) {}

    public record MarketerRow(Long memberId, String name, long consultants, long openOpportunities) {}

    @Schema(description = "medianHours is null when no application in the range has been submitted yet.")
    public record FirstSubmission(Double medianHours, long sample) {}

    @Schema(description = "rangeDays is 30 or 90.")
    public record Overview(
        Long orgId,
        Instant generatedAt,
        int rangeDays,
        List<Tile> tiles,
        Roster roster,
        Funnel funnel,
        Interviews interviews,
        Placements placements,
        List<ClientRow> topClients,
        List<MarketerRow> marketers,
        FirstSubmission firstSubmission
    ) {}
}
