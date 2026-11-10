package com.dossier.api.service.pricing;

import java.util.List;

/** The money of a mid-cycle change (22 section 4/6, 03 section 6): proposed vs current recurring, per-line proration, next invoice. */
public record ChangeImpact(
    long currentRecurringMinor,
    long proposedRecurringMinor,
    long deltaMinor,
    long prorationTotalMinor,
    List<ProrationLine> prorationLines,
    long nextInvoiceEstimateMinor,
    boolean volumeTierChanges,
    Integer tierFromMinLicensed,
    Integer tierToMinLicensed
) {
    public record ProrationLine(String groupKey, String lineKey, String productCode, int addedQuantity, long unitEffectiveMinor, long prorationMinor) {}
}
