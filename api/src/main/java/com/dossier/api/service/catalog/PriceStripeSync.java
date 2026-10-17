package com.dossier.api.service.catalog;

import com.dossier.api.domain.catalog.ProductPrice;

/**
 * The seam between the catalog and Stripe (story K1.5 implements it): called inside the publish/retire transaction, BEFORE the commit, so a failed
 * Stripe call rolls the price back (docs/subscriptions/07-stripe-mapping.md). The default implementation does nothing, which is what billing-disabled
 * deployments and stories before K1.5 want: the price is published with {@code stripe_price_id = NULL}.
 */
public interface PriceStripeSync {
    /** A price is going live (or is scheduled): create its Stripe Price and set {@code stripePriceId} on the row. */
    void onPublish(ProductPrice price);

    /** A price is retired: deactivate its Stripe Price (never delete it: existing subscriptions keep it). */
    void onRetire(ProductPrice price);
}
