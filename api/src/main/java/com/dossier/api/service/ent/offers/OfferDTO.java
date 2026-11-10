package com.dossier.api.service.ent.offers;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Wire shapes of the Accounts workspace Offers page. Money is plain numbers in MINOR units with a currency and a period: a record of what was
 * offered, never an amount that moves. There is no bank, tax or identity field anywhere in these shapes.
 */
public final class OfferDTO {

    private OfferDTO() {}

    public record Person(Long id, String name, String initials) {}

    public record Row(
        Long id,
        Person consultant,
        Long clientId,
        String clientName,
        String roleTitle,
        String state,
        String stateLabel,
        String placementType,
        Long rateMinor,
        String ratePeriod,
        String currency,
        Long baseSalaryMinor,
        Long totalCompMinor,
        String workMode,
        LocalDate startDate,
        LocalDate endDate,
        Integer termMonths,
        LocalDate deadline,
        Long daysLeft,
        Long placementId,
        Instant createdAt,
        Instant extendedAt,
        Instant respondedAt,
        boolean sampleData
    ) {}

    public record Page(List<Row> items, int page, int size, long total, boolean hasNext) {}

    /** The counts behind the tabs and the four tiles (all from the offer table, none estimated). */
    public record Counts(long all, long draft, long open, long accepted, long closed, long closingSoon, long placed, int closingSoonDays) {}

    public record Event(Long id, String kind, String label, String actorKind, String actorName, String detail, Instant at) {}

    public record PlacementRef(Long id, String status, LocalDate startDate) {}

    /** What the caller may do with this offer now (the page draws a control only when true; the API is the real gate). */
    public record Actions(boolean edit, boolean extend, boolean withdraw, boolean createPlacement) {}

    public record Detail(Row offer, String benefits, String notes, String responseNote, String placementNote, PlacementRef placement, List<Event> timeline, Actions actions) {}

    public record PickerItem(Long id, String label, String sub) {}

    public record Pickers(String kind, List<PickerItem> items) {}

    /** Create / revise an offer. Unknown properties are refused by the resource. {@code extend} true records it as extended straight away. */
    @JsonIgnoreProperties(ignoreUnknown = false)
    public record WriteRequest(
        Long consultantId,
        Long clientId,
        Long submissionId,
        Long applicationId,
        String roleTitle,
        String placementType,
        String workMode,
        LocalDate startDate,
        LocalDate endDate,
        Integer termMonths,
        Long rateMinor,
        String ratePeriod,
        Long baseSalaryMinor,
        Long totalCompMinor,
        String currency,
        LocalDate deadline,
        String benefits,
        String notes,
        Boolean extend
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record WithdrawRequest(String reason) {}
}
