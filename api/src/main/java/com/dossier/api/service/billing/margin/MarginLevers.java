package com.dossier.api.service.billing.margin;

/**
 * What the admin can change to pass (docs/subscriptions/03 section 7.3), each computed exactly against the guard arithmetic.
 * {@code minPriceMinor}: smallest price that passes; {@code maxAiBudgetCents}: largest included AI budget per month that passes at
 * the current price; {@code maxDiscountBp}: largest annual discount whose derived YEAR price passes (YEAR checks only).
 * Null means no value passes (for example the fee plus the floor already exceed the price at any amount).
 */
public record MarginLevers(Long minPriceMinor, Long maxAiBudgetCents, Long maxDiscountBp) {}
