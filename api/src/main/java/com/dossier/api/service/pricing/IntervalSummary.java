package com.dossier.api.service.pricing;

/**
 * Display numbers of docs/subscriptions/03 section 4.3, computed server-side. {@code monthTotalMinor}, {@code savingsMinor} and
 * {@code savingsBp} are null when the basket has no MONTH price for some line (not comparable) or the interval is ONE_TIME.
 */
public record IntervalSummary(
    BillingInterval interval,
    long totalMinor,
    long monthlyEquivalentMinor,
    Long monthTotalMinor,
    Long savingsMinor,
    Integer savingsBp
) {}
