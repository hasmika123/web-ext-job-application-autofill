package com.dossier.api.service.billing.personal;

import java.util.List;

/**
 * Body of {@code POST /api/billing/quotes} (docs/subscriptions/09-apis.md section 3.1). {@code kind} is CHECKOUT (default) or CHANGE; {@code anonymous=true}
 * prices a basket for the pricing page without an account (it can never be checked out). {@code addons} is the TARGET add-on set, not a delta.
 * {@code confirmedCommercialDeps} lists the required services the person agreed to pay for when a quote asked them to.
 */
public record QuoteRequest(
    String kind,
    String planKey,
    String interval,
    List<AddonRequest> addons,
    String promoCode,
    Boolean anonymous,
    List<String> confirmedCommercialDeps
) {
    public record AddonRequest(String featureKey, Integer quantity) {}

    public QuoteRequest {
        addons = addons == null ? List.of() : List.copyOf(addons);
        confirmedCommercialDeps = confirmedCommercialDeps == null ? List.of() : List.copyOf(confirmedCommercialDeps);
    }
}
