package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.catalog.SubscriptionPlanLinker;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * The regression gate of the subscription module's foundations (K2.1; K7.7 extends it): the legacy readers answer byte for byte the same before and after
 * the plan layer links a subscription to a plan version. {@code GET /api/billing/me} and {@code GET /api/profile/version} are compared for a Free user, a
 * Pro-monthly user and a Pro-quarterly user. Nothing that reads the mirror may notice the new columns.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "user")
@TestPropertySource(properties = { "dossier.stripe.price-monthly=price_legacy_monthly", "dossier.stripe.price3mo=price_legacy_3mo" })
class LegacyReadersUnchangedIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private UserRepository users;
    @Autowired private SubscriptionPlanLinker linker;
    @Autowired private JdbcTemplate jdbc;

    private String body(String path) throws Exception {
        return mockMvc.perform(get(path)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private void assertUnchangedAcrossTheLink(String label) throws Exception {
        String billingBefore = body("/api/billing/me");
        String versionBefore = body("/api/profile/version");
        int linked = linker.link();
        assertThat(linked).as("%s: the link step ran", label).isGreaterThanOrEqualTo(0);
        assertThat(body("/api/billing/me")).as("%s: /api/billing/me is byte-identical", label).isEqualTo(billingBefore);
        assertThat(body("/api/profile/version")).as("%s: /api/profile/version is byte-identical", label).isEqualTo(versionBefore);
    }

    private Subscription row(String priceId, String plan, String status) {
        User user = users.findOneByLogin("user").orElseThrow();
        Subscription sub = subscriptions.findOneByUserLogin("user").orElseGet(Subscription::new);
        sub.setUser(user);
        sub.setPlan(plan);
        sub.setStatus(status);
        sub.setPriceId(priceId);
        return sub;
    }

    @Test
    void aFreeUserSeesTheSameBodiesBeforeAndAfter() throws Exception {
        subscriptions.findOneByUserLogin("user").ifPresent(s -> {
            subscriptions.delete(s);
            subscriptions.flush();
        });
        assertUnchangedAcrossTheLink("free");
    }

    @Test
    void aProMonthlyUserSeesTheSameBodiesBeforeAndAfterAndIsLinkedToProV1() throws Exception {
        link("price_legacy_monthly");
        Long id = subscriptions.findOneByUserLogin("user").orElseThrow().getId();
        assertThat(jdbc.queryForObject("select plan_version_id from subscription where id = ?", Long.class, id)).as("not linked yet").isNull();
        assertUnchangedAcrossTheLink("pro monthly");
        assertThat(jdbc.queryForObject("select p.plan_key from subscription s join plan_version v on v.id = s.plan_version_id join plan p on p.id = v.plan_id where s.id = ?", String.class, id)).isEqualTo("PRO");
        assertThat(jdbc.queryForObject("select billing_interval from subscription where id = ?", String.class, id)).isEqualTo("MONTH");
    }

    @Test
    void aProQuarterlyUserSeesTheSameBodiesBeforeAndAfterAndIsLinkedWithItsInterval() throws Exception {
        link("price_legacy_3mo");
        Long id = subscriptions.findOneByUserLogin("user").orElseThrow().getId();
        assertUnchangedAcrossTheLink("pro quarterly");
        assertThat(jdbc.queryForObject("select billing_interval from subscription where id = ?", String.class, id)).isEqualTo("QUARTER");
    }

    private void link(String priceId) {
        Subscription sub = row(priceId, Subscription.PLAN_PRO, "active");
        sub.setStripeCustomerId("cus_legacy_it");
        sub.setCurrentPeriodEnd(Instant.now().plus(20, ChronoUnit.DAYS));
        subscriptions.saveAndFlush(sub);
    }
}
