package com.dossier.api.service.billing;

import com.dossier.api.domain.StripeEvent;
import com.dossier.api.repository.StripeEventRepository;
import com.dossier.api.repository.SubscriptionRepository;
import java.time.Instant;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.UnexpectedRollbackException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Applies verified Stripe webhook events to the {@code subscription} mirror (Phase 12.2).
 *
 * <p><b>This is the only thing in the codebase that writes subscription state.</b> The checkout
 * return page never does: it can be skipped, replayed or forged, so it must not be what makes
 * someone Pro.
 *
 * <p>Three properties it has to get right, because money depends on them:
 *
 * <ol>
 *   <li><b>Idempotency.</b> Stripe delivers at least once and retries every non-2xx, so the same
 *       {@code evt_…} will arrive twice. The event id is the primary key of {@code stripe_event};
 *       a replay collides on insert and stops there.
 *   <li><b>Ordering.</b> Stripe does not guarantee delivery order, so a stale
 *       {@code subscription.updated} can land after a newer one. Events older than the row's
 *       {@code last_event_at} are dropped — except the customer↔user binding, which is identity,
 *       not mutable state, and is safe (and necessary) to apply whenever it arrives.
 *   <li><b>Retryability.</b> A handler failure must leave a record and return 500, so Stripe
 *       retries. Recording and applying therefore run in separate transactions: a rolled-back
 *       apply must not also erase the evidence that it happened.
 * </ol>
 */
@Service
public class BillingWebhookService {

    private static final Logger LOG = LoggerFactory.getLogger(BillingWebhookService.class);

    /** What happened to an event — the resource turns this into a status code. */
    public enum Outcome {
        /** Applied (or deliberately skipped, e.g. an event for a customer we don't know). */
        PROCESSED,
        /** Already seen. Stripe is retrying something we handled; answer 200 and do nothing. */
        DUPLICATE,
    }

    private final StripeEventRepository stripeEventRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final BillingScopeRouter router;
    private final UserBillingHandler userHandler;
    private final OrgBillingWebhookHandler orgHandler;

    /**
     * Transactions are driven explicitly rather than with {@code @Transactional}, for two
     * reasons: the three steps below are self-invoked from {@link #handle}, where Spring's proxy
     * would silently skip the annotation entirely, and for code that moves money the boundaries
     * are worth seeing at the call site.
     */
    private final TransactionTemplate newTx;
    private final TransactionTemplate tx;

    public BillingWebhookService(
        StripeEventRepository stripeEventRepository,
        SubscriptionRepository subscriptionRepository,
        BillingScopeRouter router,
        UserBillingHandler userHandler,
        org.springframework.beans.factory.ObjectProvider<OrgBillingWebhookHandler> orgHandlers,
        PlatformTransactionManager transactionManager
    ) {
        this.stripeEventRepository = stripeEventRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.router = router;
        this.userHandler = userHandler;
        // No-op until the organization handler lands (X6.14): org events are recorded and acknowledged, never applied to the personal mirror.
        this.orgHandler = orgHandlers.getIfAvailable(() -> OrgBillingWebhookHandler.NOOP);
        this.tx = new TransactionTemplate(transactionManager);
        this.newTx = new TransactionTemplate(transactionManager);
        this.newTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * Record, then apply. Throws if applying fails, after marking the event {@code failed} — the
     * caller answers 500 so Stripe retries.
     */
    public Outcome handle(StripeWebhookEvent event) {
        if (!record(event)) {
            LOG.info("Stripe event {} already handled — ignoring the replay", event.id());
            return Outcome.DUPLICATE;
        }
        try {
            apply(event);
            mark(event, StripeEvent.STATUS_OK, null);
            return Outcome.PROCESSED;
        } catch (RuntimeException e) {
            LOG.error("Failed to apply Stripe event {} ({})", event.id(), event.type(), e);
            mark(event, StripeEvent.STATUS_FAILED, e.toString());
            throw e;
        }
    }

    /** What an admin replay did: the row that records it, the event it re-applied and how that ended. */
    public record ReplayResult(String replayRowId, String originalEventId, String status) {}

    /**
     * Re-apply a Stripe event the admin fetched by id (K8.5), bypassing the duplicate check on purpose: the point is to run the handler again for an event
     * that was lost, failed or applied wrongly. It is recorded as its own {@code stripe_event} row ({@code replay:{evt}:{n}}, {@code replayed_from},
     * {@code replayed_by}), so the original keeps its history, and goes through the same scope router and handlers as a delivery. The handlers' own
     * ordering rule still applies: an event older than the row's {@code last_event_at} changes nothing. A failure is recorded and rethrown. An original
     * stored as {@code failed} is settled to {@code ok} by a successful replay. It never calls Stripe: the event was already read.
     */
    public ReplayResult replay(StripeWebhookEvent event, String actor) {
        String by = actor == null ? "system" : actor.substring(0, Math.min(actor.length(), 50));
        // The number is allocated in the transaction that writes the row, so it counts what is committed now (a caller that is itself inside a transaction would
        // otherwise count from an older snapshot and collide with the previous replay's row).
        String rowId = newTx.execute(s -> {
            String id = "replay:" + event.id() + ":" + (stripeEventRepository.countByReplayedFrom(event.id()) + 1);
            StripeEvent row = new StripeEvent();
            row.setId(id);
            row.setType(event.type());
            row.setReceivedAt(Instant.now());
            row.setStatus(StripeEvent.STATUS_OK);
            describeOnto(row, event);
            row.setScope(router.routeOf(event).label());
            row.setOrgId(event.orgId());
            row.setReplayedFrom(event.id());
            row.setReplayedBy(by);
            stripeEventRepository.saveAndFlush(row);
            return id;
        });
        try {
            apply(event);
        } catch (RuntimeException e) {
            LOG.error("Replay of Stripe event {} ({}) failed", event.id(), event.type(), e);
            mark(rowId, event, StripeEvent.STATUS_FAILED, e.toString());
            throw e;
        }
        mark(rowId, event, StripeEvent.STATUS_OK, null);
        newTx.executeWithoutResult(s ->
            stripeEventRepository
                .findById(event.id())
                .filter(o -> StripeEvent.STATUS_FAILED.equals(o.getStatus()))
                .ifPresent(o -> {
                    o.setStatus(StripeEvent.STATUS_OK);
                    o.setProcessedAt(Instant.now());
                    stripeEventRepository.save(o);
                })
        );
        return new ReplayResult(rowId, event.id(), StripeEvent.STATUS_OK);
    }

    /**
     * Insert the event row, in its own transaction so the record survives a failed apply.
     *
     * <p>Two ways this says "already seen", and both matter because Stripe delivers
     * <b>at-least-once</b>: the cheap read, and losing the race to insert. The primary key is the
     * idempotency key, so the database settles a genuine race — but the losing side has to be
     * handled <b>outside</b> the transaction. A failed flush marks the transaction rollback-only,
     * so catching the violation inside the callback and returning a value does not rescue it: the
     * commit then throws {@link UnexpectedRollbackException}, the handler 500s, and Stripe retries
     * an event we had already stored. That is what this code used to do (fixed 2026-09-21) —
     * self-healing, but it turned the cheapest path in the webhook into a round trip.
     *
     * @return false when this event has already been seen
     */
    private boolean record(StripeWebhookEvent event) {
        // Cheap path first: the overwhelmingly common duplicate is a redelivery, not a race.
        Optional<StripeEvent> existing = stripeEventRepository.findById(event.id());
        if (existing.isPresent()) {
            // Seen before. If the previous apply blew up, Stripe is retrying exactly as we asked
            // it to — this is the retry, so let it through. Treating it as a duplicate would
            // make our 500 a request for a retry we then refuse, and lose the event for good
            // (found in the pre-launch review, 2026-09-22).
            if (!StripeEvent.STATUS_FAILED.equals(existing.get().getStatus())) return false;
            LOG.info("Retrying Stripe event {} after a failed apply", event.id());
            return true;
        }
        try {
            return Boolean.TRUE.equals(
                newTx.execute(s -> {
                    StripeEvent row = new StripeEvent();
                    row.setId(event.id());
                    row.setType(event.type());
                    row.setReceivedAt(Instant.now());
                    row.setStatus(StripeEvent.STATUS_OK);
                    describeOnto(row, event);
                    row.setScope(router.routeOf(event).label());
                    row.setOrgId(event.orgId());
                    stripeEventRepository.saveAndFlush(row);
                    return true;
                })
            );
        } catch (DataIntegrityViolationException | UnexpectedRollbackException e) {
            // Another delivery of this same event inserted it first. Both exceptions mean the
            // same thing here; which one surfaces depends on where the constraint was detected.
            LOG.debug("Event {} was recorded by a concurrent delivery", event.id());
            return false;
        }
    }

    private void mark(StripeWebhookEvent event, String status, String error) {
        mark(event.id(), event, status, error);
    }

    private void mark(String rowId, StripeWebhookEvent event, String status, String error) {
        newTx.executeWithoutResult(s ->
            stripeEventRepository
                .findById(rowId)
                .ifPresent(row -> {
                    row.setStatus(status);
                    row.setProcessedAt(Instant.now());
                    // Resolved after the apply, so a checkout that just bound the customer counts.
                    if (row.getUserId() == null) row.setUserId(resolveUserId(event));
                    // Truncated: a stack trace is for triage, not for filling the column.
                    row.setError(error == null ? null : error.substring(0, Math.min(error.length(), 2000)));
                    stripeEventRepository.save(row);
                })
        );
    }

    /**
     * Who and what an event is about, for the admin customer timeline (9.C1). Written on the
     * first record only; a retried failure keeps what the first delivery wrote.
     */
    static void describeOnto(StripeEvent row, StripeWebhookEvent event) {
        row.setCustomerId(event.customerId());
        row.setAmountCents(event.amountCents());
        row.setCurrency(event.currency());
        row.setOccurredAt(event.created());
        row.setDetail(describe(event));
    }

    /** A one-line description of an event, as an admin would want to read it. */
    static String describe(StripeWebhookEvent event) {
        String status = event.status() == null ? null : event.status().replace('_', ' ');
        String d =
            switch (event.type()) {
                case "checkout.session.completed" -> "Checkout completed";
                case "customer.subscription.created" -> "Subscription started" + (status == null ? "" : ": " + status);
                case "customer.subscription.updated" -> "Subscription updated" +
                (status == null ? "" : ": " + status) +
                (Boolean.TRUE.equals(event.cancelAtPeriodEnd()) ? ", set to cancel at period end" : "");
                case "customer.subscription.deleted" -> "Subscription ended";
                case "invoice.paid" -> "Payment received";
                case "invoice.payment_failed" -> "Payment failed";
                default -> event.type();
            };
        return d.length() > 255 ? d.substring(0, 255) : d;
    }

    /** Our user for an event: the checkout's client reference, else whoever owns the customer. */
    private Long resolveUserId(StripeWebhookEvent event) {
        Optional<Long> fromCheckout = event.userIdFromClientReference();
        if (fromCheckout.isPresent()) return fromCheckout.get();
        if (event.customerId() == null) return null;
        return subscriptionRepository
            .findOneByStripeCustomerId(event.customerId())
            .map(sub -> sub.getUser() == null ? null : sub.getUser().getId())
            .orElse(null);
    }

    private void apply(StripeWebhookEvent event) {
        tx.executeWithoutResult(s -> applyInTx(event));
    }

    /**
     * Route first (docs/subscriptions/07 s5): an organization event goes to {@link OrgBillingWebhookHandler} and never touches the personal
     * {@code subscription} mirror; a personal event goes to {@link UserBillingHandler} (today's code, moved unchanged) and never touches
     * {@code org_*}; another app's event is ignored.
     */
    private void applyInTx(StripeWebhookEvent event) {
        switch (router.routeOf(event)) {
            case ORG -> orgHandler.apply(event);
            case PERSONAL -> userHandler.apply(event);
            case IGNORED -> LOG.info("Ignoring Stripe event {} ({}): it is not Kiwiply's", event.id(), event.type());
        }
    }
}
