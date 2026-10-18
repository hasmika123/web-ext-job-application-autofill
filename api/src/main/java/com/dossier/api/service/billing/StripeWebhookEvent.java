package com.dossier.api.service.billing;

import java.time.Instant;
import java.util.List;
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
 * @param amountCents    for an invoice: the amount paid ({@code invoice.paid}) or due (a failure)
 * @param currency       for an invoice: its ISO currency, lower-case as Stripe sends it
 * @param app            the {@code app} metadata on the session or subscription — {@link #KIWIPLY} on
 *                       everything we create; another value means another business on the same
 *                       Stripe account, and the event is none of ours
 * @param currentPeriodStart start of the current period (item 0), when the event has one (K8.2)
 * @param scope          {@code kiwiply_scope} metadata ({@link #SCOPE_ORG} / {@link #SCOPE_PERSONAL}), null on events that predate it (K8.2, 07 s5)
 * @param orgId          {@code org_id} metadata when the scope is org
 * @param quoteId        {@code quote_id} metadata set at checkout and on subscription updates
 * @param items          every subscription item (id, price, quantity), for add-on mirroring
 * @param invoice        the invoice snapshot, on {@code invoice.*} events
 * @param scheduleId     the subscription schedule id, on subscriptions and {@code subscription_schedule.*} events
 * @param discount       a coupon discount, on {@code customer.discount.*} events
 * @param paymentIntentId payment intent of an invoice, when present
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
    String clientReferenceId,
    Long amountCents,
    String currency,
    String app,
    Instant currentPeriodStart,
    String scope,
    Long orgId,
    String quoteId,
    List<Item> items,
    InvoiceInfo invoice,
    String scheduleId,
    DiscountInfo discount,
    String paymentIntentId
) {
    /** Values of the {@code kiwiply_scope} metadata (07 s5). */
    public static final String SCOPE_PERSONAL = "personal";
    public static final String SCOPE_ORG = "org";

    /** One subscription item on the event. */
    public record Item(String itemId, String priceId, long quantity) {}

    /** One invoice line on the event. */
    public record InvoiceLineInfo(String priceId, long quantity, long amount, String description, Instant periodStart, Instant periodEnd, boolean proration) {}

    /** The invoice on an {@code invoice.*} event. */
    public record InvoiceInfo(
        String id,
        String number,
        String status,
        String currency,
        long amountDue,
        long amountPaid,
        Instant periodStart,
        Instant periodEnd,
        Instant dueAt,
        Instant paidAt,
        String hostedUrl,
        String pdfUrl,
        List<InvoiceLineInfo> lines
    ) {
        public InvoiceInfo {
            lines = lines == null ? List.of() : List.copyOf(lines);
        }
    }

    /** The discount on a {@code customer.discount.*} event. */
    public record DiscountInfo(String couponId, Long amountOffMinor, Long percentOff) {}

    public StripeWebhookEvent {
        items = items == null ? List.of() : List.copyOf(items);
    }

    /** The pre-K8.2 shape (personal fields only); every new field is empty. Keeps hand-built events in tests and callers unchanged. */
    public StripeWebhookEvent(
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
        String clientReferenceId,
        Long amountCents,
        String currency,
        String app
    ) {
        this(id, type, created, objectType, customerId, subscriptionId, status, priceId, currentPeriodEnd, cancelAtPeriodEnd, clientReferenceId,
            amountCents, currency, app, null, null, null, null, List.of(), null, null, null, null);
    }

    /** True when the event says it belongs to an organization's billing. */
    public boolean isOrgScoped() {
        return SCOPE_ORG.equalsIgnoreCase(scope == null ? "" : scope.trim());
    }

    /** The {@code app} metadata value Kiwiply puts on every customer, checkout and subscription. */
    public static final String KIWIPLY = "kiwiply";

    /** True when the event is tagged as another app's — absent counts as not foreign. */
    public boolean taggedForAnotherApp() {
        return app != null && !app.isBlank() && !KIWIPLY.equalsIgnoreCase(app.trim());
    }

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
