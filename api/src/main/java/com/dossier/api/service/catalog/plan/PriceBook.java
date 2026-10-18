package com.dossier.api.service.catalog.plan;

import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import com.dossier.api.service.pricing.PriceRow;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * The prices a plan version would sell at, resolved per (product, interval, currency): the ACTIVE row, a DRAFT row that publishing the version will
 * publish with it, or a DERIVED yearly price that publishing will create (K9.1). Pure values; {@link PlanLoader} fills it from the tables.
 */
public final class PriceBook {

    public enum Source {
        ACTIVE,
        DRAFT,
        DERIVED,
    }

    /**
     * One resolved price. {@code priceId} is null for a DERIVED projection (no row yet). For a derived price {@code derivedFromPriceId} is the monthly
     * row it comes from (null when that row is itself not yet created) and {@code derivedDiscountBp} the discount applied.
     */
    public record Entry(
        Long priceId,
        String productCode,
        Audience audience,
        BillingInterval interval,
        String currency,
        long amountMinor,
        Source source,
        String stripePriceId,
        Long derivedFromPriceId,
        Integer derivedDiscountBp,
        boolean derivedRow
    ) {
        /** True for a yearly price that is a discount of the monthly one (a projection, or an existing row with annual_source DERIVED). */
        public boolean isDerived() {
            return derivedRow || source == Source.DERIVED;
        }
    }

    private final Map<String, Entry> entries = new LinkedHashMap<>();

    private static String key(String product, BillingInterval interval, String currency) {
        return product + "|" + interval + "|" + currency;
    }

    public PriceBook put(Entry e) {
        entries.put(key(e.productCode(), e.interval(), e.currency()), e);
        return this;
    }

    public Optional<Entry> get(String productCode, BillingInterval interval, String currency) {
        return Optional.ofNullable(entries.get(key(productCode, interval, currency)));
    }

    public java.util.Collection<Entry> all() {
        return entries.values();
    }

    /** The engine's view: a catalog port answering only from this book (so a draft version can be priced before anything is published). */
    public com.dossier.api.service.pricing.CatalogPort asCatalogPort(Map<String, String> kindByProduct, Map<String, java.util.function.ToIntFunction<BillingInterval>> aiByProduct) {
        return (productCode, audience, interval, currency, at) ->
            get(productCode, interval, currency)
                .filter(e -> e.audience() == audience)
                .map(e -> new PriceRow(
                    e.priceId() == null ? "derived:" + productCode + ":" + interval : String.valueOf(e.priceId()),
                    productCode,
                    kindByProduct.getOrDefault(productCode, "FEATURE"),
                    audience,
                    interval,
                    currency,
                    e.amountMinor(),
                    aiByProduct.containsKey(productCode) ? aiByProduct.get(productCode).applyAsInt(interval) : 0
                ));
    }
}
