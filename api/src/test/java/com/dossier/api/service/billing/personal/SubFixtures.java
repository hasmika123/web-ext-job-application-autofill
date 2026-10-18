package com.dossier.api.service.billing.personal;

import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import com.dossier.api.service.pricing.CatalogPort;
import com.dossier.api.service.pricing.PriceRow;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Test data for the personal quote, change and checkout tests (K3.3 to K5.7). It builds a published, public individual plan {@code TQ} whose version copies
 * the components of the seeded (draft) PRO v1, sells it through the real PRO subscription product and the seeded add-on products, and gives every price row
 * a Stripe price id. The catalog port below is the in-memory double the plans stream's real adapter will replace: it reads the active {@code product_price}
 * rows. Everything runs inside the test's transaction and rolls back.
 */
public final class SubFixtures {

    public static final String PLAN_KEY = "TQ";
    public static final String BASE_MONTH = "price_tq_base_m";
    public static final String BASE_QUARTER = "price_tq_base_q";
    public static final String AI_MONTH = "price_tq_ai_m";
    public static final String AI_QUARTER = "price_tq_ai_q";
    public static final String PACK_MONTH = "price_tq_pack_m";

    private SubFixtures() {}

    /** Ids of what {@link #publishedPlan} created. */
    public record Plan(long planId, long versionId, long baseProductId) {}

    /** Replaces the Stripe gateway with the scripted {@link FakeStripeGateway}; autowire it into the test to script and inspect it. */
    @TestConfiguration
    public static class FakeGatewayConfig {

        @Bean
        @Primary
        FakeStripeGateway fakeStripeGateway() {
            return new FakeStripeGateway();
        }
    }

    @TestConfiguration
    public static class CatalogPortConfig {

        @Bean
        @Primary
        CatalogPort fixtureCatalogPort(JdbcTemplate jdbc) {
            return (code, audience, interval, currency, at) -> {
                Timestamp ts = Timestamp.from(at);
                List<PriceRow> rows = jdbc.query(
                    "SELECT pp.id, pp.amount_minor, p.kind FROM product_price pp JOIN product p ON p.id = pp.product_id " +
                        "WHERE p.code = ? AND pp.audience = ? AND pp.billing_interval = ? AND pp.currency = ? AND pp.active = TRUE " +
                        "AND pp.effective_from <= ? AND (pp.effective_until IS NULL OR pp.effective_until > ?)",
                    (rs, i) -> new PriceRow(String.valueOf(rs.getLong("id")), code, rs.getString("kind"), audience, interval, currency, rs.getLong("amount_minor"), 0),
                    code,
                    audience.name(),
                    interval.name(),
                    currency,
                    ts,
                    ts
                );
                return rows.isEmpty() ? Optional.<PriceRow>empty() : Optional.of(rows.get(0));
            };
        }
    }

    /** A published public individual plan TQ (MONTH, QUARTER) based on the PRO product, with PRO v1's components. */
    public static Plan publishedPlan(JdbcTemplate jdbc) {
        Instant now = Instant.now();
        long base = jdbc.queryForObject("SELECT id FROM product WHERE code = 'PRO'", Long.class);
        jdbc.update("INSERT INTO plan (plan_key, name, audience, status, `public`, sort_order, created_at, created_by) VALUES (?, 'Test plan', 'INDIVIDUAL', 'PUBLISHED', TRUE, 5, ?, 'test')", PLAN_KEY, Timestamp.from(now));
        long planId = jdbc.queryForObject("SELECT id FROM plan WHERE plan_key = ?", Long.class, PLAN_KEY);
        jdbc.update(
            "INSERT INTO plan_version (plan_id, version, status, base_product_id, intervals_json, ai_budget_cap_cents, created_at, created_by, updated_at, published_at, published_by, effective_from) " +
                "VALUES (?, 1, 'PUBLISHED', ?, '[\"MONTH\",\"QUARTER\"]', 300, ?, 'test', ?, ?, 'test', ?)",
            planId, base, Timestamp.from(now), Timestamp.from(now), Timestamp.from(now), Timestamp.from(now.minus(1, ChronoUnit.DAYS))
        );
        long versionId = jdbc.queryForObject("SELECT id FROM plan_version WHERE plan_id = ? AND version = 1", Long.class, planId);
        jdbc.update(
            "INSERT INTO plan_component (plan_version_id, feature_key, role, product_id, allowance_override, default_quantity, max_quantity, sort_order) " +
                "SELECT ?, c.feature_key, c.role, c.product_id, c.allowance_override, c.default_quantity, c.max_quantity, c.sort_order FROM plan_component c " +
                "JOIN plan_version v ON v.id = c.plan_version_id JOIN plan p ON p.id = v.plan_id WHERE p.plan_key = 'PRO' AND v.version = 1",
            versionId
        );
        return new Plan(planId, versionId, base);
    }

    /**
     * Removes the {@code stripe_event} rows written since {@code since}. {@code BillingWebhookService} records every event in a REQUIRES_NEW transaction, so
     * those rows commit even though the test's own transaction rolls back; left behind, they would make the next test's events "already handled". The delete
     * runs in a transaction of its own for the same reason (inside the test's transaction it would roll back with it). Tests that reach the webhook service
     * need {@code spring.datasource.hikari.maximum-pool-size=4}: the test pool of ONE connection is held by the test transaction, so the REQUIRES_NEW one
     * would wait for it forever.
     */
    public static void purgeStripeEventsSince(PlatformTransactionManager txm, JdbcTemplate jdbc, Instant since) {
        TransactionTemplate own = new TransactionTemplate(txm);
        own.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        own.executeWithoutResult(s -> jdbc.update("DELETE FROM stripe_event WHERE received_at >= ?", Timestamp.from(since.minusSeconds(5))));
    }

    /** An active USD INDIVIDUAL price row for a product; returns its id. */
    public static long price(JdbcTemplate jdbc, String productCode, String interval, long amountMinor, String stripePriceId) {
        Instant now = Instant.now();
        long productId = jdbc.queryForObject("SELECT id FROM product WHERE code = ?", Long.class, productCode);
        jdbc.update(
            "INSERT INTO product_price (product_id, audience, billing_interval, amount_minor, currency, stripe_price_id, active, effective_from, published_at, catalog_version, created_by, created_at) " +
                "VALUES (?, 'INDIVIDUAL', ?, ?, 'USD', ?, TRUE, ?, ?, 0, 'test', ?)",
            productId, interval, amountMinor, stripePriceId, Timestamp.from(now.minus(1, ChronoUnit.DAYS)), Timestamp.from(now), Timestamp.from(now)
        );
        return jdbc.queryForObject("SELECT id FROM product_price WHERE stripe_price_id = ?", Long.class, stripePriceId);
    }

    /** The standard price list: base 1999 / 4999, extra AI 499 / 1299, resume pack 299 (monthly only). */
    public static void standardPrices(JdbcTemplate jdbc) {
        price(jdbc, "PRO", "MONTH", 1999, BASE_MONTH);
        price(jdbc, "PRO", "QUARTER", 4999, BASE_QUARTER);
        price(jdbc, "FEAT_AI_CREDITS", "MONTH", 499, AI_MONTH);
        price(jdbc, "FEAT_AI_CREDITS", "QUARTER", 1299, AI_QUARTER);
        price(jdbc, "FEAT_RESUME_PACK", "MONTH", 299, PACK_MONTH);
    }
}
