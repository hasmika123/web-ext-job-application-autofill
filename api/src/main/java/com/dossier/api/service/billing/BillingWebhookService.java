package com.dossier.api.service.billing;

import com.dossier.api.domain.StripeEvent;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.StripeEventRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.MailService;
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
    private final UserRepository userRepository;
    private final MailService mailService;
    private final StripeProperties stripeProperties;

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
        UserRepository userRepository,
        MailService mailService,
        StripeProperties stripeProperties,
        PlatformTransactionManager transactionManager
    ) {
        this.stripeEventRepository = stripeEventRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.userRepository = userRepository;
        this.mailService = mailService;
        this.stripeProperties = stripeProperties;
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
            mark(event.id(), StripeEvent.STATUS_OK, null);
            return Outcome.PROCESSED;
        } catch (RuntimeException e) {
            LOG.error("Failed to apply Stripe event {} ({})", event.id(), event.type(), e);
            mark(event.id(), StripeEvent.STATUS_FAILED, e.toString());
            throw e;
        }
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
        if (stripeEventRepository.existsById(event.id())) return false;
        try {
            return Boolean.TRUE.equals(
                newTx.execute(s -> {
                    StripeEvent row = new StripeEvent();
                    row.setId(event.id());
                    row.setType(event.type());
                    row.setReceivedAt(Instant.now());
                    row.setStatus(StripeEvent.STATUS_OK);
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

    private void mark(String eventId, String status, String error) {
        newTx.executeWithoutResult(s ->
            stripeEventRepository
                .findById(eventId)
                .ifPresent(row -> {
                    row.setStatus(status);
                    row.setProcessedAt(Instant.now());
                    // Truncated: a stack trace is for triage, not for filling the column.
                    row.setError(error == null ? null : error.substring(0, Math.min(error.length(), 2000)));
                    stripeEventRepository.save(row);
                })
        );
    }

    private void apply(StripeWebhookEvent event) {
        tx.executeWithoutResult(s -> applyInTx(event));
    }

    private void applyInTx(StripeWebhookEvent event) {
        switch (event.type()) {
            case "checkout.session.completed" -> bindCustomer(event);
            case "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted" -> upsertFromSubscription(
                event
            );
            case "invoice.paid" -> setStatusFromInvoice(event, "active");
            case "invoice.payment_failed" -> onPaymentFailed(event);
            default -> LOG.debug("Ignoring Stripe event type {}", event.type());
        }
    }

    /**
     * {@code checkout.session.completed} — bind the Stripe customer to our user.
     *
     * <p>This is the one place the link is established, via {@code client_reference_id} (our user
     * id, set when the session was created). Deliberately <b>not</b> subject to the ordering
     * drop: it writes identity, not mutable state, so applying it late is harmless, whereas
     * skipping it would orphan the subscription from its account.
     */
    private void bindCustomer(StripeWebhookEvent event) {
        Optional<Long> userId = event.userIdFromClientReference();
        if (userId.isEmpty() || event.customerId() == null) {
            LOG.warn("checkout.session.completed {} without a client_reference_id or customer — cannot bind", event.id());
            return;
        }
        User user = userRepository.findById(userId.get()).orElse(null);
        if (user == null) {
            LOG.warn("checkout.session.completed {} references unknown user {}", event.id(), userId.get());
            return;
        }
        Subscription sub = subscriptionRepository.findOneByUserId(user.getId()).orElseGet(() -> {
            Subscription fresh = new Subscription();
            fresh.setUser(user);
            fresh.setCreatedAt(Instant.now());
            return fresh;
        });
        sub.setStripeCustomerId(event.customerId());
        if (event.subscriptionId() != null) sub.setStripeSubscriptionId(event.subscriptionId());
        touch(sub);
        subscriptionRepository.save(sub);
        LOG.info("Bound Stripe customer {} to user {}", event.customerId(), user.getLogin());
    }

    /** {@code customer.subscription.*} — the event carries the whole state, so mirror it. */
    private void upsertFromSubscription(StripeWebhookEvent event) {
        Subscription sub = findSubscription(event).orElse(null);
        if (sub == null) {
            // No row this event belongs to: either the binding hasn't arrived (the
            // checkout.session.completed that carries it will create the row, and later events
            // fill the state in), or findSubscription deliberately declined it and has already
            // logged why. Deliberately vague about which — claiming "not bound yet" when the
            // customer IS bound is worse than saying nothing, and cost real time to unpick.
            LOG.info("Nothing to apply {} to for Stripe customer {}", event.type(), event.customerId());
            return;
        }
        if (isStale(sub, event)) return;

        if (event.subscriptionId() != null) sub.setStripeSubscriptionId(event.subscriptionId());
        if (event.status() != null) sub.setStatus(event.status());
        if (event.priceId() != null) sub.setPriceId(event.priceId());
        if (event.currentPeriodEnd() != null) sub.setCurrentPeriodEnd(event.currentPeriodEnd());
        if (event.cancelAtPeriodEnd() != null) sub.setCancelAtPeriodEnd(event.cancelAtPeriodEnd());
        sub.setLastEventAt(event.created());
        touch(sub);
        subscriptionRepository.save(sub);
    }

    /** {@code invoice.paid} — the charge went through, so the subscription is in good standing. */
    private void setStatusFromInvoice(StripeWebhookEvent event, String status) {
        Subscription sub = findSubscription(event).orElse(null);
        if (sub == null) {
            LOG.info("Nothing to apply {} to for Stripe customer {}", event.type(), event.customerId());
            return;
        }
        if (isStale(sub, event)) return;
        sub.setStatus(status);
        sub.setLastEventAt(event.created());
        touch(sub);
        subscriptionRepository.save(sub);
    }

    /**
     * {@code invoice.payment_failed} — mark past_due and tell the user.
     *
     * <p>They keep Pro until {@code currentPeriodEnd} (see {@code EntitlementService}), because
     * Stripe's Smart Retries are still running: this is usually an expired card, not a
     * non-payer. The email is the whole point of the status — silently lapsing in three weeks
     * would be the worst outcome.
     */
    private void onPaymentFailed(StripeWebhookEvent event) {
        Subscription sub = findSubscription(event).orElse(null);
        if (sub == null) {
            LOG.info("Nothing to apply {} to for Stripe customer {}", event.type(), event.customerId());
            return;
        }
        if (isStale(sub, event)) return;
        sub.setStatus("past_due");
        sub.setLastEventAt(event.created());
        touch(sub);
        subscriptionRepository.save(sub);
        sendPaymentFailedEmail(sub);
    }

    private void sendPaymentFailedEmail(Subscription sub) {
        User user = sub.getUser();
        if (user == null || user.getEmail() == null) return;
        String manageUrl = stripeProperties.getPortalReturnUrl();
        String html =
            "<p>Hi " +
            escape(user.getFirstName() == null ? user.getLogin() : user.getFirstName()) +
            ",</p>" +
            "<p>We couldn't take payment for your Kiwiply Pro subscription. Your card may have expired.</p>" +
            "<p><strong>Nothing has been switched off yet</strong> — you keep Pro while we retry. " +
            "Updating your card is the quickest fix:</p>" +
            "<p><a href=\"" +
            escape(manageUrl) +
            "\">Update your payment method</a></p>" +
            "<p>Regards,<br/>The Kiwiply Team</p>";
        try {
            mailService.sendEmail(user.getEmail(), "Your Kiwiply Pro payment didn't go through", html, false, true);
        } catch (RuntimeException e) {
            // A mail failure must not fail the webhook — Stripe would retry and we'd re-apply
            // state that is already correct. The status change is what matters.
            LOG.warn("Could not send the payment-failed email to {}", user.getLogin(), e);
        }
    }

    /** Find the row an event concerns: by subscription id when present, else by customer. */
    private Optional<Subscription> findSubscription(StripeWebhookEvent event) {
        if (event.subscriptionId() != null) {
            Optional<Subscription> bySub = subscriptionRepository.findOneByStripeSubscriptionId(event.subscriptionId());
            if (bySub.isPresent()) return bySub;
        }
        if (event.customerId() == null) return Optional.empty();

        Optional<Subscription> byCustomer = subscriptionRepository.findOneByStripeCustomerId(event.customerId());
        if (byCustomer.isEmpty() || event.subscriptionId() == null) return byCustomer;

        // The customer matches but the subscription does not: this event is about a DIFFERENT
        // subscription on the same customer. Falling through to the customer row would write one
        // subscription's fate onto another — cancelling a stray subscription would downgrade a
        // user who is still paying. Only a subscription that is alive may take the row over,
        // which is what a genuine resubscribe looks like.
        String known = byCustomer.get().getStripeSubscriptionId();
        if (known == null || known.equals(event.subscriptionId())) return byCustomer;
        if (LIVE_STATUSES.contains(lower(event.status()))) {
            LOG.info("Subscription {} supersedes {} for customer {}", event.subscriptionId(), known, event.customerId());
            return byCustomer;
        }
        LOG.info(
            "Ignoring {} for subscription {}: customer {} is mirrored against {}",
            event.type(),
            event.subscriptionId(),
            event.customerId(),
            known
        );
        return Optional.empty();
    }

    /** Statuses that mean a subscription is alive enough to take over a customer's row. */
    private static final java.util.Set<String> LIVE_STATUSES = java.util.Set.of("active", "trialing", "past_due");

    private static String lower(String s) {
        return s == null ? "" : s.trim().toLowerCase();
    }

    /**
     * True when this event is older than the last one applied to the row. Stripe doesn't
     * guarantee order, and applying a stale {@code updated} after a newer one would resurrect
     * an old status — e.g. re-activating a cancelled subscription.
     */
    private boolean isStale(Subscription sub, StripeWebhookEvent event) {
        if (sub.getLastEventAt() == null || event.created() == null) return false;
        if (event.created().isBefore(sub.getLastEventAt())) {
            LOG.info("Stripe event {} ({}) is older than the last applied event — ignoring", event.id(), event.type());
            return true;
        }
        return false;
    }

    /** Recompute the derived tier and stamp the row. */
    private void touch(Subscription sub) {
        boolean pro = EntitlementService.isProFor(sub.getStatus(), sub.getCurrentPeriodEnd(), Instant.now());
        sub.setPlan(pro ? Subscription.PLAN_PRO : Subscription.PLAN_FREE);
        sub.setUpdatedAt(Instant.now());
    }

    private static String escape(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
