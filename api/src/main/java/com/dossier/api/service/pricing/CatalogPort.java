package com.dossier.api.service.pricing;

import java.time.Instant;
import java.util.Optional;

/** What the pricing engine needs from the catalog. The real adapter reads the catalog tables; tests use an in-memory one. */
public interface CatalogPort {
    /** The active row for (product, audience, interval, currency) at {@code at}: {@code effective_from <= at < effective_until}. */
    Optional<PriceRow> activePrice(String productCode, Audience audience, BillingInterval interval, String currency, Instant at);
}
