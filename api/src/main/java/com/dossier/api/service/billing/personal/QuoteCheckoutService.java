package com.dossier.api.service.billing.personal;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.sub.SubscriptionQuote;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.sub.PriceLookupRepository;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.billing.BillingScopeRouter;
import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.CheckoutSpec;
import com.dossier.api.service.billing.StripeGateway.ItemQuantity;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.billing.StripeProperties;
import com.dossier.api.service.dto.PlanQuoteDTO;
import com.dossier.api.service.dto.PlanQuoteDTO.QuoteLine;
import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Checkout from a quote (docs/subscriptions/07-stripe-mapping.md section 2.1, 09-apis.md section 3.1; story K5.3). The hosted Stripe Checkout gets EXACTLY
 * the quote's lines (catalog price to its Stripe price, with the quote's quantity), the quote id in the metadata (the webhook marks the quote APPLIED) and
 * the key {@code co-{quoteId}} so a second click replays the same session. Like the legacy path it never marks anyone paid: only the webhook does that, and
 * the only thing stored here is the Stripe customer id.
 *
 * <p>{@link #tryCatalogCheckout} is the legacy alias: {@code POST /api/billing/checkout {plan: monthly|3mo}} builds a CHECKOUT quote for the PRO plan at that
 * interval and uses this path when PRO is sellable from the catalog; otherwise it answers empty and the caller keeps using the environment price ids (the
 * catalog ships without prices, so PRO is not sellable until an administrator publishes it).
 */
@Service
public class QuoteCheckoutService {

    private static final Logger LOG = LoggerFactory.getLogger(QuoteCheckoutService.class);

    /** Quote failures that only mean "the catalog cannot sell this yet": the legacy alias falls back to the environment prices. */
    private static final Set<String> NOT_SELLABLE_FROM_CATALOG = Set.of("PLAN_NOT_SELLABLE", "CATALOG_UNAVAILABLE", "PRICE_MISSING", "INTERVAL_NOT_AVAILABLE", "PRICE_NOT_SYNCED");

    private final PersonalQuoteService quotes;
    private final StripeGateway gateway;
    private final StripeProperties props;
    private final SettingsService settings;
    private final UserRepository users;
    private final SubscriptionRepository subscriptions;
    private final PriceLookupRepository prices;
    private final BillingScopeRouter router;

    public QuoteCheckoutService(
        PersonalQuoteService quotes,
        StripeGateway gateway,
        StripeProperties props,
        SettingsService settings,
        UserRepository users,
        SubscriptionRepository subscriptions,
        PriceLookupRepository prices,
        BillingScopeRouter router
    ) {
        this.quotes = quotes;
        this.gateway = gateway;
        this.props = props;
        this.settings = settings;
        this.users = users;
        this.subscriptions = subscriptions;
        this.prices = prices;
        this.router = router;
    }

    /** Start the hosted checkout of an OPEN, fresh CHECKOUT quote of {@code login}; returns the URL. */
    @Transactional(noRollbackFor = BillingException.class)
    public String checkout(Long quoteId, String login, String returnTo) {
        if (!gateway.isEnabled()) throw BillingException.disabled();
        User user = users.findOneByLogin(login).orElseThrow(() -> new BillingException(401, "UNAUTHENTICATED", "Sign in to continue"));
        router.requirePersonal(user);
        SubscriptionQuote q = quotes.owned(quoteId, login);
        if (!PersonalQuoteService.KIND_CHECKOUT.equals(q.getKind())) throw new BillingException(422, "INVALID_KIND", "Only a CHECKOUT quote goes to checkout; a CHANGE quote is confirmed");
        if (!PersonalQuoteService.STATUS_OPEN.equals(q.getStatus())) throw new BillingException(409, "QUOTE_STALE", "This quote was already used", Map.of("reason", "QUOTE_APPLIED"));

        Subscription sub = subscriptions.findOneByUserId(user.getId()).orElseGet(() -> newRow(user));
        if (EntitlementService.isProFor(sub.getStatus(), sub.getCurrentPeriodEnd(), Instant.now())) {
            throw new BillingException(409, BillingException.CODE_ALREADY_SUBSCRIBED, "You're already subscribed");
        }
        String known = sub.getStripeCustomerId();
        if (known != null && liveAtStripe(known)) throw new BillingException(409, BillingException.CODE_ALREADY_SUBSCRIBED, "You're already subscribed");
        quotes.requireFresh(q);

        PlanQuoteDTO dto = quotes.toDto(q);
        List<ItemQuantity> lines = new ArrayList<>();
        for (QuoteLine l : dto.proposed().lines()) {
            ProductPrice p = prices.findById(Long.valueOf(l.priceId())).orElse(null);
            if (p == null || p.getStripePriceId() == null || p.getStripePriceId().isBlank()) {
                throw new BillingException(409, "PRICE_NOT_SYNCED", "This price isn't available for payment yet", Map.of("productCode", String.valueOf(l.productCode())));
            }
            lines.add(new ItemQuantity(p.getStripePriceId(), l.quantity()));
        }

        String customerId = sub.getStripeCustomerId();
        if (customerId == null) {
            // First checkout: created once and reused, saved BEFORE opening checkout (the webhook only trusts the customer WE created for this user).
            customerId = stripe(() -> gateway.createCustomer(user.getEmail(), user.getLogin(), user.getId()));
            sub.setStripeCustomerId(customerId);
            sub.setUpdatedAt(Instant.now());
            subscriptions.save(sub);
            LOG.info("Created a Stripe customer for user {}", user.getId());
        }
        Map<String, String> metadata = new LinkedHashMap<>();
        metadata.put("quote_id", String.valueOf(q.getId()));
        metadata.put("plan_version_id", String.valueOf(q.getPlanVersionId()));
        metadata.put("kiwiply_scope", "personal");
        metadata.put("app", "kiwiply");
        String consent = settings.getString(BillingSettingKeys.CHECKOUT_CONSENT_TEXT);
        CheckoutSpec spec = new CheckoutSpec(customerId, user.getId(), lines, metadata, successUrl(returnTo), props.getCancelUrl(), false, consent == null || consent.isBlank() ? null : consent);
        return stripe(() -> gateway.createCheckoutSession(spec, IdempotencyKey.of("co", q.getId())));
    }

    /**
     * The legacy alias: a CHECKOUT quote for PRO at the interval of {@code plan} ({@code monthly} or {@code 3mo}) and its checkout. Empty when the catalog
     * cannot sell PRO at that interval yet (the caller then uses the environment price ids), or when {@code plan} is not one of the two legacy names.
     */
    @Transactional(noRollbackFor = BillingException.class)
    public Optional<String> tryCatalogCheckout(String login, String plan) {
        String interval = switch (plan == null ? "" : plan.trim().toLowerCase()) {
            case "monthly" -> "MONTH";
            case "3mo" -> "QUARTER";
            default -> null;
        };
        if (interval == null) return Optional.empty();
        try {
            PlanQuoteDTO quote = quotes.create(new QuoteRequest(PersonalQuoteService.KIND_CHECKOUT, "PRO", interval, List.of(), null, null, null), login);
            return Optional.of(checkout(quote.quoteId(), login, null));
        } catch (BillingException e) {
            if (NOT_SELLABLE_FROM_CATALOG.contains(e.getCode())) {
                LOG.debug("PRO is not sellable from the catalog yet ({}): using the environment prices", e.getCode());
                return Optional.empty();
            }
            throw e;
        }
    }

    private boolean liveAtStripe(String customerId) {
        try {
            return gateway.hasLiveSubscription(customerId);
        } catch (StripeGatewayException e) {
            LOG.error("Stripe call failed: {}", e.getKind());
            throw new BillingException(502, BillingException.CODE_STRIPE_ERROR, "Stripe couldn't complete that");
        }
    }

    private String successUrl(String returnTo) {
        String base = props.getSuccessUrl();
        if (returnTo == null || returnTo.isBlank() || !returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.length() > 200 || returnTo.contains("\\") || returnTo.contains("://")) {
            return base;
        }
        return base + (base.contains("?") ? "&" : "?") + "return_to=" + URLEncoder.encode(returnTo, StandardCharsets.UTF_8);
    }

    private Subscription newRow(User user) {
        Subscription fresh = new Subscription();
        fresh.setUser(user);
        fresh.setCreatedAt(Instant.now());
        fresh.setUpdatedAt(Instant.now());
        return subscriptions.save(fresh);
    }

    private <T> T stripe(java.util.function.Supplier<T> call) {
        try {
            return call.get();
        } catch (StripeGatewayException e) {
            LOG.error("Stripe call failed: {}", e.getKind());
            throw new BillingException(502, BillingException.CODE_STRIPE_ERROR, "Stripe couldn't complete that");
        }
    }
}
