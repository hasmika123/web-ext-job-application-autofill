package com.dossier.api.service.catalog.seed;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * K2.1 on MySQL, on synthetic fixtures: the subscription backfill points every row at the plan version it bought (Pro monthly, Pro quarterly, Free, an
 * unmapped Pro price), changes only unlinked rows, and a rerun changes nothing. (SubscriptionBackfillTest of the story.)
 */
@IntegrationTest
@Transactional
class SubscriptionBackfillIT {

    private static final Map<String, String> PRICES = Map.of("price_it_monthly", "MONTH", "price_it_3mo", "QUARTER");

    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private UserRepository users;
    @Autowired private JdbcTemplate jdbc;

    private Long fixture(String priceId, String plan, String status) {
        String s = UUID.randomUUID().toString().substring(0, 8);
        User u = new User();
        u.setLogin("bf-" + s);
        u.setPassword("x".repeat(60));
        u.setActivated(true);
        u.setEmail("bf." + s + "@example.test");
        u.setLangKey("en");
        u = users.saveAndFlush(u);
        Subscription sub = new Subscription();
        sub.setUser(u);
        sub.setPlan(plan);
        sub.setStatus(status);
        sub.setPriceId(priceId);
        sub.setCurrentPeriodEnd(Instant.now().plus(20, ChronoUnit.DAYS));
        return subscriptions.saveAndFlush(sub).getId();
    }

    private Map<String, Object> row(Long id) {
        return jdbc.queryForMap("select plan, status, price_id, plan_version_id, billing_interval, currency from subscription where id = ?", id);
    }

    private Long version(String planKey) {
        return jdbc.queryForObject("select v.id from plan_version v join plan p on p.id = v.plan_id where p.plan_key = ? and v.version = 1", Long.class, planKey);
    }

    private SubscriptionBackfill.Result run() {
        return jdbc.execute((ConnectionCallback<SubscriptionBackfill.Result>) c -> SubscriptionBackfill.run(c, PRICES));
    }

    @Test
    void everyRowIsLinkedToTheVersionItBoughtAndARerunChangesNothing() {
        Long monthly = fixture("price_it_monthly", "PRO", "active");
        Long quarterly = fixture("price_it_3mo", "PRO", "active");
        Long free = fixture(null, "FREE", "none");
        Long odd = fixture("price_unknown", "PRO", "active");

        SubscriptionBackfill.Result first = run();
        assertThat(first.plansPresent()).isTrue();
        assertThat(first.unmapped()).containsExactly(odd);

        assertThat(row(monthly)).containsEntry("plan_version_id", version("PRO")).containsEntry("billing_interval", "MONTH").containsEntry("currency", "USD");
        assertThat(row(quarterly)).containsEntry("plan_version_id", version("PRO")).containsEntry("billing_interval", "QUARTER");
        assertThat(row(free)).containsEntry("plan_version_id", version("FREE")).containsEntry("currency", "USD");
        assertThat(row(free).get("billing_interval")).isNull();
        assertThat(row(odd)).containsEntry("plan_version_id", version("PRO"));
        assertThat(row(odd).get("billing_interval")).as("an unmapped Pro price is linked without guessing an interval").isNull();
        // the derived label and the Stripe mirror are untouched
        assertThat(row(monthly)).containsEntry("plan", "PRO").containsEntry("status", "active").containsEntry("price_id", "price_it_monthly");

        Map<String, Object> before = row(monthly);
        SubscriptionBackfill.Result second = run();
        assertThat(second.total()).as("a rerun links nothing").isZero();
        assertThat(row(monthly)).isEqualTo(before);
        assertThat(jdbc.queryForObject("select count(*) from subscription where plan_version_id is null", Long.class)).isZero();
    }

    @Test
    void aRowWithAPlanVersionAlreadyIsNeverMoved() {
        Long id = fixture("price_it_monthly", "PRO", "active");
        jdbc.update("update subscription set plan_version_id = ?, billing_interval = 'QUARTER' where id = ?", version("AUTOPILOT"), id);
        run();
        assertThat(row(id)).containsEntry("plan_version_id", version("AUTOPILOT")).containsEntry("billing_interval", "QUARTER");
    }

    @Test
    void theLiquibaseWrapperReadsThePriceIdsFromTheEnvironmentAndStrictModeIsOptIn() {
        Map<String, String> env = Map.of("STRIPE_PRICE_MONTHLY", " price_a ", "STRIPE_PRICE_3MO", "price_b");
        assertThat(SubscriptionBackfillChange.priceIntervals(env, new java.util.Properties())).containsEntry("price_a", "MONTH").containsEntry("price_b", "QUARTER");
        java.util.Properties props = new java.util.Properties();
        props.setProperty("dossier.stripe.price-monthly", "price_c");
        assertThat(SubscriptionBackfillChange.priceIntervals(Map.of(), props)).containsEntry("price_c", "MONTH");
        assertThat(SubscriptionBackfillChange.strict(Map.of(), new java.util.Properties())).isFalse();
        assertThat(SubscriptionBackfillChange.strict(Map.of("SUBSCRIPTION_BACKFILL_STRICT", "true"), new java.util.Properties())).isTrue();
    }
}
