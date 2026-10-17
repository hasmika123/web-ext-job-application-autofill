package com.dossier.api.service.catalog.plan;

import com.dossier.api.service.catalog.plan.PriceBook.Entry;
import com.dossier.api.service.catalog.plan.PriceBook.Source;
import com.dossier.api.service.pricing.AnnualPrices;
import com.dossier.api.service.pricing.BillingInterval;
import java.util.Optional;

/**
 * K9.1: the yearly price of a product when nobody typed one (docs/subscriptions/03 section 5.1). Precedence, highest first: an explicit YEAR row
 * (never touched here), the component discount, the plan version discount, the global {@code billing.annual.default_discount_bp}. The result is a
 * projection; {@code PlanService} turns it into a real, immutable row (annual_source DERIVED) inside the publish transaction.
 */
public final class AnnualPriceDeriver {

    private AnnualPriceDeriver() {}

    /**
     * @param month         the monthly entry the yearly price comes from
     * @param existingYear  the YEAR entry already in the book for that product (active or draft), or null
     * @return the YEAR entry to use: the existing one when it is explicit or already matches, else a DERIVED projection; empty when there is no month price
     */
    public static Optional<Entry> yearFor(Entry month, Entry existingYear, Integer componentDiscountBp, Integer planDiscountBp, int globalDefaultBp) {
        if (month == null) return Optional.empty();
        if (existingYear != null && !existingYear.isDerived() && existingYear.source() == Source.DRAFT) return Optional.of(existingYear); // an admin-typed draft
        int bp = AnnualPrices.resolveDiscountBp(componentDiscountBp, planDiscountBp, globalDefaultBp);
        long amount = AnnualPrices.derive(month.amountMinor(), bp);
        if (existingYear != null) {
            boolean explicitActive = !existingYear.isDerived();
            if (explicitActive) return Optional.of(existingYear); // an explicit yearly row outranks every discount
            if (existingYear.amountMinor() == amount && existingYear.source() == Source.ACTIVE) return Optional.of(existingYear); // same derivation: reuse the row
        }
        return Optional.of(new Entry(null, month.productCode(), month.audience(), BillingInterval.YEAR, month.currency(), amount, Source.DERIVED, null, month.priceId(), bp, true));
    }
}
