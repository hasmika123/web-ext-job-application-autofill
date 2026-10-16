package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.StripeEvent;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.StripeEventRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.billing.StripeWebhookEvent;
import com.dossier.api.service.billing.personal.FakeStripeGateway;
import com.dossier.api.service.billing.personal.SubFixtures;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * K8.5: the admin side of the reconciler. Drift rows and the attention counts, resolving a row (HIGH: reason, audit), and replaying a Stripe event through the
 * real webhook service: the mirror is fixed, the replay is its own event row with {@code replayed_from} and {@code replayed_by}, and nothing is sent to
 * Stripe. Routes are ADMIN only.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "admin", authorities = { "ROLE_ADMIN" })
@Import({ SubFixtures.CatalogPortConfig.class, SubFixtures.FakeGatewayConfig.class })
class AdminBillingOpsResourceIT {

    @Autowired private MockMvc mockMvc;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private UserRepository users;
    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private StripeEventRepository stripeEvents;
    @Autowired private FakeStripeGateway fake;

    private String salt;
    private Subscription sub;

    @BeforeEach
    void data() {
        fake.reset();
        salt = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        User user = users.findOneByLogin("user").orElseThrow();
        sub = subscriptions.findOneByUserId(user.getId()).orElseGet(Subscription::new);
        sub.setUser(user);
        sub.setStripeCustomerId("cus_ops_" + salt);
        sub.setStripeSubscriptionId("sub_ops_" + salt);
        sub.setStatus("past_due");
        sub.setPlan("PRO");
        sub.setCurrentPeriodEnd(Instant.now().plus(10, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS));
        sub.setLastEventAt(Instant.now().minus(3, ChronoUnit.DAYS));
        sub = subscriptions.saveAndFlush(sub);
    }

    private ResultActions json(String path, String body) throws Exception {
        return mockMvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private long drift(String kind, String code, String subject) {
        jdbc.update(
            "insert into billing_drift (kind, code, subject, expected_json, actual_json, detected_at) values (?, ?, ?, '{\"quantity\":1}', '{\"quantity\":2}', ?)",
            kind, code, subject, java.sql.Timestamp.from(Instant.now())
        );
        return jdbc.queryForObject("select max(id) from billing_drift", Long.class);
    }

    @Test
    void theDriftListAndTheAttentionCountsShowOpenRowsPerKind() throws Exception {
        long before = jdbc.queryForObject("select count(*) from billing_drift where resolved_at is null and kind = 'PERSONAL'", Long.class);
        drift("PERSONAL", "QUANTITY", "sub_ops_" + salt + "/ai.credits_extra");
        drift("PERSONAL", "PERIOD", "sub_ops_" + salt);

        mockMvc.perform(get("/api/admin/billing/attention")).andExpect(status().isOk()).andExpect(jsonPath("$.byKind.PERSONAL").value(before + 2));
        mockMvc
            .perform(get("/api/admin/billing/drift").param("kind", "personal").param("size", "1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(before + 2))
            .andExpect(jsonPath("$.items.length()").value(1))
            .andExpect(jsonPath("$.items[0].code").value("PERIOD"))
            .andExpect(jsonPath("$.attention.open").isNumber());
        mockMvc.perform(get("/api/admin/billing/drift").param("state", "nonsense")).andExpect(status().isBadRequest());
    }

    @Test
    void resolvingNeedsAReasonIsAuditedAndHappensOnce() throws Exception {
        long id = drift("PERSONAL", "QUANTITY", "sub_ops_" + salt + "/x");
        json("/api/admin/billing/drift/" + id + "/resolve", "{\"reason\":\"short\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("REASON_REQUIRED"));
        json("/api/admin/billing/drift/" + id + "/resolve", "{\"reason\":\"Fixed by hand in the Stripe dashboard\",\"note\":\"ticket 41\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.resolvedBy").value("admin"))
            .andExpect(jsonPath("$.note").value("Fixed by hand in the Stripe dashboard - ticket 41"));
        json("/api/admin/billing/drift/" + id + "/resolve", "{\"reason\":\"Fixed by hand in the Stripe dashboard\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DRIFT_RESOLVED"));
        json("/api/admin/billing/drift/999999999/resolve", "{\"reason\":\"Fixed by hand in the Stripe dashboard\"}").andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select count(*) from admin_audit_event where action = 'BILLING_DRIFT_RESOLVE' and target_id = ?", Long.class, "drift:" + id)).isEqualTo(1L);
    }

    @Test
    void replayingARecordedSubscriptionUpdatedEventFixesTheMirrorAndRecordsWhereItCameFrom() throws Exception {
        String evt = "evt_ops_" + salt;
        fake.events.put(evt, new StripeWebhookEvent(
            evt, "customer.subscription.updated", Instant.now(), "subscription", sub.getStripeCustomerId(), sub.getStripeSubscriptionId(), "active", "price_env_monthly",
            sub.getCurrentPeriodEnd(), false, null, null, null, "kiwiply", null, "personal", null, null, List.of(new StripeWebhookEvent.Item("si_x", "price_env_monthly", 1)), null, null, null, null
        ));

        json("/api/admin/billing/events/" + evt + "/replay", "{\"reason\":\"too short\"}").andExpect(status().isUnprocessableEntity());
        json("/api/admin/billing/events/" + evt + "/replay", "{\"reason\":\"Webhook was lost during the outage\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.replayEventId").value("replay:" + evt + ":1"))
            .andExpect(jsonPath("$.originalEventId").value(evt))
            .andExpect(jsonPath("$.scope").value("personal"))
            .andExpect(jsonPath("$.status").value("ok"));

        em.flush();
        em.clear();
        assertThat(subscriptions.findOneByStripeSubscriptionId(sub.getStripeSubscriptionId()).orElseThrow().getStatus()).isEqualTo("active");
        StripeEvent row = stripeEvents.findById("replay:" + evt + ":1").orElseThrow();
        assertThat(row.getReplayedFrom()).isEqualTo(evt);
        assertThat(row.getReplayedBy()).isEqualTo("admin");
        assertThat(row.getType()).isEqualTo("customer.subscription.updated");
        assertThat(row.getStatus()).isEqualTo("ok");
        assertThat(jdbc.queryForObject("select count(*) from admin_audit_event where action = 'BILLING_EVENT_REPLAY' and target_id = ?", Long.class, evt)).isEqualTo(1L);
        assertThat(fake.itemCalls).as("a replay never writes to Stripe").isEmpty();
        assertThat(fake.invoiceItemCalls).isEmpty();

        // A second replay is its own row.
        json("/api/admin/billing/events/" + evt + "/replay", "{\"reason\":\"Replaying once more to be sure\"}").andExpect(status().isOk()).andExpect(jsonPath("$.replayEventId").value("replay:" + evt + ":2"));
    }

    @Test
    void anUnknownEventABadIdAndBillingOffAreRefusedPlainly() throws Exception {
        json("/api/admin/billing/events/evt_nope_" + salt + "/replay", "{\"reason\":\"Webhook was lost during the outage\"}").andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("EVENT_NOT_FOUND"));
        json("/api/admin/billing/events/not-an-event/replay", "{\"reason\":\"Webhook was lost during the outage\"}").andExpect(status().isBadRequest());
        fake.enabled = false;
        json("/api/admin/billing/events/evt_any_" + salt + "/replay", "{\"reason\":\"Webhook was lost during the outage\"}").andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("BILLING_DISABLED"));
    }

    @Test
    @WithMockUser(username = "user")
    void aNonAdminCannotUseAnyOfIt() throws Exception {
        mockMvc.perform(get("/api/admin/billing/attention")).andExpect(status().isForbidden());
        json("/api/admin/billing/events/evt_x_" + salt + "/replay", "{\"reason\":\"Webhook was lost during the outage\"}").andExpect(status().isForbidden());
    }
}
