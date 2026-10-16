package com.dossier.api.service.billing;

import com.stripe.StripeClient;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.exception.StripeException;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.StripeObject;
import com.stripe.model.Subscription;
import com.stripe.model.checkout.Session;
import com.stripe.net.RequestOptions;
import com.stripe.net.Webhook;
import org.springframework.beans.factory.annotation.Autowired;
import com.stripe.param.CustomerCreateParams;
import com.stripe.param.billingportal.SessionCreateParams;
import com.stripe.param.checkout.SessionCreateParams.LineItem;
import com.stripe.param.checkout.SessionCreateParams.Mode;
import java.time.Instant;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * The real Stripe gateway — <b>the only class in this codebase that imports {@code com.stripe.*}</b>
 * (Phase 12.1). Keeping the SDK behind {@link StripeGateway} is what lets every test stub billing
 * and what makes an SDK upgrade a one-file change.
 *
 * <p>Every method refuses when no secret key is configured, so a keyless server (develop, CI, a
 * fresh clone) starts and runs normally with billing simply switched off.
 */
@Service
public class StripeGatewayImpl implements StripeGateway {

    private static final Logger LOG = LoggerFactory.getLogger(StripeGatewayImpl.class);

    private final StripeProperties props;
    private final StripeClient client;

    @Autowired
    public StripeGatewayImpl(StripeProperties props) {
        // Built once; null when billing is off so nothing can accidentally call out.
        this(props, props.isEnabled() ? new StripeClient(props.getSecretKey()) : null);
    }

    /** Test seam: a client wired to a recording response getter (no network). */
    StripeGatewayImpl(StripeProperties props, StripeClient client) {
        this.props = props;
        this.client = client;
        if (client == null) {
            LOG.info("Stripe is not configured (dossier.stripe.secret-key is blank) — billing is disabled.");
        } else if (props.getWebhookSecret() == null || props.getWebhookSecret().isBlank()) {
            // Loud, because the symptom is silent and the diagnosis is not: checkout succeeds,
            // the customer is charged, and then NOTHING happens — the webhook is the only writer
            // of subscription state, so without a secret every delivery is rejected unverified
            // and nobody ever becomes Pro. Half-configured billing is worse than none, and this
            // is the only moment we can say so before a real payment is taken.
            LOG.error(
                "Stripe is ENABLED but dossier.stripe.webhook-secret is BLANK. Checkout will work and customers " +
                "WILL be charged, but no payment can ever activate a subscription: the webhook is the only writer " +
                "of subscription state and every delivery will be rejected. Set STRIPE_WEBHOOK_SECRET."
            );
        }
    }

    @Override
    public boolean isEnabled() {
        return client != null;
    }

    private StripeClient require() {
        if (client == null) throw new StripeGatewayException("Stripe is not configured", StripeGatewayException.Kind.NOT_ENABLED, null, null);
        return client;
    }

    @Override
    public String createCustomer(String email, String login, Long userId) {
        try {
            CustomerCreateParams params = CustomerCreateParams.builder()
                .setEmail(email)
                .setName(login)
                // Our user id on the customer, so a human in the Stripe dashboard can always
                // trace a payment back to an account without a lookup table.
                .putMetadata("userId", String.valueOf(userId))
                .putMetadata("login", login)
                // Which business this is, on a Stripe account that may serve more than one.
                .putMetadata("app", StripeWebhookEvent.KIWIPLY)
                .build();
            return require().customers().create(params).getId();
        } catch (StripeException e) {
            throw new StripeGatewayException("Could not create the Stripe customer", e);
        }
    }

    @Override
    public String createCheckoutSession(String customerId, String priceId, Long userId, String successUrl, String cancelUrl) {
        try {
            com.stripe.param.checkout.SessionCreateParams.Builder builder = com.stripe.param.checkout.SessionCreateParams.builder()
                .setMode(Mode.SUBSCRIPTION)
                .setCustomer(customerId)
                // How the webhook binds this customer back to our user. The return URL is never
                // trusted for that — it can be skipped, replayed or forged.
                .setClientReferenceId(String.valueOf(userId))
                .setSuccessUrl(successUrl)
                .setCancelUrl(cancelUrl)
                .setAllowPromotionCodes(true)
                .addLineItem(LineItem.builder().setPrice(priceId).setQuantity(1L).build())
                // Tagged so the webhook can tell our purchases from another app's on the same Stripe
                // account (the session), and so the subscription it creates carries the tag too.
                .putMetadata("app", StripeWebhookEvent.KIWIPLY)
                .setSubscriptionData(
                    com.stripe.param.checkout.SessionCreateParams.SubscriptionData.builder()
                        .putMetadata("app", StripeWebhookEvent.KIWIPLY)
                        .build()
                );

            Boolean managedPayments = props.getManagedPayments();

            // Tax: send `true`, or send nothing at all. NEVER `false` — see #wantsAutomaticTax.
            if (wantsAutomaticTax(props.isAutomaticTax(), Boolean.TRUE.equals(managedPayments))) {
                builder.setAutomaticTax(com.stripe.param.checkout.SessionCreateParams.AutomaticTax.builder().setEnabled(true).build());
            }

            // Managed Payments (merchant of record) is newer than this SDK's typed builders, so
            // it goes through extra params. That also insulates us from the shape changing before
            // the typed API catches up — the setting is what matters, not how it is spelled.
            // Null means "don't mention it", which leaves the account's own default in force.
            if (managedPayments != null) {
                builder.putExtraParam("managed_payments[enabled]", managedPayments);
            }

            return require().checkout().sessions().create(builder.build()).getUrl();
        } catch (StripeException e) {
            throw new StripeGatewayException("Could not start Stripe checkout", e);
        }
    }

    /**
     * Whether to send {@code automatic_tax[enabled]=true} on a Checkout Session. When this is
     * false the parameter is <b>omitted entirely</b> rather than sent as {@code false}.
     *
     * <p>That distinction is the whole point. Stripe enables <b>Managed Payments by default on
     * new accounts</b>, and a Managed Payments account rejects an explicit
     * {@code automatic_tax[enabled]=false}: <i>"Managed Payments handles taxes for you … omit
     * this parameter or pass automatic_tax[enabled]=true"</i>. We used to send it unconditionally,
     * which meant our default configuration was invalid against a default Stripe account — every
     * checkout failed with a 502 (found during the 12.7 sandbox run, 2026-09-21).
     *
     * <p>Omitting lets the account's own setting decide, so all three cases work: Managed
     * Payments on (Stripe handles tax), Stripe Tax configured and wanted (we ask for it), and
     * neither (Stripe's default, off).
     */
    static boolean wantsAutomaticTax(boolean automaticTax, boolean managedPayments) {
        // Managed Payments *requires* automatic tax, so asking for one asks for both.
        return automaticTax || managedPayments;
    }

    /**
     * {@inheritDoc}
     *
     * <p>Asks Stripe for this customer's subscriptions and reports whether any is live. Stripe's
     * {@code status=all} is deliberate: {@code active} alone would miss {@code past_due} and
     * {@code trialing}, both of which are subscriptions the customer is still in — starting a
     * second one would bill them twice.
     */
    @Override
    public boolean hasLiveSubscription(String customerId) {
        if (client == null || customerId == null || customerId.isBlank()) return false;
        try {
            com.stripe.param.SubscriptionListParams params = com.stripe.param.SubscriptionListParams.builder()
                .setCustomer(customerId)
                .setStatus(com.stripe.param.SubscriptionListParams.Status.ALL)
                .setLimit(20L)
                .build();
            return require()
                .subscriptions()
                .list(params)
                .getData()
                .stream()
                .anyMatch(sub -> LIVE_SUBSCRIPTION_STATUSES.contains(String.valueOf(sub.getStatus()).toLowerCase()));
        } catch (StripeException e) {
            throw new StripeGatewayException("Could not list the customer's subscriptions", e);
        }
    }

    @Override
    public void cancelSubscription(String subscriptionId) {
        if (subscriptionId == null || subscriptionId.isBlank()) return;
        try {
            require().subscriptions().cancel(subscriptionId);
        } catch (com.stripe.exception.InvalidRequestException e) {
            // Already cancelled, or no longer exists. Either way it is not billing anyone, which
            // is the outcome this call is for.
            LOG.info("Subscription {} was not cancellable ({}); treating as already ended", subscriptionId, e.getCode());
        } catch (StripeException e) {
            throw new StripeGatewayException("Could not cancel subscription " + subscriptionId, e);
        }
    }

    /** Statuses that mean "this customer is already subscribed" for the purposes of the guard. */
    private static final java.util.Set<String> LIVE_SUBSCRIPTION_STATUSES = java.util.Set.of("active", "trialing", "past_due", "unpaid");

    @Override
    public String createPortalSession(String customerId, String returnUrl) {
        try {
            SessionCreateParams params = SessionCreateParams.builder().setCustomer(customerId).setReturnUrl(returnUrl).build();
            return require().billingPortal().sessions().create(params).getUrl();
        } catch (StripeException e) {
            throw new StripeGatewayException("Could not open the Stripe billing portal", e);
        }
    }

    @Override
    public StripeWebhookEvent constructEvent(String payload, String signatureHeader) {
        if (props.getWebhookSecret() == null || props.getWebhookSecret().isBlank()) {
            throw new StripeGatewayException("No webhook secret configured");
        }
        Event event;
        try {
            event = Webhook.constructEvent(payload, signatureHeader, props.getWebhookSecret());
        } catch (SignatureVerificationException e) {
            // The only thing between this endpoint and anyone on the internet. Caller must
            // reject and record nothing.
            throw new StripeGatewayException("Invalid Stripe signature", e);
        }
        return toWebhookEvent(event);
    }

    /**
     * Get the event's embedded object, tolerating API-version drift.
     *
     * <p>{@code getObject()} returns empty — or, for an event with no {@code api_version} at all,
     * throws — whenever the version Stripe sent doesn't match the one this SDK was built for.
     * That is not an edge case: the API version is set in the Stripe dashboard and moves
     * independently of our dependency, so a routine upgrade on either side would otherwise make
     * every webhook silently stop carrying state. {@code deserializeUnsafe()} is Stripe's own
     * answer for this, and is safe for our use because we only read a handful of stable fields.
     */
    private static Optional<StripeObject> dataObject(Event event) {
        EventDataObjectDeserializer deserializer = event.getDataObjectDeserializer();
        try {
            Optional<StripeObject> strict = deserializer.getObject();
            if (strict.isPresent()) return strict;
        } catch (RuntimeException e) {
            LOG.debug("Strict deserialization of event {} failed; falling back", event.getId());
        }
        try {
            return Optional.ofNullable(deserializer.deserializeUnsafe());
        } catch (Exception e) {
            LOG.warn("Could not deserialize the object on Stripe event {} ({})", event.getId(), event.getType());
            return Optional.empty();
        }
    }

    /** Flatten the SDK event into the handful of fields the handler depends on. */
    private StripeWebhookEvent toWebhookEvent(Event event) {
        var deserialized = dataObject(event);
        String objectType = null;
        String customerId = null;
        String subscriptionId = null;
        String status = null;
        String priceId = null;
        Instant periodEnd = null;
        Boolean cancelAtPeriodEnd = null;
        String clientReferenceId = null;
        String app = null;
        Long amountCents = null;
        String currency = null;
        Instant periodStart = null;
        java.util.Map<String, String> metadata = null;
        java.util.List<StripeWebhookEvent.Item> items = java.util.List.of();
        StripeWebhookEvent.InvoiceInfo invoiceInfo = null;
        String scheduleId = null;
        StripeWebhookEvent.DiscountInfo discountInfo = null;
        String paymentIntentId = null;

        if (deserialized.isPresent()) {
            var obj = deserialized.get();
            if (obj instanceof Subscription sub) {
                objectType = "subscription";
                customerId = sub.getCustomer();
                subscriptionId = sub.getId();
                status = sub.getStatus();
                cancelAtPeriodEnd = sub.getCancelAtPeriodEnd();
                priceId = firstPriceId(sub);
                periodEnd = periodEndOf(sub);
                app = sub.getMetadata() == null ? null : sub.getMetadata().get("app");
                metadata = sub.getMetadata();
                periodStart = periodStartOf(sub);
                items = itemsOf(sub);
                scheduleId = sub.getSchedule();
            } else if (obj instanceof Session session) {
                objectType = "checkout.session";
                customerId = session.getCustomer();
                subscriptionId = session.getSubscription();
                clientReferenceId = session.getClientReferenceId();
                app = session.getMetadata() == null ? null : session.getMetadata().get("app");
                metadata = session.getMetadata();
            } else if (obj instanceof com.stripe.model.SubscriptionSchedule schedule) {
                objectType = "subscription_schedule";
                customerId = schedule.getCustomer();
                subscriptionId = schedule.getSubscription();
                status = schedule.getStatus();
                scheduleId = schedule.getId();
                metadata = schedule.getMetadata();
                app = metadata == null ? null : metadata.get("app");
            } else if (obj instanceof com.stripe.model.Discount discount) {
                objectType = "discount";
                customerId = discount.getCustomer();
                subscriptionId = discount.getSubscription();
                var coupon = discount.getCoupon();
                discountInfo = new StripeWebhookEvent.DiscountInfo(
                    coupon == null ? null : coupon.getId(),
                    coupon == null ? null : coupon.getAmountOff(),
                    coupon == null || coupon.getPercentOff() == null ? null : coupon.getPercentOff().longValue()
                );
            } else if (obj instanceof com.stripe.model.Invoice invoice) {
                objectType = "invoice";
                customerId = invoice.getCustomer();
                // What it was worth, for the admin timeline and "total paid" (9.C1).
                amountCents = "invoice.paid".equals(event.getType()) ? invoice.getAmountPaid() : invoice.getAmountDue();
                currency = invoice.getCurrency();
                var summary = toSummary(invoice);
                subscriptionId = summary.subscriptionId();
                invoiceInfo = new StripeWebhookEvent.InvoiceInfo(
                    summary.id(),
                    summary.number(),
                    summary.status(),
                    summary.currency(),
                    summary.amountDueMinor(),
                    summary.amountPaidMinor(),
                    summary.periodStart(),
                    summary.periodEnd(),
                    summary.dueAt(),
                    summary.paidAt(),
                    summary.hostedUrl(),
                    summary.pdfUrl(),
                    summary.lines().stream().map(l -> new StripeWebhookEvent.InvoiceLineInfo(l.priceId(), l.quantity(), l.amountMinor(), l.description(), l.periodStart(), l.periodEnd(), l.proration())).toList()
                );
                if (invoice.getParent() != null && invoice.getParent().getSubscriptionDetails() != null) {
                    metadata = invoice.getParent().getSubscriptionDetails().getMetadata();
                    app = metadata == null ? null : metadata.get("app");
                }
            }
        }
        String scope = metadata == null ? null : metadata.get("kiwiply_scope");
        Long orgId = null;
        try {
            String raw = metadata == null ? null : metadata.get("org_id");
            if (raw != null && !raw.isBlank()) orgId = Long.valueOf(raw.trim());
        } catch (NumberFormatException ignored) {
            // A malformed org_id is treated as absent; the scope router then falls back on the customer lookup.
        }
        String quoteId = metadata == null ? null : metadata.get("quote_id");

        return new StripeWebhookEvent(
            event.getId(),
            event.getType(),
            event.getCreated() == null ? Instant.now() : Instant.ofEpochSecond(event.getCreated()),
            objectType,
            customerId,
            subscriptionId,
            status,
            priceId,
            periodEnd,
            cancelAtPeriodEnd,
            clientReferenceId,
            amountCents,
            currency,
            app,
            periodStart,
            scope,
            orgId,
            quoteId,
            items,
            invoiceInfo,
            scheduleId,
            discountInfo,
            paymentIntentId
        );
    }

    private static java.util.List<StripeWebhookEvent.Item> itemsOf(Subscription sub) {
        if (sub.getItems() == null || sub.getItems().getData() == null) return java.util.List.of();
        return sub
            .getItems()
            .getData()
            .stream()
            .map(i -> new StripeWebhookEvent.Item(i.getId(), i.getPrice() == null ? null : i.getPrice().getId(), i.getQuantity() == null ? 1L : i.getQuantity()))
            .toList();
    }

    private static Instant periodStartOf(Subscription sub) {
        if (sub.getItems() == null || sub.getItems().getData() == null || sub.getItems().getData().isEmpty()) return null;
        Long start = sub.getItems().getData().get(0).getCurrentPeriodStart();
        return start == null ? null : Instant.ofEpochSecond(start);
    }

    private static String firstPriceId(Subscription sub) {
        if (sub.getItems() == null || sub.getItems().getData() == null || sub.getItems().getData().isEmpty()) return null;
        var item = sub.getItems().getData().get(0);
        return item.getPrice() == null ? null : item.getPrice().getId();
    }

    /**
     * End of the paid-for period.
     *
     * <p>Stripe moved this from the subscription onto its items in the 2025-03-31 API version,
     * so it is read from the first item. Null when absent rather than guessed — and null means
     * "lapsed" to {@code EntitlementService}, so a missing period end can only ever cost Pro,
     * never grant it.
     */
    private static Instant periodEndOf(Subscription sub) {
        if (sub.getItems() == null || sub.getItems().getData() == null || sub.getItems().getData().isEmpty()) return null;
        Long end = sub.getItems().getData().get(0).getCurrentPeriodEnd();
        return end == null ? null : Instant.ofEpochSecond(end);
    }

    // ------------------------------------------------------------------------------------------------------------------
    // K8.2: the plan-layer operations (docs/subscriptions/07 s2). All go through write(...) / read(...), which refuse when billing is
    // off, attach the idempotency key and the retry policy, and map Stripe's exceptions to StripeGatewayException.Kind.
    // ------------------------------------------------------------------------------------------------------------------

    /** Network errors and 429s are retried by the SDK this many times (safe: every write carries an idempotency key; reads are idempotent). */
    static final int MAX_NETWORK_RETRIES = 2;

    @FunctionalInterface
    private interface StripeCall<T> {
        T run(StripeClient c, RequestOptions o) throws StripeException;
    }

    /** A write: key mandatory, retries on. */
    private <T> T write(String what, IdempotencyKey key, StripeCall<T> call) {
        if (key == null) throw new IllegalArgumentException("An idempotency key is required for " + what);
        StripeClient c = require();
        try {
            return call.run(c, RequestOptions.builder().setIdempotencyKey(key.value()).setMaxNetworkRetries(MAX_NETWORK_RETRIES).build());
        } catch (StripeException e) {
            throw map("Could not " + what, e);
        }
    }

    /** A read: no key, retries on. */
    private <T> T read(String what, StripeCall<T> call) {
        StripeClient c = require();
        try {
            return call.run(c, RequestOptions.builder().setMaxNetworkRetries(MAX_NETWORK_RETRIES).build());
        } catch (StripeException e) {
            throw map("Could not " + what, e);
        }
    }

    /** Stripe's exceptions to our coarse kinds. The message never carries the request, key or card data. */
    static StripeGatewayException map(String message, StripeException e) {
        StripeGatewayException.Kind kind;
        if (e instanceof com.stripe.exception.RateLimitException) kind = StripeGatewayException.Kind.RATE_LIMITED;
        else if (e instanceof com.stripe.exception.ApiConnectionException) kind = StripeGatewayException.Kind.CONNECTION;
        else if (e instanceof com.stripe.exception.CardException) kind = StripeGatewayException.Kind.CARD_DECLINED;
        else if (e instanceof com.stripe.exception.AuthenticationException) kind = StripeGatewayException.Kind.AUTHENTICATION;
        else if (e instanceof com.stripe.exception.PermissionException) kind = StripeGatewayException.Kind.PERMISSION;
        else if (e instanceof com.stripe.exception.IdempotencyException) kind = StripeGatewayException.Kind.IDEMPOTENCY_CONFLICT;
        else if (e instanceof com.stripe.exception.InvalidRequestException) {
            kind = "idempotency_key_in_use".equals(e.getCode()) ? StripeGatewayException.Kind.IDEMPOTENCY_CONFLICT : StripeGatewayException.Kind.INVALID_REQUEST;
        } else if (e instanceof com.stripe.exception.ApiException) kind = StripeGatewayException.Kind.SERVER;
        else kind = StripeGatewayException.Kind.OTHER;
        return new StripeGatewayException(message, kind, e.getCode(), e);
    }

    private static java.util.Map<String, String> withApp(java.util.Map<String, String> md) {
        java.util.Map<String, String> out = new java.util.LinkedHashMap<>(md == null ? java.util.Map.of() : md);
        out.put("app", StripeWebhookEvent.KIWIPLY);
        return out;
    }

    @Override
    public String createCheckoutSession(CheckoutSpec spec, IdempotencyKey key) {
        return write("start Stripe checkout", key, (c, o) -> {
            var builder = com.stripe.param.checkout.SessionCreateParams.builder()
                .setMode(Mode.SUBSCRIPTION)
                .setCustomer(spec.customerId())
                .setSuccessUrl(spec.successUrl())
                .setCancelUrl(spec.cancelUrl())
                .setAllowPromotionCodes(spec.allowPromotionCodes());
            if (spec.userId() != null) builder.setClientReferenceId(String.valueOf(spec.userId()));
            for (ItemQuantity l : spec.lines()) builder.addLineItem(LineItem.builder().setPrice(l.priceId()).setQuantity(l.quantity()).build());
            var md = withApp(spec.metadata());
            builder.putAllMetadata(md);
            builder.setSubscriptionData(com.stripe.param.checkout.SessionCreateParams.SubscriptionData.builder().putAllMetadata(md).build());
            if (spec.consentText() != null && !spec.consentText().isBlank()) {
                builder.setCustomText(
                    com.stripe.param.checkout.SessionCreateParams.CustomText.builder()
                        .setSubmit(com.stripe.param.checkout.SessionCreateParams.CustomText.Submit.builder().setMessage(spec.consentText()).build())
                        .build()
                );
            }
            Boolean managedPayments = props.getManagedPayments();
            if (wantsAutomaticTax(props.isAutomaticTax(), Boolean.TRUE.equals(managedPayments))) {
                builder.setAutomaticTax(com.stripe.param.checkout.SessionCreateParams.AutomaticTax.builder().setEnabled(true).build());
            }
            if (managedPayments != null) builder.putExtraParam("managed_payments[enabled]", managedPayments);
            return c.checkout().sessions().create(builder.build(), o).getUrl();
        });
    }

    /** One planned change to a subscription's items. */
    private record ItemOp(String itemId, String priceId, long quantity, boolean delete) {}

    /** Diff the live items against the target set: update/delete what exists, add what does not. */
    private static java.util.List<ItemOp> diffItems(Subscription current, java.util.List<ItemQuantity> target) {
        java.util.Map<String, Long> want = new java.util.LinkedHashMap<>();
        for (ItemQuantity t : target) want.merge(t.priceId(), t.quantity(), Long::sum);
        java.util.List<ItemOp> ops = new java.util.ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        if (current.getItems() != null && current.getItems().getData() != null) {
            for (var item : current.getItems().getData()) {
                String price = item.getPrice() == null ? null : item.getPrice().getId();
                Long q = price == null ? null : want.get(price);
                if (q == null || q == 0L) ops.add(new ItemOp(item.getId(), price, 0, true));
                else {
                    seen.add(price);
                    ops.add(new ItemOp(item.getId(), price, q, false));
                }
            }
        }
        for (var e : want.entrySet()) {
            if (!seen.contains(e.getKey()) && e.getValue() > 0) ops.add(new ItemOp(null, e.getKey(), e.getValue(), false));
        }
        return ops;
    }

    @Override
    public void setSubscriptionItems(String subscriptionId, java.util.List<ItemQuantity> items, IdempotencyKey key) {
        write("update the subscription items", key, (c, o) -> {
            Subscription current = c.subscriptions().retrieve(subscriptionId, RequestOptions.builder().setMaxNetworkRetries(MAX_NETWORK_RETRIES).build());
            var params = com.stripe.param.SubscriptionUpdateParams.builder().setProrationBehavior(com.stripe.param.SubscriptionUpdateParams.ProrationBehavior.NONE);
            for (ItemOp op : diffItems(current, items)) {
                var item = com.stripe.param.SubscriptionUpdateParams.Item.builder();
                if (op.itemId() != null) item.setId(op.itemId());
                if (op.delete()) item.setDeleted(true);
                else {
                    if (op.itemId() == null) item.setPrice(op.priceId());
                    item.setQuantity(op.quantity());
                }
                params.addItem(item.build());
            }
            c.subscriptions().update(subscriptionId, params.build(), o);
            return null;
        });
    }

    @Override
    public void setCancelAtPeriodEnd(String subscriptionId, boolean cancel, IdempotencyKey key) {
        write("change cancel-at-period-end", key, (c, o) -> {
            c.subscriptions().update(subscriptionId, com.stripe.param.SubscriptionUpdateParams.builder().setCancelAtPeriodEnd(cancel).build(), o);
            return null;
        });
    }

    @Override
    public String createInvoiceItem(
        String customerId,
        long amountMinor,
        String currency,
        String description,
        Period period,
        java.util.Map<String, String> metadata,
        IdempotencyKey key
    ) {
        return write("create the invoice item", key, (c, o) -> {
            var b = com.stripe.param.InvoiceItemCreateParams.builder()
                .setCustomer(customerId)
                .setAmount(amountMinor)
                .setCurrency(currency == null ? null : currency.toLowerCase())
                .setDescription(description)
                .putAllMetadata(withApp(metadata));
            if (period != null && period.start() != null && period.end() != null) {
                b.setPeriod(
                    com.stripe.param.InvoiceItemCreateParams.Period.builder()
                        .setStart(period.start().getEpochSecond())
                        .setEnd(period.end().getEpochSecond())
                        .build()
                );
            }
            return c.invoiceItems().create(b.build(), o).getId();
        });
    }

    @Override
    public String createSchedule(String subscriptionId, java.util.List<ItemQuantity> phaseItems, java.time.Instant at, IdempotencyKey key) {
        if (phaseItems == null || phaseItems.isEmpty() || at == null) throw new IllegalArgumentException("a schedule needs phase items and a switch instant");
        return write("schedule the change", key, (c, o) -> {
            var schedule = c.subscriptionSchedules().create(com.stripe.param.SubscriptionScheduleCreateParams.builder().setFromSubscription(subscriptionId).build(), o);
            // The schedule starts with one phase mirroring the live subscription; keep it until `at`, then switch.
            var first = schedule.getPhases() == null || schedule.getPhases().isEmpty() ? null : schedule.getPhases().get(0);
            var update = com.stripe.param.SubscriptionScheduleUpdateParams.builder()
                .setProrationBehavior(com.stripe.param.SubscriptionScheduleUpdateParams.ProrationBehavior.NONE)
                .setEndBehavior(com.stripe.param.SubscriptionScheduleUpdateParams.EndBehavior.RELEASE);
            var phase1 = com.stripe.param.SubscriptionScheduleUpdateParams.Phase.builder().setEndDate(at.getEpochSecond());
            if (first != null) {
                if (first.getStartDate() != null) phase1.setStartDate(first.getStartDate());
                if (first.getItems() != null) {
                    for (var it : first.getItems()) {
                        String price = it.getPrice();
                        if (price != null) {
                            phase1.addItem(
                                com.stripe.param.SubscriptionScheduleUpdateParams.Phase.Item.builder().setPrice(price).setQuantity(it.getQuantity() == null ? 1L : it.getQuantity()).build()
                            );
                        }
                    }
                }
            }
            var phase2 = com.stripe.param.SubscriptionScheduleUpdateParams.Phase.builder().setStartDate(at.getEpochSecond());
            for (ItemQuantity q : phaseItems) {
                phase2.addItem(com.stripe.param.SubscriptionScheduleUpdateParams.Phase.Item.builder().setPrice(q.priceId()).setQuantity(q.quantity()).build());
            }
            update.addPhase(phase1.build()).addPhase(phase2.build());
            RequestOptions second = o.toBuilder().setIdempotencyKey(key.child("phases").value()).build();
            c.subscriptionSchedules().update(schedule.getId(), update.build(), second);
            return schedule.getId();
        });
    }

    @Override
    public void releaseSchedule(String scheduleId, IdempotencyKey key) {
        write("release the schedule", key, (c, o) -> {
            c.subscriptionSchedules().release(scheduleId, o);
            return null;
        });
    }

    @Override
    public String createSubscription(String customerId, java.util.List<ItemQuantity> items, java.time.Instant startBillingAt, java.util.Map<String, String> metadata, IdempotencyKey key) {
        return write("create the subscription", key, (c, o) -> {
            var b = com.stripe.param.SubscriptionCreateParams.builder().setCustomer(customerId).putAllMetadata(withApp(metadata));
            for (ItemQuantity q : items) {
                b.addItem(com.stripe.param.SubscriptionCreateParams.Item.builder().setPrice(q.priceId()).setQuantity(q.quantity()).build());
            }
            if (startBillingAt != null) {
                // Billing starts at that instant; this is the Stripe mechanism for it, not a free trial (07 s2.3).
                b.setBillingCycleAnchor(startBillingAt.getEpochSecond());
                b.setTrialEnd(startBillingAt.getEpochSecond());
                b.setProrationBehavior(com.stripe.param.SubscriptionCreateParams.ProrationBehavior.NONE);
            }
            return c.subscriptions().create(b.build(), o).getId();
        });
    }

    @Override
    public UpcomingInvoicePreview previewUpcomingInvoice(String customerId, String subscriptionId, java.util.List<ItemQuantity> proposed, String couponId) {
        return read("preview the upcoming invoice", (c, o) -> {
            var b = com.stripe.param.InvoiceCreatePreviewParams.builder().setCustomer(customerId);
            if (subscriptionId != null) b.setSubscription(subscriptionId);
            if (subscriptionId != null && proposed != null) {
                Subscription current = c.subscriptions().retrieve(subscriptionId, o);
                var details = com.stripe.param.InvoiceCreatePreviewParams.SubscriptionDetails.builder()
                    .setProrationBehavior(com.stripe.param.InvoiceCreatePreviewParams.SubscriptionDetails.ProrationBehavior.NONE);
                for (ItemOp op : diffItems(current, proposed)) {
                    var item = com.stripe.param.InvoiceCreatePreviewParams.SubscriptionDetails.Item.builder();
                    if (op.itemId() != null) item.setId(op.itemId());
                    if (op.delete()) item.setDeleted(true);
                    else {
                        if (op.itemId() == null) item.setPrice(op.priceId());
                        item.setQuantity(op.quantity());
                    }
                    details.addItem(item.build());
                }
                b.setSubscriptionDetails(details.build());
            }
            if (couponId != null && !couponId.isBlank()) {
                b.addDiscount(com.stripe.param.InvoiceCreatePreviewParams.Discount.builder().setCoupon(couponId).build());
            }
            com.stripe.model.Invoice inv = c.invoices().createPreview(b.build(), o);
            long subtotal = nz(inv.getSubtotal());
            long total = nz(inv.getTotal());
            long excl = inv.getTotalExcludingTax() == null ? total : inv.getTotalExcludingTax();
            return new UpcomingInvoicePreview(subtotal, total - excl, total, inv.getCurrency(), toLines(inv));
        });
    }

    @Override
    public java.util.List<InvoiceSummary> listInvoices(String customerId, int limit, String startingAfter) {
        return read("list invoices", (c, o) -> {
            var b = com.stripe.param.InvoiceListParams.builder().setCustomer(customerId).setLimit((long) Math.max(1, Math.min(limit, 100)));
            if (startingAfter != null && !startingAfter.isBlank()) b.setStartingAfter(startingAfter);
            return c.invoices().list(b.build(), o).getData().stream().map(StripeGatewayImpl::toSummary).toList();
        });
    }

    @Override
    public InvoiceSummary retrieveInvoice(String invoiceId) {
        return read("retrieve the invoice", (c, o) -> toSummary(c.invoices().retrieve(invoiceId, o)));
    }

    @Override
    public String createProduct(ProductSpec spec, IdempotencyKey key) {
        return write("create the product", key, (c, o) -> {
            var md = withApp(spec.metadata());
            md.put("product_code", spec.code());
            var b = com.stripe.param.ProductCreateParams.builder().setName(spec.name()).putAllMetadata(md);
            if (spec.description() != null && !spec.description().isBlank()) b.setDescription(spec.description());
            return c.products().create(b.build(), o).getId();
        });
    }

    @Override
    public String createPrice(PriceSpec spec, IdempotencyKey key) {
        return write("create the price", key, (c, o) -> {
            var b = com.stripe.param.PriceCreateParams.builder()
                .setProduct(spec.productId())
                .setCurrency(spec.currency().toLowerCase())
                .setUnitAmount(spec.unitAmountMinor())
                .putAllMetadata(withApp(spec.metadata()));
            if (spec.nickname() != null && !spec.nickname().isBlank()) b.setNickname(spec.nickname());
            if (spec.interval().isRecurring()) {
                b.setRecurring(
                    com.stripe.param.PriceCreateParams.Recurring.builder()
                        .setInterval(com.stripe.param.PriceCreateParams.Recurring.Interval.MONTH)
                        .setIntervalCount((long) spec.interval().intervalCount())
                        .build()
                );
            }
            return c.prices().create(b.build(), o).getId();
        });
    }

    @Override
    public void deactivatePrice(String priceId, IdempotencyKey key) {
        write("deactivate the price", key, (c, o) -> {
            c.prices().update(priceId, com.stripe.param.PriceUpdateParams.builder().setActive(false).build(), o);
            return null;
        });
    }

    @Override
    public java.util.List<StripePriceInfo> listPrices(int max) {
        int cap = Math.max(1, Math.min(max, 5000));
        return read("list prices", (c, o) -> {
            java.util.List<StripePriceInfo> out = new java.util.ArrayList<>();
            String after = null;
            while (out.size() < cap) {
                var b = com.stripe.param.PriceListParams.builder().setLimit(100L);
                if (after != null) b.setStartingAfter(after);
                com.stripe.model.StripeCollection<com.stripe.model.Price> page = c.prices().list(b.build(), o);
                java.util.List<com.stripe.model.Price> data = page.getData();
                if (data == null || data.isEmpty()) break;
                for (com.stripe.model.Price p : data) {
                    after = p.getId();
                    java.util.Map<String, String> md = p.getMetadata();
                    if (md == null || !"kiwiply".equals(md.get("app"))) continue;
                    out.add(new StripePriceInfo(p.getId(), p.getProduct(), p.getCurrency() == null ? null : p.getCurrency().toUpperCase(), nz(p.getUnitAmount()), Boolean.TRUE.equals(p.getActive()), intervalOf(p), md));
                    if (out.size() >= cap) break;
                }
                if (!Boolean.TRUE.equals(page.getHasMore())) break;
            }
            return out;
        });
    }

    private static PriceInterval intervalOf(com.stripe.model.Price p) {
        com.stripe.model.Price.Recurring r = p.getRecurring();
        if (r == null) return PriceInterval.ONE_TIME;
        long months = "year".equals(r.getInterval()) ? 12L * nz(r.getIntervalCount() == null ? 1L : r.getIntervalCount()) : nz(r.getIntervalCount() == null ? 1L : r.getIntervalCount());
        if (months == 12) return PriceInterval.YEAR;
        if (months == 3) return PriceInterval.QUARTER;
        return PriceInterval.MONTH;
    }

    private void requireTestMode() {
        String k = props.getSecretKey();
        if (k != null && k.trim().contains("_live_")) {
            throw new StripeGatewayException("Test clocks are refused with a live Stripe key", StripeGatewayException.Kind.NOT_ENABLED, null, null);
        }
    }

    @Override
    public String createTestClock(java.time.Instant frozenAt, IdempotencyKey key) {
        require();
        requireTestMode();
        return write("create the test clock", key, (c, o) ->
            c.testHelpers().testClocks().create(com.stripe.param.testhelpers.TestClockCreateParams.builder().setFrozenTime(frozenAt.getEpochSecond()).build(), o).getId()
        );
    }

    @Override
    public void advanceTestClock(String clockId, java.time.Instant to, IdempotencyKey key) {
        require();
        requireTestMode();
        write("advance the test clock", key, (c, o) -> {
            c.testHelpers().testClocks().advance(clockId, com.stripe.param.testhelpers.TestClockAdvanceParams.builder().setFrozenTime(to.getEpochSecond()).build(), o);
            return null;
        });
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }

    private static Instant ts(Long epoch) {
        return epoch == null ? null : Instant.ofEpochSecond(epoch);
    }

    private static java.util.List<InvoiceLine> toLines(com.stripe.model.Invoice inv) {
        if (inv.getLines() == null || inv.getLines().getData() == null) return java.util.List.of();
        return inv
            .getLines()
            .getData()
            .stream()
            .map(l -> {
                String price = l.getPricing() == null || l.getPricing().getPriceDetails() == null ? null : l.getPricing().getPriceDetails().getPrice();
                boolean proration = l.getParent() != null && l.getParent().getSubscriptionItemDetails() != null && Boolean.TRUE.equals(l.getParent().getSubscriptionItemDetails().getProration());
                return new InvoiceLine(
                    price,
                    l.getQuantity() == null ? 1L : l.getQuantity(),
                    nz(l.getAmount()),
                    l.getDescription(),
                    l.getPeriod() == null ? null : ts(l.getPeriod().getStart()),
                    l.getPeriod() == null ? null : ts(l.getPeriod().getEnd()),
                    proration
                );
            })
            .toList();
    }

    private static InvoiceSummary toSummary(com.stripe.model.Invoice inv) {
        String sub = inv.getParent() == null || inv.getParent().getSubscriptionDetails() == null ? null : inv.getParent().getSubscriptionDetails().getSubscription();
        return new InvoiceSummary(
            inv.getId(),
            inv.getNumber(),
            inv.getStatus(),
            inv.getCurrency(),
            nz(inv.getAmountDue()),
            nz(inv.getAmountPaid()),
            ts(inv.getPeriodStart()),
            ts(inv.getPeriodEnd()),
            ts(inv.getDueDate()),
            inv.getStatusTransitions() == null ? null : ts(inv.getStatusTransitions().getPaidAt()),
            inv.getHostedInvoiceUrl(),
            inv.getInvoicePdf(),
            sub,
            toLines(inv)
        );
    }
}
