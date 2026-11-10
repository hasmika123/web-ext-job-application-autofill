package com.dossier.api.service.pricing;

/** Billing interval of a price (docs/subscriptions/03 section 1). {@code factor()} is the number of months it covers. */
public enum BillingInterval {
    MONTH(1),
    QUARTER(3),
    YEAR(12),
    ONE_TIME(0);

    private final int factor;

    BillingInterval(int factor) {
        this.factor = factor;
    }

    public int factor() {
        return factor;
    }

    public boolean isRecurring() {
        return this != ONE_TIME;
    }
}
