package com.dossier.api.service.ent.mgmt;

import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO;
import java.time.Instant;
import java.util.List;

/**
 * The Marketing Manager's Pipeline board (MM-08). A card is one opportunity of a consultant the team carries: names, the job and the client, the marketer who owns
 * it, its age and whether it has gone quiet. No note, rate, contact or resume content. The id of a card is the opportunity's id (its requirement_match id).
 */
public final class MgmtPipelineDTO {

    private MgmtPipelineDTO() {}

    /** {@code column} is one of {@link MgmtPipelineService#COLUMNS}; {@code stale} is true for an open card with no activity for the admin's stalled days. */
    public record Card(
        Long id,
        Long consultantId,
        String consultant,
        Long requirementId,
        String job,
        Long clientId,
        String client,
        MarketingAssignmentsDTO.Person marketer,
        String column,
        String priority,
        Instant lastActivityAt,
        int ageDays,
        boolean stale
    ) {}

    /** {@code count} is the number of cards of the column under the filters, {@code items} the part of them on this page. */
    public record Column(String key, String label, long count, List<Card> items) {}

    public record Board(List<Column> columns, long total, int page, int size, int staleDays, int rangeDays, boolean empty, Instant generatedAt) {}

    public record ColumnCount(String key, String label, long count) {}

    /** {@code conversionPct} is this step's count over the previous step's, one decimal (null for the first step or when the previous step is 0). */
    public record Step(String key, String label, long count, Double conversionPct) {}

    /** What happened in the last {@code days} days: assigned, interested, recorded as sent by the consultant, interviews scheduled, offers. */
    public record Window(int days, List<Step> steps) {}

    public record Summary(List<ColumnCount> columns, long stale, int staleDays, int rangeDays, List<Window> windows, boolean empty, Instant generatedAt) {}
}
