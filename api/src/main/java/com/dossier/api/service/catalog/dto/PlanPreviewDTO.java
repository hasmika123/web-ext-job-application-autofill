package com.dossier.api.service.catalog.dto;

import com.dossier.api.service.billing.margin.MarginLevers;
import java.util.List;
import java.util.Map;

/**
 * The server-computed preview of a plan version (docs/subscriptions/09 section 1.4; story K2.3): the web renders it and computes nothing. Totals come from the
 * {@code PricingEngine}, margins and levers from the {@code MarginCalculator}: the number shown is the number the guard checks. Money is minor units.
 */
public record PlanPreviewDTO(
    String planKey,
    int version,
    String status,
    String audience,
    String interval,
    String currency,
    Long baseMinor,
    long includedAiCapCents,
    List<OptionalRow> optional,
    WorstCase worstCase,
    AnnualPreview annual,
    SeatsPreview seats,
    List<CheckRow> checks,
    Impact impact
) {

    /** One optional add-on alone: its unit price at the interval, its margin and (when failing) the levers. */
    public record OptionalRow(String featureKey, long unitMinor, int maxQuantity, long aiWindowCents, long marginBp, boolean ok, MarginLevers levers) {}

    /** The composition worst case: the base plus every optional at its maximum quantity on one invoice (03 section 7.2 check 3). */
    public record WorstCase(long totalMinor, long aiCents, long feeMinor, long marginBp, long floorBp, boolean ok, MarginLevers levers) {}

    /** Yearly pricing: {@code enabled=false} while annual billing is off or the version does not list YEAR. */
    public record AnnualPreview(
        boolean enabled,
        Integer discountBp,
        Long baseYearMinor,
        Long monthlyEquivalentMinor,
        Long savingsMinor,
        Integer savingsBp,
        boolean derived,
        List<CheckRow> checks
    ) {}

    /** ORG only: the seat base, the presets as one seat and a roster (a comma separated list of {@code [n]token}, token = BASE or a preset key). */
    public record SeatsPreview(Long seatBaseMinor, List<SeatPreset> presets, Roster roster) {}

    public record SeatPreset(String key, long seatTotalMinor, boolean aboveIndividualOk, boolean mirrored, Long individualMonthMinor, List<String> features) {}

    public record Roster(List<RosterLine> lines, long orgRecurringMinor, Long setupFeeMinor) {}

    public record RosterLine(String token, int count, long seatTotalMinor, long lineTotalMinor, List<String> features) {}

    /** One gate of the publish: {@code deps}, {@code structure}, {@code prices}, {@code margin}. {@code failing} carries the details of each failure. */
    public record CheckRow(String id, boolean ok, List<Map<String, Object>> failing) {}

    /** What publishing would do (04 section 4): nobody is touched, new buyers get the version. */
    public record Impact(
        Map<String, Long> subscribersByVersion,
        boolean grandfathered,
        String newSignupsFrom,
        int catalogVersionAfter,
        boolean stripeEnabled,
        List<StripeObject> stripeObjectsToCreate
    ) {}

    public record StripeObject(String kind, String productCode, String interval, String currency, Long priceRowId, String idempotencyKey) {}
}
