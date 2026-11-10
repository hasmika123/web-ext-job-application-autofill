package com.dossier.api.service.catalog;

import com.dossier.api.domain.catalog.ProductPrice;
import org.springframework.stereotype.Component;

/** The default {@link PriceStripeSync}: no Stripe object is created, the price is published with {@code stripe_price_id = NULL}. */
@Component
public class NoopPriceStripeSync implements PriceStripeSync {

    @Override
    public void onPublish(ProductPrice price) {
        // nothing: K1.5 adds a real PriceStripeSync next to this one (CatalogService calls every PriceStripeSync bean)
    }

    @Override
    public void onRetire(ProductPrice price) {
        // nothing
    }
}
