package com.dossier.api.service.pricing;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/** Test implementation of the catalog port: rows keyed by (product, audience, interval, currency). */
public class InMemoryCatalog implements CatalogPort {

    private final Map<String, PriceRow> rows = new HashMap<>();

    private static String key(String product, Audience a, BillingInterval i, String currency) {
        return product + "#" + a + "#" + i + "#" + currency;
    }

    /** aiPerMonth is multiplied by the interval factor to give the budget of the whole period. */
    public InMemoryCatalog add(String product, String kind, Audience a, BillingInterval i, String currency, long amount, int aiPerMonth) {
        return addWindow(product, kind, a, i, currency, amount, aiPerMonth * Math.max(1, i.factor()));
    }

    public InMemoryCatalog addWindow(String product, String kind, Audience a, BillingInterval i, String currency, long amount, int aiWindow) {
        rows.put(key(product, a, i, currency), new PriceRow("price-" + product + "-" + i, product, kind, a, i, currency, amount, aiWindow));
        return this;
    }

    /** Adds MONTH and, when discountBp is not negative, a derived YEAR row (month x 12 less the discount). */
    public InMemoryCatalog addWithYear(String product, String kind, Audience a, String currency, long month, int aiPerMonth, int yearDiscountBp) {
        add(product, kind, a, BillingInterval.MONTH, currency, month, aiPerMonth);
        if (yearDiscountBp >= 0) {
            add(product, kind, a, BillingInterval.YEAR, currency, AnnualPrices.derive(month, yearDiscountBp), aiPerMonth);
        }
        return this;
    }

    @Override
    public Optional<PriceRow> activePrice(String productCode, Audience audience, BillingInterval interval, String currency, Instant at) {
        return Optional.ofNullable(rows.get(key(productCode, audience, interval, currency)));
    }
}
