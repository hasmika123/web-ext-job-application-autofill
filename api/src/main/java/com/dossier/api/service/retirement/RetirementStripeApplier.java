package com.dossier.api.service.retirement;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.repository.sub.ProductPriceRepository;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.ItemQuantity;
import com.dossier.api.service.billing.StripeGateway.Period;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.billing.personal.PersonalBasket;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Every Stripe side effect of a retirement, behind the one gateway (docs/subscriptions/11 section 9, 07 section 2.3; stories K10.4 and K10.8). Test mode only: the
 * gateway refuses when no key is configured, and nothing here ever calls a refund (there is no such method on this class, and a test asserts the gateway never sees
 * one). Every write has an idempotency key {@code ret-{retirementId}-{subscriptionId}-{step}-{suffix}} that is stable across retries, so a timeout replays instead of
 * charging twice; the suffix is the batch of the subscriber's choice, because one subscriber may choose several times and each choice is its own operation.
 *
 * <p>Methods throw {@link StripeGatewayException}; callers record nothing in Kiwiply until Stripe agreed (Stripe first, then the mirror), or retry with the same key.
 */
@Service
public class RetirementStripeApplier {

    private static final Logger LOG = LoggerFactory.getLogger(RetirementStripeApplier.class);

    private final StripeGateway gateway;
    private final PersonalBasket basket;
    private final ProductPriceRepository prices;

    public RetirementStripeApplier(StripeGateway gateway, PersonalBasket basket, ProductPriceRepository prices) {
        this.gateway = gateway;
        this.basket = basket;
        this.prices = prices;
    }

    public boolean enabled() {
        return gateway.isEnabled();
    }

    /** 503 BILLING_DISABLED unless a Stripe key is configured. */
    public void requireEnabled() {
        if (!gateway.isEnabled()) throw BillingException.disabled();
    }

    public static IdempotencyKey key(Long retirementId, Long subscriptionId, String step, String suffix) {
        return suffix == null || suffix.isBlank() ? IdempotencyKey.of("ret", retirementId, subscriptionId, step) : IdempotencyKey.of("ret", retirementId, subscriptionId, step, suffix);
    }

    /**
     * The Stripe items of the subscription after a switch to the base price {@code newBaseStripePriceId}: the new base at 1, then every add-on the subscriber holds at the
     * price row it was bought at (a switch never re-prices a held add-on). Throws when a price has no Stripe counterpart.
     */
    public List<ItemQuantity> targetItems(Subscription sub, String newBaseStripePriceId, Instant now) {
        if (newBaseStripePriceId == null || newBaseStripePriceId.isBlank()) {
            throw new StripeGatewayException("The successor's base price has no Stripe counterpart", StripeGatewayException.Kind.INVALID_REQUEST, "price_not_synced", null);
        }
        List<ItemQuantity> out = new ArrayList<>();
        out.add(new ItemQuantity(newBaseStripePriceId, 1));
        for (PersonalBasket.Held h : basket.held(sub.getId(), now)) {
            if (h.effectiveQuantity() <= 0) continue;
            ProductPrice p = prices.findById(h.row().getPriceId()).orElse(null);
            if (p == null || p.getStripePriceId() == null) {
                throw new StripeGatewayException("A held add-on's price has no Stripe counterpart", StripeGatewayException.Kind.INVALID_REQUEST, "price_not_synced", null);
            }
            out.add(new ItemQuantity(p.getStripePriceId(), h.effectiveQuantity()));
        }
        return out;
    }

    /** A schedule whose second phase starts at {@code at} with {@code items} (equal or lower price, or a MIGRATE outcome): nothing changes today and nothing is charged. */
    public String schedule(Long retirementId, Subscription sub, List<ItemQuantity> items, Instant at, String suffix) {
        requireStripeSubscription(sub);
        return gateway.createSchedule(sub.getStripeSubscriptionId(), items, at, key(retirementId, sub.getId(), "sched", suffix));
    }

    /** Release a schedule created by {@link #schedule} (the subscriber chose again, or cancelled). A schedule that is already gone counts as released; any other refusal propagates. */
    public void release(Long retirementId, Subscription sub, String scheduleId, String suffix) {
        if (scheduleId == null || scheduleId.isBlank()) return;
        try {
            gateway.releaseSchedule(scheduleId, key(retirementId, sub.getId(), "rel", suffix));
        } catch (StripeGatewayException e) {
            if (e.getKind() != StripeGatewayException.Kind.INVALID_REQUEST) throw e;
            LOG.info("retirement schedule of subscription {} was already released or gone", sub.getId()); // the goal is "no schedule": that is already true
        }
    }

    /** "End at the period end" (or take it back): the cancel choice, and the D-1 pass for the undecided. No new invoice is ever created for a retiring plan. */
    public void cancelAtPeriodEnd(Long retirementId, Subscription sub, boolean cancel, String suffix) {
        requireStripeSubscription(sub);
        gateway.setCancelAtPeriodEnd(sub.getStripeSubscriptionId(), cancel, key(retirementId, sub.getId(), cancel ? "cancel" : "uncancel", suffix));
    }

    /**
     * A switch that takes effect now (a higher price the subscriber consented to): the items equal the successor's in ONE update with no Stripe proration, then Kiwiply's own
     * proration as one pending invoice item (skipped when 0). Returns the invoice item id, or null.
     */
    public String switchNow(Long retirementId, Subscription sub, List<ItemQuantity> items, long prorationMinor, String currency, String description, Period period, String suffix) {
        requireStripeSubscription(sub);
        gateway.setSubscriptionItems(sub.getStripeSubscriptionId(), items, key(retirementId, sub.getId(), "items", suffix));
        if (prorationMinor <= 0) return null;
        return gateway.createInvoiceItem(
            sub.getStripeCustomerId(),
            prorationMinor,
            currency,
            description,
            period,
            Map.of("retirement_id", String.valueOf(retirementId), "subscription_id", String.valueOf(sub.getId())),
            key(retirementId, sub.getId(), "pro", suffix)
        );
    }

    private void requireStripeSubscription(Subscription sub) {
        if (!gateway.isEnabled()) throw BillingException.disabled();
        if (sub.getStripeSubscriptionId() == null || sub.getStripeCustomerId() == null) {
            throw new BillingException(409, "NO_SUBSCRIPTION", "There is no active subscription to change");
        }
    }
}
