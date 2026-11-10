package com.dossier.api.service.billing.personal;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.domain.sub.SubscriptionAddon;
import com.dossier.api.domain.sub.SubscriptionQuote;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.sub.PersonalSubscriptionChangeRepository;
import com.dossier.api.repository.sub.PriceLookupRepository;
import com.dossier.api.repository.sub.SubscriptionAddonRepository;
import com.dossier.api.repository.sub.SubscriptionQuoteRepository;
import com.dossier.api.service.billing.StripeWebhookEvent;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The webhook's add-on mirror (docs/subscriptions/07-stripe-mapping.md sections 2.1 and 5; story K5.2). Called by {@code UserBillingHandler} inside its apply
 * transaction for personal subscription events: it replaces the {@code subscription_addon} rows from the subscription's {@code items[]} (matched by Stripe price
 * id to {@code product_price} to the product's feature), links the subscription to its plan version, interval, currency and period start when the base price is
 * a catalog price, and marks the quote the checkout came from APPLIED. It writes nothing for an item whose price is not in the catalog (the legacy env prices),
 * so the pre-catalog path is untouched.
 *
 * <p>A feature with a change still in flight (PENDING, APPLYING, FAILED) is left alone: Kiwiply owns the quantity until that change settles (a scheduled
 * removal keeps the add-on until the period end while Stripe's item is already reduced, 07 section 2.2).
 */
@Component
public class PersonalAddonMirror {

    private static final Logger LOG = LoggerFactory.getLogger(PersonalAddonMirror.class);

    private final SubscriptionAddonRepository addons;
    private final PersonalSubscriptionChangeRepository changes;
    private final PriceLookupRepository prices;
    private final ProductRepository products;
    private final SubscriptionQuoteRepository quotes;
    private final JdbcTemplate jdbc;

    public PersonalAddonMirror(
        SubscriptionAddonRepository addons,
        PersonalSubscriptionChangeRepository changes,
        PriceLookupRepository prices,
        ProductRepository products,
        SubscriptionQuoteRepository quotes,
        JdbcTemplate jdbc
    ) {
        this.addons = addons;
        this.changes = changes;
        this.prices = prices;
        this.products = products;
        this.quotes = quotes;
        this.jdbc = jdbc;
    }

    /** Mirror one {@code customer.subscription.*} event onto the add-on rows and the plan link of {@code sub}. */
    public void syncSubscription(Subscription sub, StripeWebhookEvent event) {
        if (sub.getId() == null) return;
        Instant now = Instant.now();
        boolean deleted = "customer.subscription.deleted".equals(event.type());
        List<StripeWebhookEvent.Item> items = event.items();
        Map<String, ProductPrice> byStripePrice = new HashMap<>();
        if (!items.isEmpty()) {
            for (ProductPrice p : prices.findByStripePriceIdIn(items.stream().map(StripeWebhookEvent.Item::priceId).filter(java.util.Objects::nonNull).toList())) {
                byStripePrice.put(p.getStripePriceId(), p);
            }
        }
        linkPlan(sub, event, byStripePrice);
        markQuoteApplied(sub, event);

        Set<String> seenFeatures = new HashSet<>();
        if (!deleted) {
            for (StripeWebhookEvent.Item item : items) {
                ProductPrice price = byStripePrice.get(item.priceId());
                if (price == null) continue;
                Product product = products.findById(price.getProductId()).orElse(null);
                if (product == null || product.getFeatureKey() == null || "SUBSCRIPTION".equals(product.getKind())) continue; // the base, or not an add-on
                seenFeatures.add(product.getFeatureKey());
                mirrorItem(sub, product, price, item, now);
            }
        }
        Instant ends = sub.getCurrentPeriodEnd() != null && sub.getCurrentPeriodEnd().isAfter(now) ? sub.getCurrentPeriodEnd() : now;
        for (SubscriptionAddon row : addons.findBySubscriptionIdAndLiveTrueOrderByIdAsc(sub.getId())) {
            if (seenFeatures.contains(row.getFeatureKey()) || row.getEndsAt() != null || changeInFlight(sub.getId(), row.getFeatureKey())) continue;
            if (!deleted && items.isEmpty()) continue; // an event that carries no items says nothing about them
            // Stripe no longer bills it and Kiwiply has no change in flight (removed in the portal, or the subscription ended): the customer keeps it to the period end.
            row.setEndsAt(ends);
            row.setUpdatedAt(now);
            addons.save(row);
        }
    }

    private void mirrorItem(Subscription sub, Product product, ProductPrice price, StripeWebhookEvent.Item item, Instant now) {
        String feature = product.getFeatureKey();
        if (changeInFlight(sub.getId(), feature)) {
            addons.findFirstBySubscriptionIdAndFeatureKeyAndLiveTrue(sub.getId(), feature).ifPresent(row -> {
                row.setStripeItemId(item.itemId());
                addons.save(row);
            });
            return;
        }
        SubscriptionAddon row = addons.findFirstBySubscriptionIdAndFeatureKeyAndLiveTrue(sub.getId(), feature).orElse(null);
        int qty = (int) Math.max(0, Math.min(item.quantity(), Integer.MAX_VALUE));
        if (row == null) {
            row = new SubscriptionAddon();
            row.setSubscriptionId(sub.getId());
            row.setUserId(sub.getUser().getId());
            row.setFeatureKey(feature);
            row.setStartsAt(now);
            row.setCreatedAt(now);
            row.setLive(true);
        }
        row.setProductId(product.getId());
        row.setPriceId(price.getId());
        row.setQuantity(qty);
        row.setStripeItemId(item.itemId());
        row.setEndsAt(null);
        row.setUpdatedAt(now);
        addons.save(row);
    }

    private boolean changeInFlight(Long subscriptionId, String featureKey) {
        return changes
            .findBySubscriptionIdAndStatusInOrderByIdAsc(subscriptionId, PersonalBasket.OPEN_CHANGE)
            .stream()
            .anyMatch(c -> featureKey.equals(c.getFeatureKey()));
    }

    /** The subscription's plan link from the base item: set on first sight (or when the checkout's quote names the version), never silently moved. */
    private void linkPlan(Subscription sub, StripeWebhookEvent event, Map<String, ProductPrice> byStripePrice) {
        ProductPrice base = event.priceId() == null ? null : byStripePrice.get(event.priceId());
        Product product = base == null ? null : products.findById(base.getProductId()).orElse(null);
        if (product == null || !"SUBSCRIPTION".equals(product.getKind())) {
            // K5.6: after a schedule phase or a plan swap the base is not necessarily item 0: take the item whose product is a plan base
            base = null;
            product = null;
            for (StripeWebhookEvent.Item item : event.items()) {
                ProductPrice p = item.priceId() == null ? null : byStripePrice.get(item.priceId());
                Product pr = p == null ? null : products.findById(p.getProductId()).orElse(null);
                if (pr != null && "SUBSCRIPTION".equals(pr.getKind())) {
                    base = p;
                    product = pr;
                    break;
                }
            }
            if (base == null) return;
            sub.setPriceId(base.getStripePriceId());
        }
        Long versionId = sub.getPlanVersionId();
        SubscriptionQuote quote = quoteOf(sub, event);
        boolean landed = false;
        if (quote != null && quote.getPlanVersionId() != null && java.util.Objects.equals(baseProductOf(quote.getPlanVersionId()), product.getId()) && sub.getScheduledPlanVersionId() == null) {
            versionId = quote.getPlanVersionId();
        } else if (sub.getScheduledPlanVersionId() != null && switchLanded(sub, base, product)) {
            // K5.6: the scheduled switch took effect: the base item is the target's, at the target's interval
            versionId = sub.getScheduledPlanVersionId();
            landed = true;
        } else if (versionId == null || (sub.getScheduledPlanVersionId() == null && !java.util.Objects.equals(baseProductOf(versionId), product.getId()))) {
            // first sight, or the base was swapped (an upgrade whose Kiwiply write did not complete): the live version of the base product
            Long live = liveVersionOfBase(product.getId());
            if (live != null) versionId = live;
        }
        if (versionId != null) sub.setPlanVersionId(versionId);
        if (landed) finishLandedSwitch(sub, versionId);
        sub.setBillingInterval(base.getBillingInterval());
        sub.setCurrency(base.getCurrency());
        if (event.currentPeriodStart() != null) sub.setCurrentPeriodStart(event.currentPeriodStart());
    }

    private boolean switchLanded(Subscription sub, ProductPrice base, Product product) {
        if (!java.util.Objects.equals(baseProductOf(sub.getScheduledPlanVersionId()), product.getId())) return false;
        return sub.getScheduledInterval() == null || sub.getScheduledInterval().equals(base.getBillingInterval());
    }

    private void finishLandedSwitch(Subscription sub, Long versionId) {
        sub.clearScheduledSwitch();
        sub.setScheduleId(null);
        Instant now = Instant.now();
        for (var c : changes.findBySubscriptionIdAndStatusInOrderByIdAsc(sub.getId(), List.of("PENDING"))) {
            boolean isSwitch = "PLAN_SWITCH".equals(c.getKind()) || "INTERVAL_SWITCH".equals(c.getKind());
            if (isSwitch && java.util.Objects.equals(c.getPlanVersionTo(), versionId)) {
                c.setStatus("APPLIED");
                c.setAppliedAt(now);
                changes.save(c);
            }
        }
    }

    private void markQuoteApplied(Subscription sub, StripeWebhookEvent event) {
        SubscriptionQuote quote = quoteOf(sub, event);
        if (quote != null && "OPEN".equals(quote.getStatus())) {
            quote.setStatus("APPLIED");
            quotes.save(quote);
        }
    }

    private SubscriptionQuote quoteOf(Subscription sub, StripeWebhookEvent event) {
        if (event.quoteId() == null || event.quoteId().isBlank()) return null;
        try {
            SubscriptionQuote q = quotes.findById(Long.valueOf(event.quoteId())).orElse(null);
            return q != null && q.getUserId() != null && sub.getUser() != null && q.getUserId().equals(sub.getUser().getId()) ? q : null;
        } catch (NumberFormatException e) {
            LOG.warn("Ignoring a non-numeric quote_id on Stripe event {}", event.id());
            return null;
        }
    }

    private Long baseProductOf(Long versionId) {
        List<Long> r = jdbc.queryForList("SELECT base_product_id FROM plan_version WHERE id = ?", Long.class, versionId);
        return r.isEmpty() ? null : r.get(0);
    }

    private Long liveVersionOfBase(Long productId) {
        List<Long> r = jdbc.queryForList("SELECT id FROM plan_version WHERE base_product_id = ? AND status = 'PUBLISHED' ORDER BY id DESC", Long.class, productId);
        return r.isEmpty() ? null : r.get(0);
    }
}
