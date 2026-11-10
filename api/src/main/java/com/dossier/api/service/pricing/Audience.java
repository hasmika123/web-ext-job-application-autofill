package com.dossier.api.service.pricing;

/** Who a price is sold to. Individuals have no contract, tier or org discount in the chain (docs/subscriptions/03 section 3). */
public enum Audience {
    INDIVIDUAL,
    ORG
}
