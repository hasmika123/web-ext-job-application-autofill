package com.dossier.api.service.retirement;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.repository.sub.PriceLookupRepository;
import com.dossier.api.repository.sub.ProductPriceRepository;
import com.dossier.api.service.billing.personal.PersonalBasket;
import java.time.Instant;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * What a personal subscription bills each period, at the prices it was bought at (the base price row of the subscription's Stripe price plus every held add-on at its
 * quantity), and the monthly equivalent of that. The same arithmetic {@code PlanViewService} shows as {@code recurringMinor}; retirements use it for the impact (MRR)
 * and for the "never a higher price without consent" comparisons. Read-only.
 */
@Component
public class RetirementMoney {

    private final PriceLookupRepository priceLookup;
    private final ProductPriceRepository productPrices;
    private final PersonalBasket basket;

    public RetirementMoney(PriceLookupRepository priceLookup, ProductPriceRepository productPrices, PersonalBasket basket) {
        this.priceLookup = priceLookup;
        this.productPrices = productPrices;
        this.basket = basket;
    }

    /** The recurring amount per billing period in minor units, 0 when the base price is unknown. */
    @Transactional(readOnly = true)
    public long recurringMinor(Subscription sub, Instant now) {
        if (sub == null || sub.getId() == null) return 0L;
        ProductPrice base = sub.getPriceId() == null ? null : priceLookup.findFirstByStripePriceId(sub.getPriceId()).orElse(null);
        long total = base == null ? 0L : base.getAmountMinor();
        for (PersonalBasket.Held h : basket.held(sub.getId(), now)) {
            ProductPrice p = productPrices.findById(h.row().getPriceId()).orElse(null);
            if (p != null) total += p.getAmountMinor() * h.effectiveQuantity();
        }
        return total;
    }

    /** The monthly equivalent of a recurring amount on {@code interval} (rounded half up; a missing interval counts as monthly). */
    public static long monthlyEquivalent(long recurringMinor, String interval) {
        int months = RetirementEffectiveDateService.months(interval);
        return months <= 1 ? recurringMinor : Math.round((double) recurringMinor / months);
    }
}
