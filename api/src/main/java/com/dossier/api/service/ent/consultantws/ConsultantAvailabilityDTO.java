package com.dossier.api.service.ent.consultantws;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Wire shapes of the Consultant workspace Availability page (docs/enterprise-v2/page-consultant-availability.md). */
public final class ConsultantAvailabilityDTO {

    private ConsultantAvailabilityDTO() {}

    /** The status, the day it was set and the date the consultant becomes available (null = no date: "now" when AVAILABLE). Same fields as the Profile page. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Availability(String status, LocalDate since, LocalDate availableFrom) {}

    /** Open opportunities: the count now, the count that already existed a month ago, the change and six weekly cumulative counts. */
    public record CountTile(long value, Long previous, Double deltaPct, List<Long> sparkline) {}

    /** {@code daysFromNow} is null when there is no date; 0 for today; never negative. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record AvailableFromTile(String status, LocalDate date, Integer daysFromNow) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record NoticeTile(Integer weeks, LocalDate availableOn) {}

    /** Calendar days inside {@code year}: approved vacation, the part of it from today on, and vacation still waiting for approval. */
    public record VacationTile(int year, long approvedDays, long scheduledDays, long pendingDays) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Tiles(AvailableFromTile availableFrom, CountTile openOpportunities, String workMode, NoticeTile notice, VacationTile vacation) {}

    /**
     * What the consultant prefers. Locations (the first is the primary one), employment types and work authorization are READ from the Profile
     * page's tables (edited there); the rest lives in cws_work_preference. Rates are minor units per hour (USD), recorded only.
     * {@code workAuthorization} is a status choice, never a document number.
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Preferences(
        List<String> locations,
        String workAuthorization,
        String workMode,
        List<String> employmentTypes,
        Long rateMinMinor,
        Long rateMaxMinor,
        String rateNote,
        String travelLabel,
        Integer travelPercent,
        Integer noticeWeeks
    ) {}

    /** {@code sample} = the status was set by the demo seeder as a stand-in for the marketer's approval. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Block(long id, String kind, LocalDate startDate, LocalDate endDate, long days, String reason, String status, boolean sample) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record HistoryRow(long id, LocalDate effectiveDate, String availabilityStatus, LocalDate availableFrom, String workMode, String status, boolean sample) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Response(
        long orgId,
        Instant generatedAt,
        LocalDate today,
        String name,
        Availability availability,
        Tiles tiles,
        Preferences preferences,
        List<Block> blocks,
        List<HistoryRow> history
    ) {}

    /** {@code availableFrom} is yyyy-MM-dd or blank. */
    public record StatusRequest(String status, String availableFrom) {}

    /** Dates are yyyy-MM-dd. */
    public record BlockRequest(String kind, String startDate, String endDate, String reason) {}

    /** Every field replaces the stored value; null clears it. */
    public record PreferenceRequest(String workMode, Integer noticeWeeks, Long rateMinMinor, Long rateMaxMinor, String rateNote, String travelLabel, Integer travelPercent) {}
}
