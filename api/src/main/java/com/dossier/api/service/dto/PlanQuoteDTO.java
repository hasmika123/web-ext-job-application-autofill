package com.dossier.api.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.io.Serializable;
import java.time.Instant;
import java.util.List;

/**
 * A priced personal basket (docs/subscriptions/09-apis.md section 3.2), computed by the server and rendered by the web: the page never adds, rounds or
 * discounts anything itself. Money is {@code *Minor} longs in {@code currency}; timestamps are ISO UTC. {@code effectiveAt} is the string {@code now} or
 * an ISO instant. {@code inputsHash} lets checkout and confirm refuse a quote whose prices or subscription moved since it was shown.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PlanQuoteDTO(
    Long quoteId,
    String kind,
    String status,
    Instant createdAt,
    Instant expiresAt,
    String currency,
    int catalogVersion,
    PlanRef plan,
    String interval,
    IntervalChange intervalChange,
    Basket current,
    Basket proposed,
    long deltaMinor,
    List<Addition> additions,
    List<Removal> removals,
    List<Confirmation> requiresConfirmation,
    List<String> autoAdded,
    long prorationEstimateMinor,
    Long nextInvoiceEstimateMinor,
    Instant nextInvoiceAt,
    String effectiveAt,
    Long taxEstimateMinor,
    String taxSource,
    String taxNote,
    Integer aiBudgetPct,
    Promo promo,
    List<String> warnings,
    String inputsHash
) implements Serializable {
    public static final String TAX_NOTE = "Taxes are calculated by Stripe at invoice time where applicable.";

    public record PlanRef(String planKey, int version, String name) implements Serializable {}

    public record IntervalChange(String from, String to, String effectiveAt) implements Serializable {}

    /** {@code kind} is BASE or ADDON; {@code featureKey} is null for the base. {@code priceId} is the catalog price row (not a Stripe id). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record QuoteLine(
        String featureKey,
        String kind,
        String name,
        int quantity,
        long unitListMinor,
        long unitEffectiveMinor,
        long lineTotalMinor,
        String productCode,
        String priceId
    ) implements Serializable {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Basket(List<QuoteLine> lines, long recurringMinor, Long monthlyEquivalentMinor, Long savingsMinor, Integer savingsBp) implements Serializable {}

    public record Addition(String featureKey, String name, int quantityFrom, int quantityTo, long unitEffectiveMinor, long prorationMinor) implements Serializable {}

    public record Removal(String featureKey, int quantityFrom, int quantityTo, Instant effectiveAt, String note) implements Serializable {}

    public record Confirmation(String featureKey, String requires, String kind, long priceMinor, String name) implements Serializable {}

    public record Promo(String code, String description, List<String> appliesTo) implements Serializable {}
}
