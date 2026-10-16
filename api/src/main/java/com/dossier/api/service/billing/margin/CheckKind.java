package com.dossier.api.service.billing.margin;

/** What a margin check looked at (docs/subscriptions/03 section 7.2 checks 1 to 5, plus services and discounts). */
public enum CheckKind {
    /** Check 1: a BASE or SEAT_BASE price with the plan's included AI cap. */
    BASE,
    /** Check 2: an OPTIONAL or SEAT_OPTIONAL price alone. */
    OPTIONAL,
    /** Check 3: base plus every optional at max quantity. */
    COMPOSITION,
    /** Check 4: a whole org preset. */
    PRESET,
    /** Check 4: a price at the deepest volume tier. */
    TIER,
    /** A net price after a discount: org_discount, promo_code, derived annual row. Never overridable. */
    DISCOUNT,
    /** A service: net minus payout, fees and AI against the service floor. */
    SERVICE,
    /** FEE or ONE_TIME: informational. */
    ONE_TIME,
}
