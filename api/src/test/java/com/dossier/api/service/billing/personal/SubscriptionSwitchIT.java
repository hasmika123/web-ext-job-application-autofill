package com.dossier.api.service.billing.personal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.sub.PersonalSubscriptionChange;
import com.dossier.api.domain.sub.SubscriptionAddon;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.sub.PersonalSubscriptionChangeRepository;
import com.dossier.api.repository.sub.SubscriptionAddonRepository;
import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.billing.StripeWebhookEvent;
import com.dossier.api.service.billing.UserBillingHandler;
import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import com.fasterxml.jackson.databind.node.BooleanNode;
import com.jayway.jsonpath.JsonPath;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * K5.6 (API half) and K9.2: a subscriber switches plan or interval. An upgrade swaps the base now and charges the quoted proration; a downgrade or an interval
 * change is handed to a Stripe schedule for the end of the period (or annual term), with the successor-subscription fallback when Stripe refuses; nothing is
 * refunded, nothing is charged twice, access never changes before what was paid for ends. (SubscriptionSwitchTest, IntervalSwitchIT, MidCycleRulesTest.)
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "user")
@Import({ SubFixtures.CatalogPortConfig.class, SubscriptionSwitchIT.SwitchGatewayConfig.class })
class SubscriptionSwitchIT {

    /** The scripted gateway plus the schedule and successor-subscription calls the switch uses. */
    static class SwitchFake extends FakeStripeGateway {

        record ScheduleCall(String subscriptionId, List<ItemQuantity> phase, Instant at, String key) {}

        record SuccessorCall(String customerId, List<ItemQuantity> items, Instant startBillingAt, Map<String, String> metadata) {}

        boolean refuseSchedule = false;
        final List<ScheduleCall> schedules = new ArrayList<>();
        final List<String> released = new ArrayList<>();
        final List<String> cancelAtPeriodEnd = new ArrayList<>();
        final List<SuccessorCall> successors = new ArrayList<>();
        final List<String> cancelled = new ArrayList<>();

        @Override
        public void reset() {
            super.reset();
            refuseSchedule = false;
            schedules.clear();
            released.clear();
            cancelAtPeriodEnd.clear();
            successors.clear();
            cancelled.clear();
        }

        @Override
        public String createSchedule(String subscriptionId, List<ItemQuantity> phaseItems, Instant at, IdempotencyKey key) {
            if (refuseSchedule) throw new StripeGatewayException("mixed intervals", StripeGatewayException.Kind.INVALID_REQUEST, "schedule_interval", null);
            schedules.add(new ScheduleCall(subscriptionId, List.copyOf(phaseItems), at, key.value()));
            return "sub_sched_" + schedules.size();
        }

        @Override
        public void releaseSchedule(String scheduleId, IdempotencyKey key) {
            released.add(scheduleId);
        }

        @Override
        public void setCancelAtPeriodEnd(String subscriptionId, boolean cancel, IdempotencyKey key) {
            if (cancel) cancelAtPeriodEnd.add(subscriptionId);
        }

        @Override
        public void cancelSubscription(String subscriptionId) {
            cancelled.add(subscriptionId);
        }

        @Override
        public String createSubscription(String customerId, List<ItemQuantity> items, Instant startBillingAt, Map<String, String> metadata, IdempotencyKey key) {
            successors.add(new SuccessorCall(customerId, List.copyOf(items), startBillingAt, metadata));
            return "sub_succ_" + successors.size();
        }
    }

    @TestConfiguration
    static class SwitchGatewayConfig {

        @Bean
        @Primary
        SwitchFake switchFake() {
            return new SwitchFake();
        }
    }

    private static final String BASE2_MONTH = "price_tq2_base_m";
    private static final String BASE2_QUARTER = "price_tq2_base_q";
    private static final String BASE_YEAR = "price_tq_base_y";
    private static final String AI_YEAR = "price_tq_ai_y";

    @Autowired private MockMvc mockMvc;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private UserRepository users;
    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private SubscriptionAddonRepository addons;
    @Autowired private PersonalSubscriptionChangeRepository changes;
    @Autowired private SwitchFake fake;
    @Autowired private SubscriptionChangeService changeService;
    @Autowired private UserBillingHandler handler;
    @Autowired private SettingsService settings;
    @Autowired private com.dossier.api.service.ResumeBuilderSettings rbs;

    private SubFixtures.Plan tq;
    private long tq2VersionId;
    private Subscription sub;
    private Instant periodEnd;

    /** The settings cache survives the rollback of a test that wrote a setting: drop it around every test. */
    @org.junit.jupiter.api.AfterEach
    void dropSettingsCache() {
        rbs.invalidate();
    }

    @BeforeEach
    void subscriber() {
        rbs.invalidate();
        fake.reset();
        tq = SubFixtures.publishedPlan(jdbc);
        SubFixtures.standardPrices(jdbc);
        // the second plan: the AUTOPILOT product as base, the same components
        Instant now = Instant.now();
        long autopilot = jdbc.queryForObject("SELECT id FROM product WHERE code = 'AUTOPILOT'", Long.class);
        jdbc.update("INSERT INTO plan (plan_key, name, audience, status, `public`, sort_order, created_at, created_by) VALUES ('TQ2', 'Test plan two', 'INDIVIDUAL', 'PUBLISHED', TRUE, 6, ?, 'test')", Timestamp.from(now));
        long planId = jdbc.queryForObject("SELECT id FROM plan WHERE plan_key = 'TQ2'", Long.class);
        jdbc.update(
            "INSERT INTO plan_version (plan_id, version, status, base_product_id, intervals_json, ai_budget_cap_cents, created_at, created_by, updated_at, published_at, published_by, effective_from) " +
                "VALUES (?, 1, 'PUBLISHED', ?, '[\"MONTH\",\"QUARTER\"]', 600, ?, 'test', ?, ?, 'test', ?)",
            planId, autopilot, Timestamp.from(now), Timestamp.from(now), Timestamp.from(now), Timestamp.from(now.minus(1, ChronoUnit.DAYS))
        );
        tq2VersionId = jdbc.queryForObject("SELECT id FROM plan_version WHERE plan_id = ? AND version = 1", Long.class, planId);
        jdbc.update(
            "INSERT INTO plan_component (plan_version_id, feature_key, role, product_id, allowance_override, default_quantity, max_quantity, sort_order) " +
                "SELECT ?, c.feature_key, c.role, c.product_id, c.allowance_override, c.default_quantity, c.max_quantity, c.sort_order FROM plan_component c WHERE c.plan_version_id = ?",
            tq2VersionId, tq.versionId()
        );
        SubFixtures.price(jdbc, "AUTOPILOT", "MONTH", 3999, BASE2_MONTH);
        SubFixtures.price(jdbc, "AUTOPILOT", "QUARTER", 9999, BASE2_QUARTER);

        User user = users.findOneByLogin("user").orElseThrow();
        sub = subscriptions.findOneByUserId(user.getId()).orElseGet(Subscription::new);
        periodEnd = Instant.now().plus(20, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
        sub.setUser(user);
        sub.setStatus("active");
        sub.setPlan("PRO");
        sub.setPriceId(SubFixtures.BASE_MONTH);
        sub.setStripeCustomerId("cus_sw_1");
        sub.setStripeSubscriptionId("sub_sw_1");
        sub.setCurrentPeriodEnd(periodEnd);
        sub.setCurrentPeriodStart(periodEnd.minus(30, ChronoUnit.DAYS));
        sub.setPlanVersionId(tq.versionId());
        sub.setBillingInterval("MONTH");
        sub.setCurrency("USD");
        sub.setCancelAtPeriodEnd(false);
        sub = subscriptions.saveAndFlush(sub);
        holdAi(1);
    }

    private void sync() {
        em.flush();
        em.clear();
    }

    private SubscriptionAddon holdAi(int qty) {
        SubscriptionAddon row = new SubscriptionAddon();
        row.setSubscriptionId(sub.getId());
        row.setUserId(sub.getUser().getId());
        row.setFeatureKey("ai.credits_extra");
        row.setProductId(jdbc.queryForObject("select id from product where code = 'FEAT_AI_CREDITS'", Long.class));
        row.setPriceId(jdbc.queryForObject("select id from product_price where stripe_price_id = ?", Long.class, SubFixtures.AI_MONTH));
        row.setQuantity(qty);
        row.setStripeItemId("si_ai");
        row.setStartsAt(Instant.now().minus(5, ChronoUnit.DAYS));
        row.setLive(true);
        row.setCreatedAt(Instant.now());
        row.setUpdatedAt(Instant.now());
        return addons.saveAndFlush(row);
    }

    /** Move the subscription onto TQ2 (Autopilot base) on a monthly term. */
    private void ontoTq2() {
        sub.setPriceId(BASE2_MONTH);
        sub.setPlanVersionId(tq2VersionId);
        sub = subscriptions.saveAndFlush(sub);
    }

    private static final String KEEP_AI = "[{\"featureKey\":\"ai.credits_extra\",\"quantity\":1}]";

    private ResultActions quote(String planKey, String interval, String addonsJson) throws Exception {
        StringBuilder body = new StringBuilder("{\"kind\":\"CHANGE\"");
        if (planKey != null) body.append(",\"planKey\":\"").append(planKey).append("\"");
        if (interval != null) body.append(",\"interval\":\"").append(interval).append("\"");
        body.append(",\"addons\":").append(addonsJson).append("}");
        return mockMvc.perform(post("/api/billing/quotes").contentType(MediaType.APPLICATION_JSON).content(body.toString()));
    }

    private String quoteOk(String planKey, String interval, String addonsJson) throws Exception {
        return quote(planKey, interval, addonsJson).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private ResultActions confirm(String quoteBody) throws Exception {
        long id = ((Number) JsonPath.read(quoteBody, "$.quoteId")).longValue();
        return mockMvc.perform(post("/api/billing/quotes/" + id + "/confirm").contentType(MediaType.APPLICATION_JSON).content("{}").header("Idempotency-Key", UUID.randomUUID().toString()));
    }

    private StripeWebhookEvent event(String type, String subscriptionId, String status, String priceId, Boolean cancelAtPeriodEnd, Instant created) {
        return new StripeWebhookEvent(
            "evt_" + UUID.randomUUID(), type, created, "subscription", "cus_sw_1", subscriptionId, status, priceId, periodEnd, cancelAtPeriodEnd, null, null, null, "kiwiply"
        );
    }

    // ---- upgrade now ---------------------------------------------------------------------------------------------------

    @Test
    void anUpgradeSwapsTheBaseNowChargesTheQuotedProrationAndMovesThePlanLink() throws Exception {
        String q = quoteOk("TQ2", null, KEEP_AI);
        assertThat((String) JsonPath.read(q, "$.effectiveAt")).isEqualTo("now");
        assertThat((String) JsonPath.read(q, "$.plan.planKey")).isEqualTo("TQ2");
        int proration = JsonPath.read(q, "$.prorationEstimateMinor");
        assertThat(proration).as("the new base, 20 of 30 days: no credit for the old base").isBetween(2655, 2675);
        assertThat((int) JsonPath.read(q, "$.proposed.recurringMinor")).isEqualTo(3999 + 499);
        assertThat((int) JsonPath.read(q, "$.current.recurringMinor")).isEqualTo(1999 + 499);

        confirm(q).andExpect(status().isOk()).andExpect(jsonPath("$.changes[?(@.kind=='PLAN_SWITCH')].status").value("APPLIED"));
        assertThat(fake.itemCalls).hasSize(1);
        assertThat(fake.itemCalls.get(0).items()).extracting(i -> i.priceId() + "x" + i.quantity()).containsExactlyInAnyOrder(BASE2_MONTH + "x1", SubFixtures.AI_MONTH + "x1");
        assertThat(fake.invoiceItemCalls).hasSize(1);
        assertThat(fake.invoiceItemCalls.get(0).amountMinor()).isEqualTo(proration);
        sync();
        Subscription after = subscriptions.findById(sub.getId()).orElseThrow();
        assertThat(after.getPlanVersionId()).isEqualTo(tq2VersionId);
        assertThat(after.getPriceId()).isEqualTo(BASE2_MONTH);
        assertThat(after.getScheduledAt()).isNull();
    }

    @Test
    void anUpgradeThatDropsAnAddOnKeepsItUntilThePeriodEndWithNoRefund() throws Exception {
        String q = quoteOk("TQ2", null, "[]");
        assertThat((String) JsonPath.read(q, "$.removals[0].featureKey")).isEqualTo("ai.credits_extra");
        confirm(q).andExpect(status().isOk());
        assertThat(fake.itemCalls.get(0).items()).extracting(i -> i.priceId()).containsExactly(BASE2_MONTH);
        sync();
        SubscriptionAddon row = addons.findFirstBySubscriptionIdAndFeatureKeyAndLiveTrue(sub.getId(), "ai.credits_extra").orElseThrow();
        assertThat(row.getEndsAt()).isEqualTo(periodEnd);
    }

    @Test
    void thePriceDifferenceSettingChargesOnlyTheDifference() throws Exception {
        settings.set(BillingSettingKeys.UPGRADE_PRORATION, com.fasterxml.jackson.databind.node.TextNode.valueOf("DIFFERENCE"), "Test: charge only the price difference on an upgrade");
        String q = quoteOk("TQ2", null, KEEP_AI);
        assertThat((int) JsonPath.read(q, "$.prorationEstimateMinor")).isBetween(1325, 1345); // 2000 * 20/30
    }

    // ---- downgrade and interval change at the end of the period -------------------------------------------------------------

    @Test
    void aDowngradeIsScheduledAtThePeriodEndWithNothingChangingToday() throws Exception {
        ontoTq2();
        String q = quoteOk("TQ", null, KEEP_AI);
        assertThat((String) JsonPath.read(q, "$.effectiveAt")).isEqualTo(periodEnd.toString());
        assertThat((int) JsonPath.read(q, "$.prorationEstimateMinor")).isZero();
        assertThat((int) JsonPath.read(q, "$.proposed.recurringMinor")).isEqualTo(1999 + 499);

        confirm(q).andExpect(status().isOk()).andExpect(jsonPath("$.changes[?(@.kind=='PLAN_SWITCH')].status").value("PENDING"));
        assertThat(fake.itemCalls).as("no Stripe item changes today").isEmpty();
        assertThat(fake.invoiceItemCalls).isEmpty();
        assertThat(fake.schedules).hasSize(1);
        assertThat(fake.schedules.get(0).at()).isEqualTo(periodEnd);
        assertThat(fake.schedules.get(0).phase()).extracting(i -> i.priceId()).containsExactlyInAnyOrder(SubFixtures.BASE_MONTH, SubFixtures.AI_MONTH);
        sync();
        Subscription after = subscriptions.findById(sub.getId()).orElseThrow();
        assertThat(after.getPlanVersionId()).as("features unchanged until then").isEqualTo(tq2VersionId);
        assertThat(after.getScheduledPlanVersionId()).isEqualTo(tq.versionId());
        assertThat(after.getScheduleId()).isEqualTo("sub_sched_1");
        assertThat(after.getScheduledAt()).isEqualTo(periodEnd);

        mockMvc.perform(get("/api/billing/me")).andExpect(jsonPath("$.pendingChanges[?(@.kind=='PLAN_SWITCH')].status").value("PENDING"));
    }

    @Test
    void aScheduledSwitchCanBeUndoneAndAnotherChangeWaitsForIt() throws Exception {
        ontoTq2();
        String q = quoteOk("TQ", null, KEEP_AI);
        String batch = confirm(q).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        int changeId = JsonPath.read(batch, "$.changes[0].id");
        quote(null, null, "[{\"featureKey\":\"ai.credits_extra\",\"quantity\":2}]").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SWITCH_PENDING"));

        mockMvc.perform(delete("/api/billing/changes/" + changeId)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(fake.released).containsExactly("sub_sched_1");
        sync();
        Subscription after = subscriptions.findById(sub.getId()).orElseThrow();
        assertThat(after.getScheduledAt()).isNull();
        assertThat(after.getScheduleId()).isNull();
        quote(null, null, "[{\"featureKey\":\"ai.credits_extra\",\"quantity\":2}]").andExpect(status().isOk());
    }

    @Test
    void monthlyToQuarterlyWaitsForTheRenewalAndChargesNothingToday() throws Exception {
        String q = quoteOk(null, "QUARTER", KEEP_AI);
        assertThat((String) JsonPath.read(q, "$.intervalChange.from")).isEqualTo("MONTH");
        assertThat((String) JsonPath.read(q, "$.intervalChange.to")).isEqualTo("QUARTER");
        assertThat((String) JsonPath.read(q, "$.effectiveAt")).isEqualTo(periodEnd.toString());
        assertThat((int) JsonPath.read(q, "$.prorationEstimateMinor")).isZero();
        assertThat((int) JsonPath.read(q, "$.proposed.recurringMinor")).isEqualTo(4999 + 1299);

        confirm(q).andExpect(status().isOk()).andExpect(jsonPath("$.changes[?(@.kind=='INTERVAL_SWITCH')].status").value("PENDING"));
        assertThat(fake.itemCalls).isEmpty();
        assertThat(fake.schedules.get(0).phase()).extracting(i -> i.priceId()).containsExactlyInAnyOrder(SubFixtures.BASE_QUARTER, SubFixtures.AI_QUARTER);
        sync();
        assertThat(subscriptions.findById(sub.getId()).orElseThrow().getScheduledInterval()).isEqualTo("QUARTER");
    }

    @Test
    void whenStripeRefusesTheScheduleTheSuccessorSubscriptionTakesOverWithNoGapAndNoDoubleCharge() throws Exception {
        fake.refuseSchedule = true;
        String q = quoteOk(null, "QUARTER", KEEP_AI);
        confirm(q).andExpect(status().isOk());
        assertThat(fake.itemCalls).as("the current subscription is not touched").isEmpty();
        assertThat(fake.invoiceItemCalls).isEmpty();
        assertThat(fake.cancelAtPeriodEnd).containsExactly("sub_sw_1");
        assertThat(fake.successors).hasSize(1);
        assertThat(fake.successors.get(0).startBillingAt()).as("billing starts at the period end, not before").isEqualTo(periodEnd);
        assertThat(fake.successors.get(0).items()).extracting(i -> i.priceId()).containsExactlyInAnyOrder(SubFixtures.BASE_QUARTER, SubFixtures.AI_QUARTER);
        sync();
        Subscription row = subscriptions.findById(sub.getId()).orElseThrow();
        assertThat(row.isCancelAtPeriodEnd()).isFalse();
        assertThat(row.getScheduleId()).isNull();
        assertThat(changes.findByStripeRef("sub:sub_succ_1")).hasSize(1);

        // the successor is created now (trialing until the switch instant): it must not take the row over, and our own end-at-period-end is not a cancellation
        Instant t = Instant.now();
        handler.apply(event("customer.subscription.created", "sub_succ_1", "trialing", SubFixtures.BASE_QUARTER, false, t));
        handler.apply(event("customer.subscription.updated", "sub_sw_1", "active", SubFixtures.BASE_MONTH, true, t.plusSeconds(1)));
        sync();
        row = subscriptions.findById(sub.getId()).orElseThrow();
        assertThat(row.getStripeSubscriptionId()).isEqualTo("sub_sw_1");
        assertThat(row.isCancelAtPeriodEnd()).isFalse();
        assertThat(row.getBillingInterval()).isEqualTo("MONTH");
        assertThat(com.dossier.api.service.EntitlementService.isProFor(row.getStatus(), row.getCurrentPeriodEnd(), Instant.now())).isTrue();

        // the period ends: the old subscription is deleted and the successor takes the row over in the same step
        handler.apply(event("customer.subscription.deleted", "sub_sw_1", "canceled", SubFixtures.BASE_MONTH, true, t.plusSeconds(2)));
        sync();
        row = subscriptions.findById(sub.getId()).orElseThrow();
        assertThat(row.getStripeSubscriptionId()).isEqualTo("sub_succ_1");
        assertThat(row.getStatus()).isEqualTo("active");
        assertThat(row.getBillingInterval()).isEqualTo("QUARTER");
        assertThat(row.getPriceId()).isEqualTo(SubFixtures.BASE_QUARTER);
        assertThat(row.getScheduledAt()).isNull();
        assertThat(com.dossier.api.service.EntitlementService.isProFor(row.getStatus(), row.getCurrentPeriodEnd(), Instant.now())).as("no entitlement gap").isTrue();
        assertThat(changes.findByStripeRef("sub:sub_succ_1").get(0).getStatus()).isEqualTo("APPLIED");
    }

    @Test
    void whenTheScheduledSwitchLandsTheWebhookMovesThePlanLink() throws Exception {
        ontoTq2();
        confirm(quoteOk("TQ", null, KEEP_AI)).andExpect(status().isOk());
        sync();
        Instant t = Instant.now();
        StripeWebhookEvent landed = new StripeWebhookEvent(
            "evt_land", "customer.subscription.updated", t, "subscription", "cus_sw_1", "sub_sw_1", "active", SubFixtures.AI_MONTH, periodEnd.plus(30, ChronoUnit.DAYS), false, null, null, null, "kiwiply",
            periodEnd, null, null, null,
            List.of(new StripeWebhookEvent.Item("si_ai", SubFixtures.AI_MONTH, 1), new StripeWebhookEvent.Item("si_base", SubFixtures.BASE_MONTH, 1)),
            null, "sub_sched_1", null, null
        );
        handler.apply(landed);
        sync();
        Subscription row = subscriptions.findById(sub.getId()).orElseThrow();
        assertThat(row.getPlanVersionId()).isEqualTo(tq.versionId());
        assertThat(row.getPriceId()).as("the base item is found even when it is not item 0").isEqualTo(SubFixtures.BASE_MONTH);
        assertThat(row.getScheduledAt()).isNull();
        assertThat(row.getScheduleId()).isNull();
        assertThat(jdbc.queryForObject("select status from personal_subscription_change where kind = 'PLAN_SWITCH' and subscription_id = ?", String.class, sub.getId())).isEqualTo("APPLIED");
    }

    @Test
    void cancellingWinsOverAScheduledSwitchAndTheScheduleIsReleased() throws Exception {
        confirm(quoteOk(null, "QUARTER", KEEP_AI)).andExpect(status().isOk());
        sync();
        handler.apply(event("customer.subscription.updated", "sub_sw_1", "active", SubFixtures.BASE_MONTH, true, Instant.now().plusSeconds(5)));
        sync();
        Subscription row = subscriptions.findById(sub.getId()).orElseThrow();
        assertThat(row.isCancelAtPeriodEnd()).isTrue();
        assertThat(row.getScheduledAt()).isNull();
        assertThat(jdbc.queryForObject("select status from personal_subscription_change where kind = 'INTERVAL_SWITCH' and subscription_id = ?", String.class, sub.getId())).isEqualTo("CANCELLED");
        assertThat(changeService.releaseOrphanSchedules()).isEqualTo(1);
        assertThat(fake.released).containsExactly("sub_sched_1");
        sync();
        assertThat(subscriptions.findById(sub.getId()).orElseThrow().getScheduleId()).isNull();
    }

    @Test
    void aCancelPendingSubscriptionCannotSwitch() throws Exception {
        sub.setCancelAtPeriodEnd(true);
        subscriptions.saveAndFlush(sub);
        quote("TQ2", null, KEEP_AI).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CANCEL_PENDING"));
    }

    // ---- annual terms (K9.2) -----------------------------------------------------------------------------------------------

    /** The subscription on a yearly term that started 100 days ago, with yearly price rows. */
    private void onAYearlyTerm() {
        SubFixtures.price(jdbc, "PRO", "YEAR", 21589, BASE_YEAR);
        SubFixtures.price(jdbc, "AUTOPILOT", "YEAR", 43179, "price_tq2_base_y");
        SubFixtures.price(jdbc, "FEAT_AI_CREDITS", "YEAR", 4999, AI_YEAR);
        jdbc.update("UPDATE plan_version SET intervals_json = '[\"MONTH\",\"QUARTER\",\"YEAR\"]' WHERE id IN (?, ?)", tq.versionId(), tq2VersionId);
        Instant start = Instant.now().minus(100, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
        sub.setBillingInterval("YEAR");
        sub.setPriceId(BASE_YEAR);
        sub.setCurrentPeriodStart(start);
        periodEnd = start.plus(365, ChronoUnit.DAYS);
        sub.setCurrentPeriodEnd(periodEnd);
        subscriptions.saveAndFlush(sub);
        SubscriptionAddon ai = addons.findFirstBySubscriptionIdAndFeatureKeyAndLiveTrue(sub.getId(), "ai.credits_extra").orElseThrow();
        ai.setPriceId(jdbc.queryForObject("select id from product_price where stripe_price_id = ?", Long.class, AI_YEAR));
        addons.saveAndFlush(ai);
    }

    @Test
    void anAddOnOnAnAnnualTermIsProratedOnTheYearOverTheRemainingTermAndARemovalWaitsForTermEnd() throws Exception {
        onAYearlyTerm();
        String add = quoteOk(null, null, "[{\"featureKey\":\"ai.credits_extra\",\"quantity\":2}]");
        int proration = JsonPath.read(add, "$.additions[0].prorationMinor");
        assertThat(proration).as("4999 over the 265 remaining days of 365").isBetween(3620, 3640);

        String remove = quoteOk(null, null, "[]");
        assertThat((String) JsonPath.read(remove, "$.removals[0].effectiveAt")).isEqualTo(periodEnd.toString());
        assertThat((int) JsonPath.read(remove, "$.prorationEstimateMinor")).isZero();
        confirm(remove).andExpect(status().isOk());
        sync();
        assertThat(addons.findFirstBySubscriptionIdAndFeatureKeyAndLiveTrue(sub.getId(), "ai.credits_extra").orElseThrow().getEndsAt()).isEqualTo(periodEnd);
    }

    @Test
    void yearlyToMonthlyIsEffectiveAtTermEndWithNoCredit() throws Exception {
        onAYearlyTerm();
        String q = quoteOk(null, "MONTH", KEEP_AI);
        assertThat((String) JsonPath.read(q, "$.effectiveAt")).isEqualTo(periodEnd.toString());
        assertThat((String) JsonPath.read(q, "$.intervalChange.from")).isEqualTo("YEAR");
        assertThat((int) JsonPath.read(q, "$.prorationEstimateMinor")).as("no refund, no credit").isZero();
        confirm(q).andExpect(status().isOk());
        assertThat(fake.schedules.get(0).at()).isEqualTo(periodEnd);
        assertThat(fake.itemCalls).isEmpty();
    }

    @Test
    void monthlyToYearlyAppliesAtTheNextRenewalAndIsRefusedWhileAnnualIsOff() throws Exception {
        SubFixtures.price(jdbc, "PRO", "YEAR", 21589, BASE_YEAR);
        SubFixtures.price(jdbc, "FEAT_AI_CREDITS", "YEAR", 4999, AI_YEAR);
        jdbc.update("UPDATE plan_version SET intervals_json = '[\"MONTH\",\"QUARTER\",\"YEAR\"]' WHERE id = ?", tq.versionId());
        String q = quoteOk(null, "YEAR", KEEP_AI);
        assertThat((String) JsonPath.read(q, "$.effectiveAt")).isEqualTo(periodEnd.toString());
        assertThat((int) JsonPath.read(q, "$.prorationEstimateMinor")).isZero();

        settings.set(BillingSettingKeys.ANNUAL_ENABLED, BooleanNode.FALSE, "Test: switch yearly billing off");
        quote(null, "YEAR", KEEP_AI).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INTERVAL_NOT_AVAILABLE"));
    }

    @Test
    void anAnnualUpgradeProratesTheNewAnnualBaseOverTheRemainingTerm() throws Exception {
        onAYearlyTerm();
        String q = quoteOk("TQ2", null, KEEP_AI);
        assertThat((String) JsonPath.read(q, "$.effectiveAt")).isEqualTo("now");
        // 43179 over 265 of 365 days; the add-on is unchanged
        long expected = Math.round(43179.0 * 265 / 365);
        assertThat((int) JsonPath.read(q, "$.prorationEstimateMinor")).isBetween((int) expected - 25, (int) expected + 25);
    }
}
