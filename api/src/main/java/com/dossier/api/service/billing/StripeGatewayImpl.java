package com.dossier.api.service.billing;

import com.stripe.StripeClient;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.exception.StripeException;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.StripeObject;
import com.stripe.model.Subscription;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
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

    public StripeGatewayImpl(StripeProperties props) {
        this.props = props;
        // Built once; null when billing is off so nothing can accidentally call out.
        this.client = props.isEnabled() ? new StripeClient(props.getSecretKey()) : null;
        if (client == null) {
            LOG.info("Stripe is not configured (dossier.stripe.secret-key is blank) — billing is disabled.");
        }
    }

    @Override
    public boolean isEnabled() {
        return client != null;
    }

    private StripeClient require() {
        if (client == null) throw new StripeGatewayException("Stripe is not configured");
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
                .addLineItem(LineItem.builder().setPrice(priceId).setQuantity(1L).build());

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
            } else if (obj instanceof Session session) {
                objectType = "checkout.session";
                customerId = session.getCustomer();
                subscriptionId = session.getSubscription();
                clientReferenceId = session.getClientReferenceId();
            } else if (obj instanceof com.stripe.model.Invoice invoice) {
                objectType = "invoice";
                customerId = invoice.getCustomer();
            }
        }

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
            clientReferenceId
        );
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
}
