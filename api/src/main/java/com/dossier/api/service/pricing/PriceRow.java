package com.dossier.api.service.pricing;

/**
 * One active price row as the engine sees it (the catalog adapter maps {@code product_price} + the product onto this).
 * {@code aiBudgetCentsPerWindow} is the worst-case AI cost of one unit over one whole billing period of this row's interval
 * (the plan base carries the cap of the plan version for that interval, for example 300 per month, 800 per quarter).
 * {@code kind} is the product kind used for discount scope (BASE_LICENSE, FEATURE, ORG_MODULE, PLAN_BASE, ADDON, ...).
 */
public record PriceRow(
    String priceId,
    String productCode,
    String kind,
    Audience audience,
    BillingInterval interval,
    String currency,
    long amountMinor,
    int aiBudgetCentsPerWindow
) {
    public PriceRow {
        if (amountMinor < 0) {
            throw new IllegalArgumentException("amountMinor must be >= 0");
        }
        if (aiBudgetCentsPerWindow < 0) {
            throw new IllegalArgumentException("aiBudgetCentsPerWindow must be >= 0");
        }
    }
}
