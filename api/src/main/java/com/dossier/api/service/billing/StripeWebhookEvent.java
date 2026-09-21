package com.dossier.api.service.billing;

import java.time.Instant;
import java.util.Optional;

/**
 * A verified Stripe webhook event, reduced to what the handler actually needs (Phase 12).
 *
 * <p>Deliberately not {@code com.stripe.model.Event}: keeping Stripe's types behind
 * {@link StripeGateway} is what lets the webhook tests build events by hand instead of
 * constructing SDK objects, and it forces us to state exactly which fields we depend on.
 *
 * @param id             the `evt_…` id — the idempotency key
 * @param type           e.g. {@code customer.subscription.updated}
 * @param created        Stripe's own timestamp; used to drop out-of-order deliveries
 * @param objectType     the type of the embedded object (`subscription`, `checkout.session`, `invoice`)
 * @param customerId     the Stripe customer the event concerns, when it has one
 * @param subscriptionId the Stripe subscription, when the event has one
 * @param status         the subscription status carried by the event, when it has one
 * @param priceId        the price on the subscription, when the event has one
 * @param currentPeriodEnd end of the paid-for period, when the event has one
 * @param cancelAtPeriodEnd whether the subscription is set to end at the period boundary
 * @param clientReferenceId our user id, set at checkout — how a customer binds to a user
 */
public record StripeWebhookEvent(
    String id,
    String type,
    Instant created,
    String objectType,
    String customerId,
    String subscriptionId,
    String status,
    String priceId,
    Instant currentPeriodEnd,
    Boolean cancelAtPeriodEnd,
    String clientReferenceId
) {
    public Optional<String> customer() {
        return Optional.ofNullable(customerId);
    }

    public Optional<String> subscription() {
        return Optional.ofNullable(subscriptionId);
    }

    public Optional<Long> userIdFromClientReference() {
        try {
            return Optional.ofNullable(clientReferenceId).filter(s -> !s.isBlank()).map(Long::valueOf);
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }
}
