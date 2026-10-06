package com.dossier.api.service;

import com.dossier.api.domain.Subscription;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.dto.PlanDTO;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Whether a user is entitled to Pro — <b>the only source of truth for gating</b> (Phase 12.1).
 *
 * <p>Never trust a client's word about its plan: the extension and the web app both display it,
 * but every Pro-only path calls {@link #requirePro(String)} on the server.
 *
 * <p>The decision is a pure function of the mirrored Stripe status, {@code currentPeriodEnd} and
 * the clock — see {@link #isProFor}. Nothing is cached: it is one indexed row read, and a cache
 * here would mean a user who just paid keeps seeing Free.
 */
@Service
@Transactional(readOnly = true)
public class EntitlementService {

    /**
     * Statuses that are Pro outright. Stripe is asserting the subscription is in good standing,
     * so we honour it even if our mirrored {@code currentPeriodEnd} looks stale — a delayed
     * renewal webhook must never downgrade someone who is actually paying.
     */
    private static final Set<String> ACTIVE_STATUSES = Set.of("active", "trialing");

    /**
     * Statuses that keep Pro until the paid-for period ends, then lapse.
     *
     * <p>{@code past_due}: Stripe's Smart Retries run during this window, and dropping someone on
     * the first failed charge punishes an expired card rather than a non-payer.
     *
     * <p>{@code canceled}: they paid for the period; cancelling means "don't renew", not "refund
     * me and cut me off". This is also what {@code cancel_at_period_end} looks like once the
     * subscription actually ends.
     */
    private static final Set<String> GRACE_STATUSES = Set.of("past_due", "canceled");

    // Everything else — unpaid, incomplete, incomplete_expired, none, anything Stripe adds
    // later — is Free immediately. Defaulting an unrecognised status to Free is the safe side.

    private final SubscriptionRepository subscriptionRepository;

    /**
     * Asked whether billing is configured — deliberately the gateway rather than the properties,
     * so what {@code /api/billing/me} reports and what checkout/portal actually enforce can never
     * disagree. One source of truth for "is billing on".
     */
    private final StripeGateway stripeGateway;

    public EntitlementService(SubscriptionRepository subscriptionRepository, StripeGateway stripeGateway) {
        this.subscriptionRepository = subscriptionRepository;
        this.stripeGateway = stripeGateway;
    }

    /**
     * The entitlement rule, as a pure function so it can be unit-tested as a status × period
     * matrix without a database.
     *
     * @param status           Stripe's status string (or {@code none})
     * @param currentPeriodEnd end of the paid-for period; {@code null} counts as lapsed
     * @param now              the clock
     */
    public static boolean isProFor(String status, Instant currentPeriodEnd, Instant now) {
        if (status == null) return false;
        String s = status.trim().toLowerCase();
        if (ACTIVE_STATUSES.contains(s)) return true;
        if (GRACE_STATUSES.contains(s)) {
            // No period end means we don't know what was paid for — treat it as lapsed.
            return currentPeriodEnd != null && currentPeriodEnd.isAfter(now);
        }
        return false;
    }

    /** True when this login is entitled to Pro right now. A user with no row is Free. */
    public boolean isPro(String login) {
        return subscriptionRepository
            .findOneByUserLogin(login)
            .map(sub -> isProFor(sub.getStatus(), sub.getCurrentPeriodEnd(), Instant.now()))
            .orElse(false);
    }

    /** True when the authenticated user is entitled to Pro. False when nobody is signed in. */
    public boolean isCurrentUserPro() {
        return SecurityUtils.getCurrentUserLogin().map(this::isPro).orElse(false);
    }

    /** The full plan view for a login — what {@code GET /api/billing/me} returns. */
    public PlanDTO plan(String login) {
        Optional<Subscription> maybe = subscriptionRepository.findOneByUserLogin(login);
        boolean billingEnabled = stripeGateway.isEnabled();
        if (maybe.isEmpty()) {
            return new PlanDTO(Subscription.PLAN_FREE, Subscription.STATUS_NONE, null, false, billingEnabled, false);
        }
        Subscription sub = maybe.get();
        boolean pro = isProFor(sub.getStatus(), sub.getCurrentPeriodEnd(), Instant.now());
        return new PlanDTO(
            pro ? Subscription.PLAN_PRO : Subscription.PLAN_FREE,
            sub.getStatus(),
            sub.getCurrentPeriodEnd(),
            sub.isCancelAtPeriodEnd(),
            billingEnabled,
            sub.getStripeCustomerId() != null
        );
    }

    /** The plan view for the authenticated user. */
    public PlanDTO currentUserPlan() {
        String login = SecurityUtils.getCurrentUserLogin()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));
        return plan(login);
    }

    /**
     * Gate a Pro-only operation. Throws 402 {@code PRO_REQUIRED} when the user isn't entitled —
     * the single call every Pro feature adds at its service boundary (12.4).
     */
    public void requirePro(String login) {
        if (!isPro(login)) {
            throw new ProRequiredException(ProRequiredException.CODE_PRO_REQUIRED, "This feature is part of Kiwiply Pro");
        }
    }

    /** {@link #requirePro(String)} for whoever is signed in. */
    public void requireCurrentUserPro() {
        String login = SecurityUtils.getCurrentUserLogin()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));
        requirePro(login);
    }
}
