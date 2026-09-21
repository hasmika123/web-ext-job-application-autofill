package com.dossier.api.service.billing;

import com.stripe.StripeClient;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.exception.StripeException;
import com.stripe.model.Event;
import com.stripe.model.Subscription;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
import com.stripe.param.CustomerCreateParams;
import com.stripe.param.billingportal.SessionCreateParams;
import com.stripe.param.checkout.SessionCreateParams.LineItem;
import com.stripe.param.checkout.SessionCreateParams.Mode;
import java.time.Instant;
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
            com.stripe.param.checkout.SessionCreateParams params = com.stripe.param.checkout.SessionCreateParams.builder()
                .setMode(Mode.SUBSCRIPTION)
                .setCustomer(customerId)
                // How the webhook binds this customer back to our user. The return URL is never
                // trusted for that — it can be skipped, replayed or forged.
                .setClientReferenceId(String.valueOf(userId))
                .setSuccessUrl(successUrl)
                .setCancelUrl(cancelUrl)
                .setAllowPromotionCodes(true)
                .setAutomaticTax(
                    com.stripe.param.checkout.SessionCreateParams.AutomaticTax.builder().setEnabled(true).build()
                )
                .addLineItem(LineItem.builder().setPrice(priceId).setQuantity(1L).build())
                .build();
            return require().checkout().sessions().create(params).getUrl();
        } catch (StripeException e) {
            throw new StripeGatewayException("Could not start Stripe checkout", e);
        }
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

    /** Flatten the SDK event into the handful of fields the handler depends on. */
    private StripeWebhookEvent toWebhookEvent(Event event) {
        var deserialized = event.getDataObjectDeserializer().getObject();
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
