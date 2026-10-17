package com.dossier.api.service.retirement;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.billing.personal.SubFixtures;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Test data for the retirement stories (K10.1 to K10.11). The retiring plan is the published public individual plan {@code TQ} of {@link SubFixtures} (priced by
 * {@link SubFixtures#standardPrices}); {@link #successorPlan} adds another one that can replace it (same components, a base product of your choice, so the price can be
 * the same or dearer); {@link #subscriber} creates a personal user whose subscription sits on TQ v1 with a given interval, state and period end. Everything runs inside the
 * test's transaction and rolls back.
 */
public final class RetirementFixtures {

    public static final String REASON = "Retiring the test plan for the retirement lifecycle tests";
    public static final String SUCCESSOR_KEY = "TS";

    private RetirementFixtures() {}

    /** A second published plan TS on the PRO product (the same base price as TQ). Kept for the first stories' tests. */
    public static long successorPlan(JdbcTemplate jdbc, long ignoredMonthlyMinor) {
        return successorPlan(jdbc, SUCCESSOR_KEY, "PRO");
    }

    /**
     * A published public individual plan {@code key} with the components of TQ and the base product {@code baseProductCode} (PRO for the same price as TQ, AUTOPILOT for a
     * dearer one once {@link SubFixtures#price} gave that product a price). Returns the version id.
     */
    public static long successorPlan(JdbcTemplate jdbc, String key, String baseProductCode) {
        Instant now = Instant.now();
        long base = jdbc.queryForObject("SELECT id FROM product WHERE code = ?", Long.class, baseProductCode);
        jdbc.update("INSERT INTO plan (plan_key, name, audience, status, `public`, sort_order, created_at, created_by) VALUES (?, ?, 'INDIVIDUAL', 'PUBLISHED', TRUE, 6, ?, 'test')", key, key.equals(SUCCESSOR_KEY) ? "Successor plan" : "Plan " + key, Timestamp.from(now));
        long planId = jdbc.queryForObject("SELECT id FROM plan WHERE plan_key = ?", Long.class, key);
        jdbc.update(
            "INSERT INTO plan_version (plan_id, version, status, base_product_id, intervals_json, ai_budget_cap_cents, created_at, created_by, updated_at, published_at, published_by, effective_from) "
                + "VALUES (?, 1, 'PUBLISHED', ?, '[\"MONTH\",\"QUARTER\"]', 300, ?, 'test', ?, ?, 'test', ?)",
            planId, base, Timestamp.from(now), Timestamp.from(now), Timestamp.from(now), Timestamp.from(now.minus(1, ChronoUnit.DAYS))
        );
        long versionId = jdbc.queryForObject("SELECT id FROM plan_version WHERE plan_id = ? AND version = 1", Long.class, planId);
        jdbc.update(
            "INSERT INTO plan_component (plan_version_id, feature_key, role, product_id, allowance_override, default_quantity, max_quantity, sort_order) "
                + "SELECT ?, c.feature_key, c.role, c.product_id, c.allowance_override, c.default_quantity, c.max_quantity, c.sort_order FROM plan_component c "
                + "JOIN plan_version v ON v.id = c.plan_version_id JOIN plan p ON p.id = v.plan_id WHERE p.plan_key = ? AND v.version = 1",
            versionId, SubFixtures.PLAN_KEY
        );
        return versionId;
    }

    /** A personal user. */
    public static User user(UserRepository users, String prefix) {
        String s = UUID.randomUUID().toString().substring(0, 8);
        User u = new User();
        u.setLogin(prefix + "-" + s);
        u.setPassword("x".repeat(60));
        u.setActivated(true);
        u.setEmail(prefix + "." + s + "@example.test");
        u.setLangKey("en");
        return users.saveAndFlush(u);
    }

    /**
     * A paying subscriber on TQ v1: a new user, a subscription row (status, interval, period end in {@code endDays} from now, the base Stripe price of that interval) linked
     * to {@code versionId}. {@code stripeSubscription} gives it a Stripe subscription and customer id (so the Stripe-side steps have something to talk to).
     */
    public static Subscription subscriber(UserRepository users, SubscriptionRepository subscriptions, long versionId, String interval, String status, long endDays, boolean cancelAtPeriodEnd, boolean stripeSubscription) {
        return subscriberFor(user(users, "ret"), subscriptions, versionId, interval, status, endDays, cancelAtPeriodEnd, stripeSubscription);
    }

    /** The same for an existing user (a test that must act as a signed-in account such as the seeded {@code user}). */
    public static Subscription subscriberFor(User u, SubscriptionRepository subscriptions, long versionId, String interval, String status, long endDays, boolean cancelAtPeriodEnd, boolean stripeSubscription) {
        Subscription sub = subscriptions.findOneByUserId(u.getId()).orElseGet(Subscription::new);
        sub.setUser(u);
        sub.setPlan("PRO");
        sub.setStatus(status);
        sub.setCurrentPeriodEnd(Instant.now().plus(endDays, ChronoUnit.DAYS));
        sub.setCurrentPeriodStart(Instant.now().plus(endDays, ChronoUnit.DAYS).minus("QUARTER".equals(interval) ? 90 : "YEAR".equals(interval) ? 365 : 30, ChronoUnit.DAYS));
        sub.setCancelAtPeriodEnd(cancelAtPeriodEnd);
        sub.setPlanVersionId(versionId);
        sub.setBillingInterval(interval);
        sub.setCurrency("USD");
        sub.setPriceId("QUARTER".equals(interval) ? SubFixtures.BASE_QUARTER : SubFixtures.BASE_MONTH);
        if (stripeSubscription) {
            String tag = UUID.randomUUID().toString().substring(0, 12);
            sub.setStripeCustomerId("cus_" + tag);
            sub.setStripeSubscriptionId("sub_" + tag);
        }
        return subscriptions.saveAndFlush(sub);
    }

    /** One committed AI call that names a service: a usage signal for the closest-match suggestion. */
    public static void aiCall(JdbcTemplate jdbc, String login, String featureKey) {
        jdbc.update(
            "INSERT INTO ai_call (login, task, model, input_tokens, cached_tokens, output_tokens, cost_micros, created_at, provider, success, feature_key) VALUES (?, 'tailor', 'test', 1, 0, 1, 1, ?, 'gemini', TRUE, ?)",
            login, Timestamp.from(Instant.now().minus(2, ChronoUnit.DAYS)), featureKey
        );
    }

    /** {@code n} saved resumes (counts only; no content). */
    public static void resumes(JdbcTemplate jdbc, Long userId, int n) {
        for (int i = 0; i < n; i++) {
            jdbc.update("INSERT INTO resume (label, r_2_object_key, status, created_at, user_id, share_with_org) VALUES (?, ?, 'CONFIRMED', ?, ?, 1)", "Resume " + i, "test/" + UUID.randomUUID(), Timestamp.from(Instant.now()), userId);
        }
    }

    /** A live add-on line on a subscription: {@code qty} of {@code featureKey} at the active price row whose Stripe id is {@code stripePriceId}. */
    public static void addon(JdbcTemplate jdbc, Subscription sub, String featureKey, String productCode, String stripePriceId, int qty) {
        long productId = jdbc.queryForObject("SELECT id FROM product WHERE code = ?", Long.class, productCode);
        long priceId = jdbc.queryForObject("SELECT id FROM product_price WHERE stripe_price_id = ?", Long.class, stripePriceId);
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update(
            "INSERT INTO subscription_addon (subscription_id, user_id, feature_key, product_id, price_id, quantity, starts_at, live, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)",
            sub.getId(), sub.getUser().getId(), featureKey, productId, priceId, qty, now, now, now
        );
    }
}
