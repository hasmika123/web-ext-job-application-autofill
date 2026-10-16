package com.dossier.api.service.catalog;

import com.dossier.api.domain.catalog.Plan;
import com.dossier.api.domain.catalog.PlanComponent;
import com.dossier.api.domain.catalog.PlanVersion;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.repository.sub.PlanComponentRepository;
import com.dossier.api.repository.sub.PlanRepository;
import com.dossier.api.repository.sub.PlanVersionRepository;
import com.dossier.api.repository.sub.PriceLookupRepository;
import com.dossier.api.repository.sub.ProductPriceRepository;
import com.dossier.api.service.billing.StripeProperties;
import com.dossier.api.service.entitlement.FeatureKeys;
import com.dossier.api.service.entitlement.PlanResolverCore;
import java.util.Optional;
import java.util.OptionalInt;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Story K1.6: the numbers that used to live in properties and constants, read from the PUBLISHED catalog instead - the Stripe price id of a plan's base
 * price, its AI budget, its resume cap. Every read answers empty when the plan has no live version (PRO, AUTOPILOT and ORG_STANDARD stay DRAFT until an
 * administrator publishes prices, B-01), and the caller then keeps the legacy value, so an unpublished catalog changes nothing for anyone. Read-only.
 *
 * <p>The old settings ({@code STRIPE_PRICE_MONTHLY}, {@code STRIPE_PRICE_3MO}, {@code DOSSIER_AI_*_BUDGET_USD}) keep working as the fallback for one release and
 * a start-up line says they are deprecated once the catalog can answer.
 */
@Component
public class CatalogDefaults {

    private static final Logger LOG = LoggerFactory.getLogger(CatalogDefaults.class);

    private final PlanRepository plans;
    private final PlanVersionRepository versions;
    private final PlanComponentRepository components;
    private final ProductPriceRepository prices;
    private final PriceLookupRepository priceLookup;
    private final CatalogSettings settings;
    private final StripeProperties stripe;

    public CatalogDefaults(
        PlanRepository plans,
        PlanVersionRepository versions,
        PlanComponentRepository components,
        ProductPriceRepository prices,
        PriceLookupRepository priceLookup,
        CatalogSettings settings,
        StripeProperties stripe
    ) {
        this.plans = plans;
        this.versions = versions;
        this.components = components;
        this.prices = prices;
        this.priceLookup = priceLookup;
        this.settings = settings;
        this.stripe = stripe;
    }

    private Optional<PlanVersion> live(String planKey) {
        return plans.findByPlanKey(planKey).map(Plan::getId).flatMap(versions::findLive);
    }

    /** The Stripe price id of the live plan's base product at {@code interval} (MONTH, QUARTER, YEAR) in the default currency. */
    @Transactional(readOnly = true)
    public Optional<String> basePriceId(String planKey, String interval) {
        return live(planKey)
            .map(PlanVersion::getBaseProductId)
            .flatMap(pid -> prices.findActive(pid, "INDIVIDUAL", interval, settings.defaultCurrency()))
            .map(ProductPrice::getStripePriceId)
            .filter(id -> !id.isBlank());
    }

    /** The AI budget in cents of one billing period of the live plan: the monthly cap, or the explicit quarterly figure (Pro 800, decision E-2). */
    @Transactional(readOnly = true)
    public OptionalInt aiBudgetCents(String planKey, String interval) {
        Optional<PlanVersion> v = live(planKey);
        if (v.isEmpty() || v.get().getAiBudgetCapCents() == null || v.get().getAiBudgetCapCents() <= 0) return OptionalInt.empty();
        int monthly = v.get().getAiBudgetCapCents();
        if ("QUARTER".equals(interval)) return OptionalInt.of(PlanResolverCore.QUARTERLY_AI_CENTS.getOrDefault(planKey, monthly * 3));
        return OptionalInt.of(monthly);
    }

    /** The live-resume cap the live plan grants (its {@code resume.library} allowance). */
    @Transactional(readOnly = true)
    public OptionalInt resumeCap(String planKey) {
        return live(planKey)
            .flatMap(v -> components.findByPlanVersionIdOrderBySortOrderAscIdAsc(v.getId()).stream().filter(c -> FeatureKeys.RESUME_LIBRARY.equals(c.getFeatureKey())).findFirst())
            .map(PlanComponent::getAllowanceOverride)
            .filter(a -> a != null && a > 0)
            .map(a -> OptionalInt.of((int) Math.min(a, Integer.MAX_VALUE)))
            .orElse(OptionalInt.empty());
    }

    /** The interval of a catalog price by its Stripe id (MONTH, QUARTER, YEAR), for a price the env settings do not name. */
    @Transactional(readOnly = true)
    public Optional<String> intervalOfStripePrice(String stripePriceId) {
        if (stripePriceId == null || stripePriceId.isBlank()) return Optional.empty();
        return priceLookup.findFirstByStripePriceId(stripePriceId.trim()).map(ProductPrice::getBillingInterval);
    }

    /** The amount in minor units of a catalog price by its Stripe id. */
    @Transactional(readOnly = true)
    public Optional<ProductPrice> priceByStripeId(String stripePriceId) {
        if (stripePriceId == null || stripePriceId.isBlank()) return Optional.empty();
        return priceLookup.findFirstByStripePriceId(stripePriceId.trim());
    }

    @EventListener(ApplicationReadyEvent.class)
    public void warnAboutDeprecatedSettings() {
        try {
            boolean set = (stripe.getPriceMonthly() != null && !stripe.getPriceMonthly().isBlank()) || (stripe.getPrice3mo() != null && !stripe.getPrice3mo().isBlank());
            if (set && basePriceId("PRO", "MONTH").isPresent()) {
                LOG.info("STRIPE_PRICE_MONTHLY / STRIPE_PRICE_3MO are deprecated: the Pro price ids now come from the published catalog (docs/subscriptions/README.md, cut-over runbook). Remove them after one release.");
            }
        } catch (RuntimeException e) {
            LOG.debug("deprecation check skipped: {}", e.toString());
        }
    }
}
