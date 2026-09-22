package com.dossier.api.service;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.billing.StripeProperties;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Starting a checkout and opening the billing portal (Phase 12.3).
 *
 * <p>Note what this class does <b>not</b> do: it never marks anyone Pro. Creating a Checkout
 * Session only sends the user to Stripe; the subscription mirror is written exclusively by the
 * webhook ({@code BillingWebhookService}), because a return URL can be skipped, replayed or
 * forged. The only thing stored here is the Stripe customer id, which is identity rather than
 * entitlement.
 */
@Service
@Transactional
public class BillingService {

    private static final Logger LOG = LoggerFactory.getLogger(BillingService.class);

    /** The two plans we sell. Anything else is rejected rather than guessed at. */
    public static final String PLAN_MONTHLY = "monthly";
    public static final String PLAN_3MO = "3mo";

    private final SubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;
    private final EntitlementService entitlementService;
    private final StripeGateway stripeGateway;
    private final StripeProperties props;

    public BillingService(
        SubscriptionRepository subscriptionRepository,
        UserRepository userRepository,
        EntitlementService entitlementService,
        StripeGateway stripeGateway,
        StripeProperties props
    ) {
        this.subscriptionRepository = subscriptionRepository;
        this.userRepository = userRepository;
        this.entitlementService = entitlementService;
        this.stripeGateway = stripeGateway;
        this.props = props;
    }

    /**
     * Start a hosted Checkout Session for the current user and return the URL to send them to.
     *
     * @param plan {@code monthly} or {@code 3mo}
     */
    public String startCheckout(String plan) {
        requireBillingEnabled();
        User user = currentUser();

        // Already paying: sending them through checkout again would create a second
        // subscription and charge them twice. The portal is where they belong.
        if (entitlementService.isPro(user.getLogin())) {
            throw new BillingException(
                HttpStatus.CONFLICT.value(),
                BillingException.CODE_ALREADY_SUBSCRIBED,
                "You're already on Kiwiply Pro"
            );
        }

        String priceId = priceFor(plan);
        Subscription sub = findOrCreateRow(user);
        String customerId = sub.getStripeCustomerId();

        // The mirror said Free, but the mirror is only as current as the last webhook — and a
        // checkout started while it is behind is exactly how someone ends up paying twice (seen
        // for real during the 12.7 run: one customer, two active subscriptions, two invoices).
        // So when we already know this customer, ask Stripe rather than trusting ourselves.
        // A first-time subscriber has no customer id and skips the call entirely.
        final String knownCustomer = customerId;
        if (knownCustomer != null && stripeBool(() -> stripeGateway.hasLiveSubscription(knownCustomer))) {
            throw new BillingException(
                HttpStatus.CONFLICT.value(),
                BillingException.CODE_ALREADY_SUBSCRIBED,
                "You're already on Kiwiply Pro"
            );
        }

        if (customerId == null) {
            // First checkout for this user. Created once and reused forever after, so their
            // payment history and invoices stay on one Stripe customer.
            customerId = stripe(() -> stripeGateway.createCustomer(user.getEmail(), user.getLogin(), user.getId()));
            sub.setStripeCustomerId(customerId);
            sub.setUpdatedAt(Instant.now());
            subscriptionRepository.save(sub);
            LOG.info("Created Stripe customer {} for {}", customerId, user.getLogin());
        }

        final String cus = customerId;
        return stripe(() -> stripeGateway.createCheckoutSession(cus, priceId, user.getId(), props.getSuccessUrl(), props.getCancelUrl()));
    }

    /**
     * Open the Stripe Billing Portal — where the user updates their card or cancels.
     *
     * <p>Cancelling happens there rather than in a screen we build: it is the click-to-cancel
     * path the FTC rule and California's ARL require, and Stripe keeps it honest.
     */
    public String openPortal() {
        requireBillingEnabled();
        User user = currentUser();
        String customerId = subscriptionRepository
            .findOneByUserId(user.getId())
            .map(Subscription::getStripeCustomerId)
            .orElse(null);
        if (customerId == null) {
            // Never checked out, so there is nothing to manage. A 404 rather than an empty
            // portal, so the client can offer "Upgrade" instead.
            throw new BillingException(
                HttpStatus.NOT_FOUND.value(),
                BillingException.CODE_NO_CUSTOMER,
                "You don't have a billing account yet"
            );
        }
        return stripe(() -> stripeGateway.createPortalSession(customerId, props.getPortalReturnUrl()));
    }

    private void requireBillingEnabled() {
        if (!stripeGateway.isEnabled()) throw BillingException.disabled();
    }

    private String priceFor(String plan) {
        String priceId = switch (plan == null ? "" : plan.trim().toLowerCase()) {
            case PLAN_MONTHLY -> props.getPriceMonthly();
            case PLAN_3MO -> props.getPrice3mo();
            default -> null;
        };
        if (priceId == null || priceId.isBlank()) {
            throw new BillingException(HttpStatus.BAD_REQUEST.value(), BillingException.CODE_UNKNOWN_PRICE, "Unknown plan: " + plan);
        }
        return priceId;
    }

    private Subscription findOrCreateRow(User user) {
        return subscriptionRepository
            .findOneByUserId(user.getId())
            .orElseGet(() -> {
                Subscription fresh = new Subscription();
                fresh.setUser(user);
                fresh.setCreatedAt(Instant.now());
                fresh.setUpdatedAt(Instant.now());
                return subscriptionRepository.save(fresh);
            });
    }

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));
        return userRepository.findOneByLogin(login).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
    }

    /** Turn a gateway failure into a 502 with a code, rather than a 500 with a stack trace. */
    /** {@link #stripe} for a call that answers a boolean. */
    private boolean stripeBool(java.util.function.BooleanSupplier call) {
        try {
            return call.getAsBoolean();
        } catch (StripeGatewayException e) {
            LOG.error("Stripe call failed", e);
            throw new BillingException(HttpStatus.BAD_GATEWAY.value(), BillingException.CODE_STRIPE_ERROR, "Stripe couldn't complete that");
        }
    }

    private String stripe(java.util.function.Supplier<String> call) {
        try {
            return call.get();
        } catch (StripeGatewayException e) {
            LOG.error("Stripe call failed", e);
            throw new BillingException(HttpStatus.BAD_GATEWAY.value(), BillingException.CODE_STRIPE_ERROR, "Stripe couldn't complete that");
        }
    }
}
