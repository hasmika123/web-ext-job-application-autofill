package com.dossier.api.service.ent.consultantws;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Wire shapes of the Consultant workspace Offers page (docs/enterprise-v2/page-consultant-offers.md). Money is always MINOR units (cents). */
public final class ConsultantOffersDTO {

    private ConsultantOffersDTO() {}

    /** A tile: the value, the earlier value, the change and six weekly counts. {@code vs} is always "month". */
    public record Tile(long value, Long previous, Double deltaPct, List<Long> sparkline, String vs) {}

    public record Tiles(Tile total, Tile pending, Tile accepted, Tile negotiation, Tile declined) {}

    /**
     * One offer as a table row. {@code status} is the EFFECTIVE status: an open offer past its deadline is EXPIRED. {@code daysLeft} is the number of
     * days from today to the deadline for an open offer (0 = due today), else null. {@code sample} is true for a demo stand-in row (the employer
     * side that makes offers is not built yet).
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Row(
        long id,
        String company,
        String role,
        String packageSummary,
        String workMode,
        LocalDate startDate,
        LocalDate offerDeadline,
        Long daysLeft,
        String status,
        Long baseSalaryMinor,
        Long totalCompMinor,
        String currency,
        Instant respondedAt,
        Instant createdAt,
        boolean sample
    ) {}

    public record OfferPage(List<Row> items, int page, int size, long total, int totalPages) {}

    /** One line of Recent Offer Activity. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Activity(long offerId, String kind, String label, String company, String role, Instant occurredAt) {}

    /** {@code offers} is the first filtered page, {@code compare} every offer (up to 50) for the Compare Offers table, {@code companies} the Company filter options. */
    public record Response(long orgId, Instant generatedAt, String name, Tiles tiles, OfferPage offers, List<Row> compare, List<Activity> activity, List<String> companies) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Event(String kind, String label, Instant occurredAt) {}

    /** {@code canRespond} is true while the offer is open (pending review or negotiation) and its deadline has not passed; {@code canNegotiate} only while pending review. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Detail(Row row, String benefitsSummary, String responseNote, List<Event> events, boolean canRespond, boolean canNegotiate) {}

    public record NoteRequest(String note) {}

    public record ReasonRequest(String reason) {}

    public record Decision(long id, String status, Instant respondedAt) {}
}
