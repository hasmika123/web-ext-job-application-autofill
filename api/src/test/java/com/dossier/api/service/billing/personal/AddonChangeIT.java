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
import com.dossier.api.domain.sub.SubscriptionAddon;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.sub.PersonalSubscriptionChangeRepository;
import com.dossier.api.repository.sub.SubscriptionAddonRepository;
import com.dossier.api.service.billing.StripeGateway.ItemQuantity;
import com.jayway.jsonpath.JsonPath;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
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
 * K5.4 (and the add-on half of K5.2/K5.7 it needs): a subscriber changes add-ons. Confirm records the change and the add-on rows in Kiwiply, then the applier
 * updates the Stripe items with {@code proration_behavior=none} and creates the proration invoice item with the quote's amount. A removal keeps the add-on
 * until the period end and can be undone; a Stripe failure leaves the customer with what they bought and the retry finishes it with the same keys.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "user")
@Import({ SubFixtures.CatalogPortConfig.class, SubFixtures.FakeGatewayConfig.class })
class AddonChangeIT {

    @Autowired private MockMvc mockMvc;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private UserRepository users;
    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private SubscriptionAddonRepository addons;
    @Autowired private PersonalSubscriptionChangeRepository changes;
    @Autowired private FakeStripeGateway fake;
    @Autowired private SubscriptionChangeApplier applier;
    @Autowired private SubscriptionChangeService changeService;

    private SubFixtures.Plan plan;
    private Subscription sub;
    private Instant periodEnd;

    @BeforeEach
    void subscriber() {
        fake.reset();
        plan = SubFixtures.publishedPlan(jdbc);
        SubFixtures.standardPrices(jdbc);
        User user = users.findOneByLogin("user").orElseThrow();
        sub = subscriptions.findOneByUserId(user.getId()).orElseGet(Subscription::new);
        periodEnd = Instant.now().plus(20, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
        sub.setUser(user);
        sub.setStatus("active");
        sub.setPlan("PRO");
        sub.setPriceId(SubFixtures.BASE_MONTH);
        sub.setStripeCustomerId("cus_chg_1");
        sub.setStripeSubscriptionId("sub_chg_1");
        sub.setCurrentPeriodEnd(periodEnd);
        sub.setCurrentPeriodStart(periodEnd.minus(30, ChronoUnit.DAYS));
        sub.setPlanVersionId(plan.versionId());
        sub.setBillingInterval("MONTH");
        sub.setCurrency("USD");
        sub.setCancelAtPeriodEnd(false);
        sub = subscriptions.saveAndFlush(sub);
        holdAi(1);
    }

    /** Make the JDBC view and the persistence context agree: flush what the services saved, drop what JDBC changed behind JPA's back. */
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

    private String changeQuote(int aiQuantity) throws Exception {
        String addonsJson = aiQuantity == 0 ? "[]" : "[{\"featureKey\":\"ai.credits_extra\",\"quantity\":" + aiQuantity + "}]";
        return changeQuoteResult(addonsJson).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private ResultActions changeQuoteResult(String addonsJson) throws Exception {
        return mockMvc.perform(post("/api/billing/quotes").contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"CHANGE\",\"addons\":" + addonsJson + "}"));
    }

    private static long idOf(String body) {
        return ((Number) JsonPath.read(body, "$.quoteId")).longValue();
    }

    private ResultActions confirm(long quoteId, String key) throws Exception {
        var req = post("/api/billing/quotes/" + quoteId + "/confirm").contentType(MediaType.APPLICATION_JSON).content("{}");
        return mockMvc.perform(key == null ? req : req.header("Idempotency-Key", key));
    }

    @Test
    void addingAUnitProratesGrantsNowAndTellsStripeOnceWithTheQuotedAmount() throws Exception {
        String quote = changeQuote(2);
        long quoteId = idOf(quote);
        int proration = JsonPath.read(quote, "$.additions[0].prorationMinor");
        assertThat(proration).as("about 20 of 30 days of 499").isBetween(325, 340);
        assertThat((int) JsonPath.read(quote, "$.prorationEstimateMinor")).isEqualTo(proration);
        assertThat((int) JsonPath.read(quote, "$.deltaMinor")).isEqualTo(499);
        assertThat((int) JsonPath.read(quote, "$.current.recurringMinor")).isEqualTo(1999 + 499);
        assertThat((int) JsonPath.read(quote, "$.proposed.recurringMinor")).isEqualTo(1999 + 998);
        assertThat((int) JsonPath.read(quote, "$.nextInvoiceEstimateMinor")).isEqualTo(1999 + 998 + proration);

        String key = UUID.randomUUID().toString();
        confirm(quoteId, key)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.batchId").value(key))
            .andExpect(jsonPath("$.changes.length()").value(1))
            .andExpect(jsonPath("$.changes[0].kind").value("CHANGE_QUANTITY"))
            .andExpect(jsonPath("$.changes[0].quantityFrom").value(1))
            .andExpect(jsonPath("$.changes[0].quantityTo").value(2))
            .andExpect(jsonPath("$.changes[0].prorationMinor").value(proration))
            .andExpect(jsonPath("$.changes[0].status").value("APPLIED"))
            .andExpect(jsonPath("$.proposedRecurringMinor").value(1999 + 998));

        assertThat(fake.itemCalls).hasSize(1);
        assertThat(fake.itemCalls.get(0).key()).isEqualTo("sc-" + key + "-items");
        assertThat(fake.itemCalls.get(0).subscriptionId()).isEqualTo("sub_chg_1");
        assertThat(fake.itemCalls.get(0).items()).containsExactly(new ItemQuantity(SubFixtures.BASE_MONTH, 1), new ItemQuantity(SubFixtures.AI_MONTH, 2));
        assertThat(fake.invoiceItemCalls).hasSize(1);
        assertThat(fake.invoiceItemCalls.get(0).amountMinor()).isEqualTo(proration);
        assertThat(fake.invoiceItemCalls.get(0).description()).startsWith("Prorated: ");
        assertThat(fake.invoiceItemCalls.get(0).key()).startsWith("sc-");
        assertThat(fake.invoiceItemCalls.get(0).metadata()).containsKey("subscription_change_id");
        assertThat(addons.findFirstBySubscriptionIdAndFeatureKeyAndLiveTrue(sub.getId(), "ai.credits_extra").orElseThrow().getQuantity()).isEqualTo(2);
        sync();
        assertThat(jdbc.queryForObject("select status from subscription_quote where id = ?", String.class, quoteId)).isEqualTo("APPLIED");

        // The same key again: the same batch, no second Stripe effect.
        confirm(quoteId, key).andExpect(status().isOk()).andExpect(jsonPath("$.batchId").value(key)).andExpect(jsonPath("$.changes.length()").value(1));
        assertThat(fake.itemCalls).hasSize(1);
        assertThat(fake.invoiceItemCalls).hasSize(1);
        // Another key on a used quote is refused.
        confirm(quoteId, UUID.randomUUID().toString()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("QUOTE_STALE")).andExpect(jsonPath("$.reason").value("QUOTE_APPLIED"));
    }

    @Test
    void aRemovalKeepsTheAddonUntilThePeriodEndAndCanBeUndone() throws Exception {
        String quote = changeQuote(0);
        assertThat((String) JsonPath.read(quote, "$.removals[0].featureKey")).isEqualTo("ai.credits_extra");
        assertThat((String) JsonPath.read(quote, "$.removals[0].note")).contains("no refund");
        assertThat((int) JsonPath.read(quote, "$.prorationEstimateMinor")).isZero();
        String key = UUID.randomUUID().toString();
        confirm(idOf(quote), key).andExpect(status().isOk()).andExpect(jsonPath("$.changes[0].kind").value("REMOVE_ADDON")).andExpect(jsonPath("$.changes[0].status").value("PENDING"));
        sync();
        long changeId = jdbc.queryForObject("select id from personal_subscription_change where batch_id = ?", Long.class, key);

        // Stripe's item is already out; Kiwiply keeps the add-on until the period end.
        assertThat(fake.itemCalls.get(0).items()).containsExactly(new ItemQuantity(SubFixtures.BASE_MONTH, 1));
        assertThat(fake.invoiceItemCalls).isEmpty();
        SubscriptionAddon row = addons.findFirstBySubscriptionIdAndFeatureKeyAndLiveTrue(sub.getId(), "ai.credits_extra").orElseThrow();
        assertThat(row.isLive()).isTrue();
        assertThat(row.getEndsAt()).isEqualTo(periodEnd);
        mockMvc
            .perform(get("/api/billing/me"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.planKey").value("TQ"))
            .andExpect(jsonPath("$.interval").value("MONTH"))
            .andExpect(jsonPath("$.addons[0].featureKey").value("ai.credits_extra"))
            .andExpect(jsonPath("$.addons[0].endsAt").isNotEmpty())
            .andExpect(jsonPath("$.pendingChanges[0].id").value(changeId))
            .andExpect(jsonPath("$.recurringMinor").value(1999));
        mockMvc.perform(get("/api/entitlements/me")).andExpect(status().isOk()).andExpect(jsonPath("$.capabilities").value(org.hamcrest.Matchers.hasItem("ai.credits_extra")));

        // Undo: Stripe first (the item goes back), then Kiwiply drops the schedule.
        mockMvc.perform(delete("/api/billing/changes/" + changeId)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(fake.itemCalls).hasSize(2);
        assertThat(fake.itemCalls.get(1).key()).isEqualTo("un-" + changeId);
        assertThat(fake.itemCalls.get(1).items()).containsExactly(new ItemQuantity(SubFixtures.BASE_MONTH, 1), new ItemQuantity(SubFixtures.AI_MONTH, 1));
        assertThat(addons.findFirstBySubscriptionIdAndFeatureKeyAndLiveTrue(sub.getId(), "ai.credits_extra").orElseThrow().getEndsAt()).isNull();
        mockMvc.perform(delete("/api/billing/changes/" + changeId)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOT_PENDING"));
    }

    @Test
    void aScheduledRemovalClosesTheAddonWhenItsDateArrives() throws Exception {
        String key = UUID.randomUUID().toString();
        confirm(idOf(changeQuote(0)), key).andExpect(status().isOk());
        sync();
        jdbc.update("update subscription_addon set ends_at = ? where subscription_id = ?", Timestamp.from(Instant.now().minusSeconds(5)), sub.getId());
        jdbc.update("update personal_subscription_change set effective_at = ? where batch_id = ?", Timestamp.from(Instant.now().minusSeconds(5)), key);
        sync();
        assertThat(changeService.settleDue(Instant.now())).isEqualTo(1);
        sync();
        assertThat(jdbc.queryForObject("select count(*) from subscription_addon where subscription_id = ? and live = true", Integer.class, sub.getId())).isZero();
        assertThat(jdbc.queryForObject("select status from personal_subscription_change where batch_id = ?", String.class, key)).isEqualTo("APPLIED");
        assertThat(changeService.settleDue(Instant.now())).as("settling is idempotent").isZero();
    }

    @Test
    void aDecreaseIsScheduledToo() throws Exception {
        jdbc.update("update subscription_addon set quantity = 3 where subscription_id = ?", sub.getId());
        sync();
        String key = UUID.randomUUID().toString();
        confirm(idOf(changeQuote(1)), key).andExpect(status().isOk()).andExpect(jsonPath("$.changes[0].kind").value("CHANGE_QUANTITY")).andExpect(jsonPath("$.changes[0].status").value("PENDING"));
        assertThat(fake.itemCalls.get(0).items()).containsExactly(new ItemQuantity(SubFixtures.BASE_MONTH, 1), new ItemQuantity(SubFixtures.AI_MONTH, 1));
        // still entitled to 3 until the period end
        assertThat(addons.findFirstBySubscriptionIdAndFeatureKeyAndLiveTrue(sub.getId(), "ai.credits_extra").orElseThrow().getQuantity()).isEqualTo(3);
        mockMvc.perform(get("/api/billing/me")).andExpect(jsonPath("$.addons[0].quantity").value(3)).andExpect(jsonPath("$.addons[0].pendingQuantity").value(1));
    }

    @Test
    void aStripeFailureLeavesTheCustomerWithWhatTheyBoughtAndTheRetryUsesTheSameKeys() throws Exception {
        fake.failNextWrites = 1;
        String key = UUID.randomUUID().toString();
        confirm(idOf(changeQuote(2)), key).andExpect(status().isOk()).andExpect(jsonPath("$.changes[0].status").value("FAILED"));
        assertThat(addons.findFirstBySubscriptionIdAndFeatureKeyAndLiveTrue(sub.getId(), "ai.credits_extra").orElseThrow().getQuantity()).as("granted already").isEqualTo(2);
        assertThat(fake.effectiveItemCalls()).isZero();

        assertThat(applier.retryFailed()).isEqualTo(1);
        sync();
        assertThat(jdbc.queryForObject("select status from personal_subscription_change where batch_id = ?", String.class, key)).isEqualTo("APPLIED");
        assertThat(fake.effectiveItemCalls()).isEqualTo(1);
        assertThat(fake.effectiveInvoiceItems()).isEqualTo(1);
        assertThat(fake.itemCalls).extracting(c -> c.key()).containsOnly("sc-" + key + "-items");
        assertThat(applier.retryFailed()).as("nothing left to retry").isZero();
    }

    @Test
    void aRefusalStripeWillRepeatIsNotRetried() throws Exception {
        fake.failNextWrites = 1;
        fake.failKind = com.dossier.api.service.billing.StripeGatewayException.Kind.INVALID_REQUEST;
        String key = UUID.randomUUID().toString();
        confirm(idOf(changeQuote(2)), key).andExpect(status().isOk()).andExpect(jsonPath("$.changes[0].status").value("FAILED"));
        assertThat(applier.retryFailed()).isZero();
        sync();
        assertThat(jdbc.queryForObject("select failed_reason from personal_subscription_change where batch_id = ?", String.class, key)).startsWith("INVALID_REQUEST");
    }

    @Test
    void confirmRefusesWhatItShould() throws Exception {
        long quoteId = idOf(changeQuote(2));
        confirm(quoteId, null).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REQUIRED"));
        confirm(quoteId, "not-a-uuid").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REQUIRED"));

        fake.enabled = false;
        confirm(quoteId, UUID.randomUUID().toString()).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("BILLING_DISABLED"));
        fake.enabled = true;

        jdbc.update("update product_price set amount_minor = 599 where stripe_price_id = ?", SubFixtures.AI_MONTH);
        confirm(quoteId, UUID.randomUUID().toString()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("QUOTE_STALE")).andExpect(jsonPath("$.reason").value("PRICE_CHANGED"));
        jdbc.update("update product_price set amount_minor = 499 where stripe_price_id = ?", SubFixtures.AI_MONTH);

        sub.setCancelAtPeriodEnd(true);
        subscriptions.saveAndFlush(sub);
        confirm(quoteId, UUID.randomUUID().toString()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CANCEL_PENDING"));
        assertThat(fake.itemCalls).isEmpty();
        sync();
        assertThat(jdbc.queryForObject("select count(*) from personal_subscription_change where subscription_id = ?", Integer.class, sub.getId())).isZero();
    }

    @Test
    void aChangeQuoteWithNothingToChangeOrAnUnpublishedTargetPlanIsRefused() throws Exception {
        changeQuoteResult("[{\"featureKey\":\"ai.credits_extra\",\"quantity\":1}]").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("NO_CHANGE"));
        // K5.6 lifted PLAN_SWITCH_UNSUPPORTED: switching is real now (SubscriptionSwitchIT); a plan nobody can buy is simply not sellable
        mockMvc
            .perform(post("/api/billing/quotes").contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"CHANGE\",\"planKey\":\"AUTOPILOT\",\"addons\":[]}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("PLAN_NOT_SELLABLE"));
    }

    @Test
    void anAddonWithAScheduledChangeMustBeUndoneBeforeItIsChangedAgain() throws Exception {
        confirm(idOf(changeQuote(0)), UUID.randomUUID().toString()).andExpect(status().isOk());
        changeQuoteResult("[{\"featureKey\":\"ai.credits_extra\",\"quantity\":2}]").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REMOVAL_PENDING")).andExpect(jsonPath("$.featureKey").value("ai.credits_extra"));
    }

    @Test
    void aCheckoutQuoteCannotBeConfirmedAndAChangeQuoteCannotCheckOut() throws Exception {
        long changeQuoteId = idOf(changeQuote(2));
        mockMvc.perform(post("/api/billing/quotes/" + changeQuoteId + "/checkout").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INVALID_KIND"));
        assertThat(fake.checkoutSpecs).isEmpty();
    }
}
