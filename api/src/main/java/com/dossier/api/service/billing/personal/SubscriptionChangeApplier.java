package com.dossier.api.service.billing.personal;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.sub.PersonalSubscriptionChange;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.sub.PersonalSubscriptionChangeRepository;
import com.dossier.api.repository.sub.PriceLookupRepository;
import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.ItemQuantity;
import com.dossier.api.service.billing.StripeGateway.Period;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Tells Stripe about a confirmed change (docs/subscriptions/07-stripe-mapping.md section 2.2; story K5.4). For one batch, in this order: (1) make the
 * subscription's items equal Kiwiply's target in ONE update with {@code proration_behavior=none} (an addition +n now; a removal -n now, while the customer
 * keeps the add-on in Kiwiply until the period end), key {@code sc-{batchId}-items}; (2) one pending invoice item per prorated addition, the amount the
 * quote showed, key {@code sc-{changeId}-pro}, skipped when 0; (3) mark the changes. Additions become APPLIED; a scheduled removal or decrease stays PENDING
 * (undoable until its date) with its Stripe reference set.
 *
 * <p>A Stripe failure marks the batch FAILED and never rolls back what Kiwiply granted; {@link #retryFailed} (the retry job) runs the same keys again, so a
 * retry after a timeout replays instead of charging twice. A refusal Stripe will repeat (invalid request, declined) stops retrying at once. No customer or
 * subscription id is logged.
 */
@Service
public class SubscriptionChangeApplier {

    private static final Logger LOG = LoggerFactory.getLogger(SubscriptionChangeApplier.class);

    private final StripeGateway gateway;
    private final PersonalSubscriptionChangeRepository changes;
    private final SubscriptionRepository subscriptions;
    private final PersonalBasket basket;
    private final PriceLookupRepository prices;
    private final SettingsService settings;
    private final ObjectMapper json;
    private final TransactionTemplate tx;

    public SubscriptionChangeApplier(
        StripeGateway gateway,
        PersonalSubscriptionChangeRepository changes,
        SubscriptionRepository subscriptions,
        PersonalBasket basket,
        PriceLookupRepository prices,
        SettingsService settings,
        ObjectMapper json,
        PlatformTransactionManager transactionManager
    ) {
        this.gateway = gateway;
        this.changes = changes;
        this.subscriptions = subscriptions;
        this.basket = basket;
        this.prices = prices;
        this.settings = settings;
        this.json = json;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /** Apply every change of {@code batchId} that Stripe does not have yet (PENDING without a reference, or FAILED). Never throws for a Stripe refusal. */
    public void apply(String batchId) {
        List<PersonalSubscriptionChange> all = changes.findByBatchIdOrderByIdAsc(batchId);
        if (all.isEmpty()) return;
        List<PersonalSubscriptionChange> todo = all.stream().filter(c -> ("PENDING".equals(c.getStatus()) && c.getStripeRef() == null) || "FAILED".equals(c.getStatus())).toList();
        if (todo.isEmpty()) return;
        Subscription sub = subscriptions.findById(all.get(0).getSubscriptionId()).orElse(null);
        int max = settings.getInt(BillingSettingKeys.CHANGE_RETRY_MAX_ATTEMPTS);
        if (sub == null || sub.getStripeSubscriptionId() == null || sub.getStripeCustomerId() == null) {
            fail(todo, "NO_STRIPE_SUBSCRIPTION", max, max);
            return;
        }
        if (!gateway.isEnabled()) {
            fail(todo, "BILLING_DISABLED", -1, max);
            return;
        }
        tx.executeWithoutResult(s -> {
            for (PersonalSubscriptionChange c : todo) {
                c.setStatus("APPLYING");
                c.setAttempts(c.getAttempts() + 1);
                changes.save(c);
            }
        });
        try {
            PersonalSubscriptionChange switchChange = todo.stream().filter(SubscriptionChangeApplier::isSwitch).findFirst().orElse(null);
            boolean scheduledSwitch = switchChange != null && "SCHEDULED".equals(payload(switchChange).get("mode"));
            // a scheduled switch touches nothing today; everything else makes the items equal Kiwiply's target now (an upgrade with the new base)
            if (!scheduledSwitch) setItems(sub, Map.of(), switchChange == null ? null : stripePriceOf(switchChange.getPriceId()), IdempotencyKey.of("sc", batchId, "items"));
            Map<Long, String> refs = new LinkedHashMap<>();
            for (PersonalSubscriptionChange c : todo) {
                if (isSwitch(c)) {
                    refs.put(c.getId(), applySwitch(sub, c));
                    continue;
                }
                long proration = prorationOf(c);
                boolean addition = c.getQuantityTo() != null && c.getQuantityFrom() != null && c.getQuantityTo() > c.getQuantityFrom();
                String ref = "items";
                if (addition && proration > 0) {
                    ref =
                        gateway.createInvoiceItem(
                            sub.getStripeCustomerId(),
                            proration,
                            currencyOf(c, sub),
                            "Prorated: " + nameOf(c) + " x" + (c.getQuantityTo() - c.getQuantityFrom()),
                            new Period(c.getEffectiveAt(), sub.getCurrentPeriodEnd() == null ? c.getEffectiveAt() : sub.getCurrentPeriodEnd()),
                            Map.of("subscription_change_id", String.valueOf(c.getId())),
                            IdempotencyKey.of("sc", c.getId(), "pro")
                        );
                }
                refs.put(c.getId(), ref);
            }
            Instant now = Instant.now();
            tx.executeWithoutResult(s -> {
                for (PersonalSubscriptionChange c : todo) {
                    if (isSwitch(c)) {
                        finishSwitch(c, refs.get(c.getId()), now);
                        continue;
                    }
                    boolean scheduled = c.getQuantityTo() != null && c.getQuantityFrom() != null && c.getQuantityTo() < c.getQuantityFrom();
                    c.setStripeRef(refs.get(c.getId()));
                    c.setFailedReason(null);
                    if (scheduled) {
                        c.setStatus("PENDING"); // scheduled: undoable until its date, settled at the period end
                    } else {
                        c.setStatus("APPLIED");
                        c.setAppliedAt(now);
                    }
                    changes.save(c);
                }
            });
        } catch (StripeGatewayException e) {
            LOG.warn("Stripe refused change batch {}: {}", batchId, e.getKind());
            fail(todo, e.getKind() + (e.getStripeCode() == null ? "" : ":" + e.getStripeCode()), e.isRetryable() ? -1 : max, max);
        } catch (RuntimeException e) {
            LOG.error("Applying change batch {} failed", batchId, e);
            fail(todo, "INTERNAL_ERROR", -1, max);
        }
    }

    /** Retry every FAILED change still within {@code billing.change.retry_max_attempts}; returns how many batches were attempted. */
    public int retryFailed() {
        int max = settings.getInt(BillingSettingKeys.CHANGE_RETRY_MAX_ATTEMPTS);
        Set<String> batches = new LinkedHashSet<>();
        for (PersonalSubscriptionChange c : changes.findRetryable(max)) batches.add(c.getBatchId());
        for (String b : batches) apply(b);
        return batches.size();
    }

    /** Make the subscription's Stripe items equal Kiwiply's target, with {@code overrides} (feature to quantity) applied on top. Throws {@link StripeGatewayException}. */
    public void setItems(Subscription sub, Map<String, Integer> overrides, IdempotencyKey key) {
        setItems(sub, overrides, null, key);
    }

    /** As above, with {@code baseOverride} (a Stripe price id) as the base item: an upgrade swaps the base in the same update. */
    public void setItems(Subscription sub, Map<String, Integer> overrides, String baseOverride, IdempotencyKey key) {
        gateway.setSubscriptionItems(sub.getStripeSubscriptionId(), targetItems(sub, overrides, Instant.now(), baseOverride), key);
    }

    /** The Stripe items the subscription should have: the base at 1, then every held add-on at its effective quantity (a scheduled removal is already out). */
    public List<ItemQuantity> targetItems(Subscription sub, Map<String, Integer> overrides, Instant now) {
        return targetItems(sub, overrides, now, null);
    }

    List<ItemQuantity> targetItems(Subscription sub, Map<String, Integer> overrides, Instant now, String baseOverride) {
        String basePrice = baseOverride != null && !baseOverride.isBlank() ? baseOverride : sub.getPriceId();
        if (basePrice == null || basePrice.isBlank()) {
            throw new StripeGatewayException("The subscription has no base price", StripeGatewayException.Kind.INVALID_REQUEST, null, null);
        }
        List<ItemQuantity> out = new ArrayList<>();
        out.add(new ItemQuantity(basePrice, 1));
        for (PersonalBasket.Held h : basket.held(sub.getId(), now)) {
            int qty = overrides.getOrDefault(h.featureKey(), h.effectiveQuantity());
            if (qty <= 0) continue;
            ProductPrice p = prices.findById(h.row().getPriceId()).orElse(null);
            if (p == null || p.getStripePriceId() == null) {
                throw new StripeGatewayException("A price has no Stripe counterpart", StripeGatewayException.Kind.INVALID_REQUEST, "price_not_synced", null);
            }
            out.add(new ItemQuantity(p.getStripePriceId(), qty));
        }
        return out;
    }

    static boolean isSwitch(PersonalSubscriptionChange c) {
        return SubscriptionChangeService.PLAN_SWITCH.equals(c.getKind()) || SubscriptionChangeService.INTERVAL_SWITCH.equals(c.getKind());
    }

    private String stripePriceOf(Long priceRowId) {
        ProductPrice p = priceRowId == null ? null : prices.findById(priceRowId).orElse(null);
        if (p == null || p.getStripePriceId() == null || p.getStripePriceId().isBlank()) {
            throw new StripeGatewayException("A price has no Stripe counterpart", StripeGatewayException.Kind.INVALID_REQUEST, "price_not_synced", null);
        }
        return p.getStripePriceId();
    }

    /**
     * The Stripe side of one switch (07 section 2.3). NOW (an upgrade): the items were swapped by the batch update; this adds the proration invoice item.
     * SCHEDULED: a subscription schedule keeps today's items until the effective instant and then runs the target basket; when Stripe refuses that (a mixed
     * interval), the fallback marks the subscription to end at the period end and creates the successor subscription whose billing starts at that instant
     * ({@code trial_end} is only Stripe's way to say "start billing then", never free time: access follows the paid period, see UserBillingHandler).
     * Returns the reference stored on the change: {@code items}, an invoice item id, a schedule id, or {@code sub:} plus the successor subscription id.
     */
    private String applySwitch(Subscription sub, PersonalSubscriptionChange c) {
        Map<String, Object> payload = payload(c);
        if (!"SCHEDULED".equals(payload.get("mode"))) {
            long proration = prorationOf(c);
            if (proration <= 0) return "items";
            return gateway.createInvoiceItem(
                sub.getStripeCustomerId(),
                proration,
                currencyOf(c, sub),
                "Prorated: switch to " + nameOf(c),
                new Period(c.getEffectiveAt(), sub.getCurrentPeriodEnd() == null ? c.getEffectiveAt() : sub.getCurrentPeriodEnd()),
                Map.of("subscription_change_id", String.valueOf(c.getId())),
                IdempotencyKey.of("sc", c.getId(), "pro")
            );
        }
        List<ItemQuantity> phase = new ArrayList<>();
        Object items = payload.get("items");
        if (items instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> m && m.get("priceId") instanceof Number id && m.get("quantity") instanceof Number q) {
                    phase.add(new ItemQuantity(stripePriceOf(id.longValue()), q.longValue()));
                }
            }
        }
        if (phase.isEmpty()) throw new StripeGatewayException("The scheduled switch has no items", StripeGatewayException.Kind.INVALID_REQUEST, null, null);
        try {
            return gateway.createSchedule(sub.getStripeSubscriptionId(), phase, c.getEffectiveAt(), IdempotencyKey.of("sc", c.getId(), "sched"));
        } catch (StripeGatewayException e) {
            if (e.getKind() != StripeGatewayException.Kind.INVALID_REQUEST) throw e;
            LOG.info("Stripe refused a schedule for change {} ({}); using the successor-subscription path", c.getId(), e.getStripeCode());
            gateway.setCancelAtPeriodEnd(sub.getStripeSubscriptionId(), true, IdempotencyKey.of("sc", c.getId(), "cap"));
            String successor = gateway.createSubscription(
                sub.getStripeCustomerId(),
                phase,
                c.getEffectiveAt(),
                Map.of("app", "kiwiply", "kiwiply_scope", "personal", "switch_change_id", String.valueOf(c.getId())),
                IdempotencyKey.of("sc", c.getId(), "sub")
            );
            return "sub:" + successor;
        }
    }

    /** Record the outcome of a switch in one transaction: an upgrade is applied (the plan link moves now); a scheduled switch stays PENDING and is written on the subscription. */
    private void finishSwitch(PersonalSubscriptionChange c, String ref, Instant now) {
        c.setStripeRef(ref);
        c.setFailedReason(null);
        Subscription fresh = subscriptions.findById(c.getSubscriptionId()).orElse(null);
        if ("SCHEDULED".equals(payload(c).get("mode"))) {
            c.setStatus("PENDING");
            if (fresh != null) {
                fresh.setScheduleId(ref != null && ref.startsWith("sub:") ? null : ref);
                fresh.setScheduledPlanVersionId(c.getPlanVersionTo());
                fresh.setScheduledInterval(c.getIntervalTo());
                fresh.setScheduledAt(c.getEffectiveAt());
                fresh.setUpdatedAt(now);
                subscriptions.save(fresh);
            }
        } else {
            c.setStatus("APPLIED");
            c.setAppliedAt(now);
            if (fresh != null) {
                // Stripe accepted the swap and the customer pays for it: the plan link moves with it (the webhook confirms the same values a moment later)
                fresh.setPlanVersionId(c.getPlanVersionTo());
                ProductPrice base = c.getPriceId() == null ? null : prices.findById(c.getPriceId()).orElse(null);
                if (base != null && base.getStripePriceId() != null) fresh.setPriceId(base.getStripePriceId());
                fresh.setUpdatedAt(now);
                subscriptions.save(fresh);
            }
        }
        changes.save(c);
    }

    private void fail(List<PersonalSubscriptionChange> todo, String reason, int attemptsOverride, int max) {
        tx.executeWithoutResult(s -> {
            for (PersonalSubscriptionChange c : todo) {
                c.setStatus("FAILED");
                c.setFailedReason(reason.length() > 500 ? reason.substring(0, 500) : reason);
                if (attemptsOverride >= 0) c.setAttempts(attemptsOverride); // a refusal Stripe will repeat stops retrying now
                changes.save(c);
            }
        });
    }

    private long prorationOf(PersonalSubscriptionChange c) {
        Object v = payload(c).get("prorationMinor");
        return v instanceof Number n ? n.longValue() : 0L;
    }

    private String currencyOf(PersonalSubscriptionChange c, Subscription sub) {
        Object v = payload(c).get("currency");
        return v instanceof String s && !s.isBlank() ? s : sub.getCurrency();
    }

    private String nameOf(PersonalSubscriptionChange c) {
        Object v = payload(c).get("name");
        return v instanceof String s && !s.isBlank() ? s : c.getFeatureKey();
    }

    private Map<String, Object> payload(PersonalSubscriptionChange c) {
        try {
            return json.readValue(c.getPayloadJson() == null ? "{}" : c.getPayloadJson(), new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }
}
