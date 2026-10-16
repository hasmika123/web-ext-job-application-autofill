package com.dossier.api.service.billing.personal;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.domain.sub.PersonalSubscriptionChange;
import com.dossier.api.domain.sub.SubscriptionAddon;
import com.dossier.api.domain.sub.SubscriptionQuote;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.sub.PersonalSubscriptionChangeRepository;
import com.dossier.api.repository.sub.SubscriptionAddonRepository;
import com.dossier.api.repository.sub.SubscriptionQuoteRepository;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.billing.BillingScopeRouter;
import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.dto.ChangeBatchDTO;
import com.dossier.api.service.dto.ChangeBatchDTO.ChangeDTO;
import com.dossier.api.service.dto.PlanQuoteDTO;
import com.dossier.api.service.dto.PlanQuoteDTO.QuoteLine;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The Kiwiply side of a confirmed change (docs/subscriptions/07-stripe-mapping.md section 2.2; story K5.4). {@link #record} turns a CHANGE quote into
 * {@code personal_subscription_change} rows and {@code subscription_addon} rows in ONE transaction, so the customer has what they bought immediately (an
 * addition now, a removal at the period end, no refund); {@link SubscriptionChangeApplier} then tells Stripe. {@link #undo} takes back a scheduled removal
 * or decrease (Stripe first, then Kiwiply). {@link #settleDue} finishes scheduled changes whose date has arrived.
 *
 * <p>This class and {@code PersonalAddonMirror} (the webhook) are the only writers of {@code subscription_addon}; neither touches the
 * {@code subscription} mirror itself.
 */
@Service
public class SubscriptionChangeService {

    private static final Logger LOG = LoggerFactory.getLogger(SubscriptionChangeService.class);

    public static final String ADD = "ADD_ADDON";
    public static final String REMOVE = "REMOVE_ADDON";
    public static final String QUANTITY = "CHANGE_QUANTITY";

    private final SubscriptionQuoteRepository quotes;
    private final PersonalQuoteService quoteService;
    private final PersonalBasket basket;
    private final SubscriptionAddonRepository addons;
    private final PersonalSubscriptionChangeRepository changes;
    private final ProductRepository products;
    private final SubscriptionRepository subscriptions;
    private final UserRepository users;
    private final BillingScopeRouter router;
    private final StripeGateway gateway;
    private final SubscriptionChangeApplier applier;
    private final ObjectMapper json;
    private final TransactionTemplate tx;

    public SubscriptionChangeService(
        SubscriptionQuoteRepository quotes,
        PersonalQuoteService quoteService,
        PersonalBasket basket,
        SubscriptionAddonRepository addons,
        PersonalSubscriptionChangeRepository changes,
        ProductRepository products,
        SubscriptionRepository subscriptions,
        UserRepository users,
        BillingScopeRouter router,
        StripeGateway gateway,
        SubscriptionChangeApplier applier,
        ObjectMapper json,
        PlatformTransactionManager transactionManager
    ) {
        this.tx = new TransactionTemplate(transactionManager);
        this.quotes = quotes;
        this.quoteService = quoteService;
        this.basket = basket;
        this.addons = addons;
        this.changes = changes;
        this.products = products;
        this.subscriptions = subscriptions;
        this.users = users;
        this.router = router;
        this.gateway = gateway;
        this.applier = applier;
        this.json = json;
    }

    /**
     * Record the changes of a confirmed CHANGE quote under {@code batchId}. Locks the quote: of two confirms only one applies it. Writes the changes (PENDING)
     * and the add-on rows, and marks the quote APPLIED. Nothing here calls Stripe.
     */
    @Transactional
    public List<PersonalSubscriptionChange> record(Long quoteId, String batchId, Subscription sub) {
        SubscriptionQuote q = quotes.lockById(quoteId).orElseThrow(() -> new BillingException(404, "NOT_FOUND", "Not found"));
        if (!PersonalQuoteService.STATUS_OPEN.equals(q.getStatus())) {
            throw new BillingException(409, "QUOTE_STALE", "This quote was already used", Map.of("reason", "QUOTE_APPLIED"));
        }
        if (q.getExpiresAt().isBefore(Instant.now())) throw new BillingException(410, "QUOTE_EXPIRED", "This quote has expired. Get a new one.");
        PersonalQuoteService.Stored stored = quoteService.stored(q);
        PlanQuoteDTO dto = stored.dto();
        Instant now = Instant.now();
        Instant periodEnd = q.getPeriodEndAt();
        Map<String, Integer> from = stored.meta().current();
        Map<String, Integer> to = stored.meta().addons();
        Map<String, QuoteLine> lineByFeature = dto.proposed().lines().stream().filter(l -> l.featureKey() != null).collect(Collectors.toMap(QuoteLine::featureKey, Function.identity(), (a, b) -> a));
        Map<String, PlanQuoteDTO.Addition> additionByFeature = dto.additions().stream().collect(Collectors.toMap(PlanQuoteDTO.Addition::featureKey, Function.identity(), (a, b) -> a));
        Map<String, SubscriptionAddon> rows = addons
            .findBySubscriptionIdAndLiveTrueOrderByIdAsc(sub.getId())
            .stream()
            .collect(Collectors.toMap(SubscriptionAddon::getFeatureKey, Function.identity(), (a, b) -> a));

        Set<String> keys = new LinkedHashSet<>(from.keySet());
        keys.addAll(to.keySet());
        List<PersonalSubscriptionChange> out = new java.util.ArrayList<>();
        for (String key : keys) {
            int qFrom = from.getOrDefault(key, 0);
            int qTo = to.getOrDefault(key, 0);
            if (qFrom == qTo) continue;
            SubscriptionAddon row = rows.get(key);
            PersonalSubscriptionChange c = new PersonalSubscriptionChange();
            c.setSubscriptionId(sub.getId());
            c.setUserId(sub.getUser().getId());
            c.setQuoteId(q.getId());
            c.setBatchId(batchId);
            c.setFeatureKey(key);
            c.setQuantityFrom(qFrom);
            c.setQuantityTo(qTo);
            c.setStatus("PENDING");
            c.setAttempts(0);
            c.setCreatedAt(now);
            c.setStripeIdempotencyKey(IdempotencyKey.of("sc", batchId, "items").value());
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("currency", q.getCurrency());
            payload.put("name", lineByFeature.containsKey(key) ? lineByFeature.get(key).name() : key);
            if (qTo > qFrom) {
                QuoteLine line = lineByFeature.get(key);
                Product product = products.findByCode(line.productCode()).orElseThrow(() -> new BillingException(409, "QUOTE_STALE", "stale", Map.of("reason", "PRICE_CHANGED")));
                Long priceId = Long.valueOf(line.priceId());
                c.setKind(qFrom == 0 ? ADD : QUANTITY);
                c.setProductId(product.getId());
                c.setPriceId(priceId);
                c.setEffectiveAt(now);
                PlanQuoteDTO.Addition a = additionByFeature.get(key);
                payload.put("unitMinor", line.unitEffectiveMinor());
                payload.put("prorationMinor", a == null ? 0L : a.prorationMinor());
                if (row == null) {
                    row = new SubscriptionAddon();
                    row.setSubscriptionId(sub.getId());
                    row.setUserId(sub.getUser().getId());
                    row.setFeatureKey(key);
                    row.setStartsAt(now);
                    row.setCreatedAt(now);
                    row.setLive(true);
                }
                row.setProductId(product.getId());
                row.setPriceId(priceId); // the increase is priced today: the whole item moves to today's catalog price (grandfathering is an open question)
                row.setQuantity(qTo);
                row.setEndsAt(null);
                row.setUpdatedAt(now);
            } else {
                if (row == null) throw new BillingException(409, "QUOTE_STALE", "stale", Map.of("reason", "SUBSCRIPTION_CHANGED"));
                c.setKind(qTo == 0 ? REMOVE : QUANTITY);
                c.setProductId(row.getProductId());
                c.setPriceId(row.getPriceId());
                c.setEffectiveAt(periodEnd);
                payload.put("prorationMinor", 0L);
                if (qTo == 0) {
                    row.setEndsAt(periodEnd); // works until the period end, no refund
                    row.setUpdatedAt(now);
                }
            }
            c.setPayloadJson(write(payload));
            c = changes.saveAndFlush(c);
            row.setChangeId(c.getId());
            if (qTo > qFrom || qTo == 0) addons.saveAndFlush(row);
            out.add(c);
        }
        if (out.isEmpty()) throw new BillingException(422, "NO_CHANGE", "Nothing would change");
        q.setStatus(PersonalQuoteService.STATUS_APPLIED);
        q.setAppliedBatchId(batchId);
        quotes.save(q);
        LOG.info("Recorded {} subscription change(s) in batch {} for subscription {}", out.size(), batchId, sub.getId());
        return out;
    }

    /** The batch as the API answers it: every change with its status plus what the subscription bills from now on. */
    @Transactional(readOnly = true)
    public ChangeBatchDTO batch(String batchId, PlanQuoteDTO quote) {
        List<ChangeDTO> list = changes.findByBatchIdOrderByIdAsc(batchId).stream().map(this::dto).toList();
        return new ChangeBatchDTO(batchId, list, quote.proposed().recurringMinor(), quote.nextInvoiceAt());
    }

    ChangeDTO dto(PersonalSubscriptionChange c) {
        long proration = 0;
        try {
            Map<String, Object> p = json.readValue(c.getPayloadJson() == null ? "{}" : c.getPayloadJson(), new TypeReference<Map<String, Object>>() {});
            Object v = p.get("prorationMinor");
            if (v instanceof Number n) proration = n.longValue();
        } catch (JsonProcessingException e) {
            LOG.warn("Change {} has an unreadable payload", c.getId());
        }
        return new ChangeDTO(c.getId(), c.getKind(), c.getFeatureKey(), c.getQuantityFrom(), c.getQuantityTo(), c.getEffectiveAt(), proration, c.getStatus());
    }

    /**
     * {@code DELETE /api/billing/changes/{id}}: take back a scheduled removal or decrease before its date. Stripe first: the item goes back to the quantity
     * the customer still holds, and only when Stripe agrees does Kiwiply drop the schedule. 404 for someone else's change, 409 {@code NOT_PENDING} when it
     * is not a scheduled change any more, 503 with billing off, 502 when Stripe refuses (nothing has changed then).
     */
    public ChangeDTO undo(Long changeId, String login) {
        User user = users.findOneByLogin(login).orElseThrow(() -> new BillingException(401, "UNAUTHENTICATED", "Sign in to continue"));
        router.requirePersonal(user);
        PersonalSubscriptionChange c = changes.findById(changeId).orElseThrow(() -> new BillingException(404, "NOT_FOUND", "Not found"));
        if (!user.getId().equals(c.getUserId())) throw new BillingException(404, "NOT_FOUND", "Not found");
        boolean scheduled = "PENDING".equals(c.getStatus()) && (REMOVE.equals(c.getKind()) || QUANTITY.equals(c.getKind())) && c.getStripeRef() != null
            && c.getQuantityTo() != null && c.getQuantityFrom() != null && c.getQuantityTo() < c.getQuantityFrom();
        if (!scheduled) throw new BillingException(409, "NOT_PENDING", "That change is no longer scheduled");
        if (!gateway.isEnabled()) throw BillingException.disabled();
        Subscription sub = subscriptions.findById(c.getSubscriptionId()).orElseThrow(() -> new BillingException(404, "NOT_FOUND", "Not found"));
        try {
            applier.setItems(sub, Map.of(c.getFeatureKey(), c.getQuantityFrom()), IdempotencyKey.of("un", c.getId()));
        } catch (StripeGatewayException e) {
            LOG.error("Undo of change {} refused by Stripe: {}", c.getId(), e.getKind());
            throw new BillingException(502, BillingException.CODE_STRIPE_ERROR, "Stripe couldn't complete that");
        }
        return tx.execute(s -> finishUndo(c.getId()));
    }

    private ChangeDTO finishUndo(Long changeId) {
        PersonalSubscriptionChange c = changes.findById(changeId).orElseThrow();
        Instant now = Instant.now();
        addons
            .findFirstBySubscriptionIdAndFeatureKeyAndLiveTrue(c.getSubscriptionId(), c.getFeatureKey())
            .ifPresent(row -> {
                row.setEndsAt(null);
                row.setUpdatedAt(now);
                addons.save(row);
            });
        c.setStatus("CANCELLED");
        c.setAppliedAt(now);
        return dto(changes.save(c));
    }

    /**
     * Finish what is due: a scheduled removal closes its add-on row, a scheduled decrease lowers the quantity, a row whose end passed with no change behind it
     * (removed in the Stripe portal) is closed. Returns how many rows or changes moved. Idempotent.
     */
    @Transactional
    public int settleDue(Instant now) {
        int moved = 0;
        for (PersonalSubscriptionChange c : changes.findScheduledDue(now)) {
            SubscriptionAddon row = addons.findFirstBySubscriptionIdAndFeatureKeyAndLiveTrue(c.getSubscriptionId(), c.getFeatureKey()).orElse(null);
            if (row != null) {
                if (REMOVE.equals(c.getKind())) {
                    row.setLive(false);
                    if (row.getEndsAt() == null) row.setEndsAt(now);
                } else {
                    row.setQuantity(c.getQuantityTo());
                }
                row.setUpdatedAt(now);
                addons.save(row);
            }
            c.setStatus("APPLIED");
            c.setAppliedAt(now);
            changes.save(c);
            moved++;
        }
        for (SubscriptionAddon row : addons.findDueForClose(now)) {
            row.setLive(false);
            row.setUpdatedAt(now);
            addons.save(row);
            moved++;
        }
        return moved;
    }

    private String write(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
