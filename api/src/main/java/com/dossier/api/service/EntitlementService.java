package com.dossier.api.service;

import com.dossier.api.config.Constants;
import com.dossier.api.domain.Subscription;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.dto.PlanDTO;
import com.dossier.api.service.entitlement.EntitlementSet;
import com.dossier.api.service.entitlement.FeatureKeys;
import com.dossier.api.service.entitlement.PersonalFeatureMap;
import com.dossier.api.service.entitlement.PlanResolver;
import com.dossier.api.service.entitlement.ShadowComparator;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
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
     * The catalog resolver and its shadow comparator (story K7.1). Optional by design: a plain {@code new EntitlementService(repo, gateway)} (every
     * existing unit test) has neither, and then this class behaves exactly as it always did. Spring wires them through the setters below.
     */
    private PlanResolver planResolver;

    private ShadowComparator shadow;

    @Autowired(required = false)
    public void setPlanResolver(PlanResolver planResolver) {
        this.planResolver = planResolver;
    }

    @Autowired(required = false)
    public void setShadowComparator(ShadowComparator shadow) {
        this.shadow = shadow;
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
        // Decision O4: an enterprise account (login ent#<orgId>#...) never has a personal plan, whatever a stray row might say.
        if (Constants.isEnterpriseLogin(login)) return false;
        boolean legacy = legacyIsPro(login);
        return decide(login, FeatureKeys.Capability.AI_SERVER, legacy);
    }

    /** The row logic exactly as it has always been: the status, the period end and the clock. */
    private boolean legacyIsPro(String login) {
        return subscriptionRepository
            .findOneByUserLogin(login)
            .map(sub -> isProFor(sub.getStatus(), sub.getCurrentPeriodEnd(), Instant.now()))
            .orElse(false);
    }

    /**
     * The one place shadow mode is applied to a yes/no: while shadow is on the legacy answer is returned and the resolver is only compared; once it is
     * off the resolver answers (and a resolver failure falls back to the legacy answer rather than failing a gate).
     */
    private boolean decide(String login, String key, boolean legacy) {
        if (planResolver == null || shadow == null || Constants.isEnterpriseLogin(login)) return legacy;
        if (shadow.shadowOn()) {
            shadow.compareHas(login, key, legacy);
            return legacy;
        }
        return shadow.resolve(login).map(s -> s.has(key)).orElse(legacy);
    }

    /**
     * Whether this personal account has the service {@code key} (a catalog service key such as {@code ai.resume_tailoring}, or a legacy capability key
     * such as {@code ai.server}) - story K7.3's replacement for {@link #isPro}. While the catalog resolver is in shadow, the answer is the legacy one
     * ({@link PersonalFeatureMap}): Pro-gated keys follow {@code isPro}, open keys are true, a key with no legacy gate asks the resolver.
     */
    public boolean has(String login, String key) {
        if (Constants.isEnterpriseLogin(login)) return false;
        PersonalFeatureMap.Gate gate = PersonalFeatureMap.gate(key);
        if (gate == PersonalFeatureMap.Gate.UNMAPPED) {
            if (planResolver == null || shadow == null) return false;
            return shadow.resolve(login).map(s -> s.has(key)).orElse(false);
        }
        boolean legacy = gate == PersonalFeatureMap.Gate.OPEN || legacyIsPro(login);
        return decide(login, key, legacy);
    }

    /**
     * Gate an operation on a service. Throws the same 402 as {@link #requirePro} ({@code PRO_REQUIRED}, same message, no extras) for every key that was
     * Pro-gated before the catalog; a key with no legacy gate throws {@code PLAN_REQUIRED} naming the feature.
     */
    public void require(String login, String key) {
        if (has(login, key)) return;
        if (PersonalFeatureMap.legacyCode(key) == null) {
            throw new ProRequiredException("PLAN_REQUIRED", "This feature is not part of your plan", java.util.Map.of("feature", key)).forFeature(key);
        }
        throw new ProRequiredException(ProRequiredException.CODE_PRO_REQUIRED, "This feature is part of Kiwiply Pro").forFeature(key);
    }

    /** {@link #require(String, String)} for whoever is signed in. */
    public void requireCurrent(String key) {
        String login = SecurityUtils.getCurrentUserLogin()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));
        require(login, key);
    }

    /**
     * Whether this account holds a paid plan right now - what a second checkout must refuse ({@code ALREADY_SUBSCRIBED}). Today's {@link #isPro}; once the
     * resolver decides, the subscription state ({@code state.entitled()}).
     */
    public boolean hasPaidPlan(String login) {
        if (Constants.isEnterpriseLogin(login)) return false;
        boolean legacy = legacyIsPro(login);
        if (planResolver == null || shadow == null) return legacy;
        if (shadow.shadowOn()) {
            shadow.compareHas(login, FeatureKeys.Capability.AI_SERVER, legacy);
            return legacy;
        }
        return shadow.resolve(login).map(s -> s.state().entitled()).orElse(legacy);
    }

    /**
     * The limit the resolver decides for a limit key, empty while the shadow is on (the caller then keeps its legacy constant) or when the resolver cannot
     * answer. While shadowed, {@code legacy} is compared with the resolver's number so a mismatch is logged.
     */
    public Optional<Long> limitFor(String login, String limitKey, long legacy) {
        if (planResolver == null || shadow == null || Constants.isEnterpriseLogin(login)) return Optional.empty();
        if (shadow.shadowOn()) {
            shadow.compareLimit(login, limitKey, legacy);
            return Optional.empty();
        }
        return shadow.resolve(login).map(s -> s.limit(limitKey));
    }

    /** The resolved set for a personal login, for {@code entitlementsOf}: the profile version, My plan, the extension. Empty when it cannot be built. */
    public Optional<EntitlementSet> entitlementsOf(String login) {
        if (planResolver == null || shadow == null || Constants.isEnterpriseLogin(login)) return Optional.empty();
        return shadow.resolve(login);
    }

    /**
     * The service keys for {@code features[]} on {@code GET /api/profile/version} (decision R-1). While {@code billing.catalog.shadow} is on, the LEGACY rule
     * decides ({@link PersonalFeatureMap#legacyKeys}: open keys, plus the Pro-gated ones when {@link #legacyIsPro}) and the resolver's answer is only compared
     * and logged as {@code entitlement.shadow_mismatch}; flipping the flag makes the resolver's features and capabilities the answer. Empty when the account
     * is an enterprise account or the resolver is not wired.
     */
    public Optional<java.util.SortedSet<String>> featuresOf(String login) {
        if (planResolver == null || shadow == null || Constants.isEnterpriseLogin(login)) return Optional.empty();
        if (shadow.shadowOn()) {
            java.util.SortedSet<String> legacy = PersonalFeatureMap.legacyKeys(legacyIsPro(login));
            shadow.resolve(login).ifPresent(set -> {
                java.util.Set<String> all = new java.util.TreeSet<>(PersonalFeatureMap.legacyKeys(true));
                for (String key : all) {
                    if (set.has(key) != legacy.contains(key)) shadow.reportMismatch(login, key, legacy.contains(key), set.has(key));
                }
            });
            return Optional.of(legacy);
        }
        return shadow.resolve(login).map(set -> {
            java.util.TreeSet<String> keys = new java.util.TreeSet<>(set.features().keySet());
            keys.addAll(set.capabilities());
            return keys;
        });
    }

    /** True when the authenticated user is entitled to Pro. False when nobody is signed in. */
    public boolean isCurrentUserPro() {
        return SecurityUtils.getCurrentUserLogin().map(this::isPro).orElse(false);
    }

    /** The full plan view for a login — what {@code GET /api/billing/me} returns. */
    public PlanDTO plan(String login) {
        boolean billingEnabled = stripeGateway.isEnabled();
        // Decision O4: an enterprise account is never on a personal plan (its organization's license is the only grant it can hold).
        Optional<Subscription> maybe = Constants.isEnterpriseLogin(login) ? Optional.empty() : subscriptionRepository.findOneByUserLogin(login);
        if (maybe.isEmpty()) {
            return new PlanDTO(Subscription.PLAN_FREE, Subscription.STATUS_NONE, null, false, billingEnabled, false);
        }
        Subscription sub = maybe.get();
        boolean pro = isProFor(sub.getStatus(), sub.getCurrentPeriodEnd(), Instant.now());
        pro = decide(login, FeatureKeys.Capability.AI_SERVER, pro);
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
