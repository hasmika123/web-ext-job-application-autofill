package com.dossier.api.service.billing;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.MailService;
import java.time.Instant;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * The personal-scope webhook handler: today's {@code BillingWebhookService} apply logic, moved here unchanged by K8.1
 * (docs/subscriptions/07 s5). It is the only writer of the personal {@code subscription} mirror and never sees an
 * organization-scoped event ({@link BillingScopeRouter} sends those to {@link OrgBillingWebhookHandler}). Record-then-apply,
 * idempotency and the transaction boundaries stay in {@code BillingWebhookService}; this class is called inside its apply transaction.
 */
@Component
public class UserBillingHandler {

    private static final Logger LOG = LoggerFactory.getLogger(UserBillingHandler.class);

    private final SubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;
    private final MailService mailService;
    private final StripeProperties stripeProperties;

    public UserBillingHandler(
        SubscriptionRepository subscriptionRepository,
        UserRepository userRepository,
        MailService mailService,
        StripeProperties stripeProperties
    ) {
        this.subscriptionRepository = subscriptionRepository;
        this.userRepository = userRepository;
        this.mailService = mailService;
        this.stripeProperties = stripeProperties;
    }

    /** Apply one verified, non-duplicate, personal-scope event to the {@code subscription} mirror (moved unchanged from {@code BillingWebhookService}, K8.1). */
    public void apply(StripeWebhookEvent event) {
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
        // One Stripe account can serve several businesses, and every one of their checkouts arrives
        // here. Another app's checkout can carry a client_reference_id that happens to be one of our
        // user ids — binding it would hand that user Pro for someone else's purchase. Two gates:
        // the session must not be tagged for another app, and (below) its customer must be the one
        // WE created for this user before sending them to checkout.
        if (event.taggedForAnotherApp()) {
            LOG.info("Ignoring checkout {}: it belongs to app '{}', not Kiwiply", event.id(), event.app());
            return;
        }
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
        // startCheckout always creates (or reuses) this user's Stripe customer and saves it BEFORE
        // opening checkout, so a genuine Kiwiply checkout's customer is already on the row. Any
        // other customer is a checkout we didn't start — from another app, or a forgery of the id.
        Subscription sub = subscriptionRepository.findOneByUserId(user.getId()).orElse(null);
        if (sub == null || sub.getStripeCustomerId() == null || !sub.getStripeCustomerId().equals(event.customerId())) {
            LOG.warn(
                "Ignoring checkout {}: customer {} isn't the one Kiwiply created for user {}",
                event.id(),
                event.customerId(),
                user.getLogin()
            );
            return;
        }
        if (event.subscriptionId() != null) sub.setStripeSubscriptionId(event.subscriptionId());
        touch(sub);
        subscriptionRepository.save(sub);
        LOG.info("Bound Stripe customer {} to user {}", event.customerId(), user.getLogin());
    }

    /** {@code customer.subscription.*} — the event carries the whole state, so mirror it. */
    private void upsertFromSubscription(StripeWebhookEvent event) {
        if (event.taggedForAnotherApp()) {
            LOG.info("Ignoring {} {}: it belongs to app '{}', not Kiwiply", event.type(), event.id(), event.app());
            return;
        }
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
        if (!isStale(sub, event)) {
            sub.setStatus("past_due");
            sub.setLastEventAt(event.created());
            touch(sub);
            subscriptionRepository.save(sub);
        }
        // The email is decided by the row's state, not by whether THIS event wrote it. Stripe
        // sends invoice.payment_failed and the matching subscription.updated (past_due) moments
        // apart; delivered in the other order, the updated event is newer, this one is stale,
        // and the status is already right — but nobody has told the user. Skipping the write is
        // correct; skipping the email would silently drop the one thing past_due exists for.
        // If a later invoice.paid already recovered the subscription, the row says so and no
        // failure email goes out for a problem that is over. Once per event is guaranteed by
        // record(), so a replay cannot double-send.
        if ("past_due".equalsIgnoreCase(lower(sub.getStatus()))) {
            sendPaymentFailedEmail(sub);
        }
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
