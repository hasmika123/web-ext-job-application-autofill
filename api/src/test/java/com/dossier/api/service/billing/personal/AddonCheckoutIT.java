package com.dossier.api.service.billing.personal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.sub.SubscriptionAddonRepository;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.ItemQuantity;
import com.dossier.api.service.billing.StripeWebhookEvent;
import com.dossier.api.service.billing.UserBillingHandler;
import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
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
 * K5.3 (API half) and the webhook half of K5.2: a quote becomes a Stripe Checkout whose line items are exactly the quote's; the webhook then writes the
 * add-on rows, the plan link and the quote status from the subscription's items; the success data lists the add-ons; the legacy {@code plan: monthly|3mo}
 * alias uses the catalog when PRO is sellable there and keeps the environment prices otherwise.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "user")
@Import({ SubFixtures.CatalogPortConfig.class, SubFixtures.FakeGatewayConfig.class })
class AddonCheckoutIT {

    @Autowired private MockMvc mockMvc;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private UserRepository users;
    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private SubscriptionAddonRepository addons;
    @Autowired private FakeStripeGateway fake;
    @Autowired private UserBillingHandler webhook;

    private SubFixtures.Plan plan;
    private User user;

    @BeforeEach
    void data() {
        fake.reset();
        plan = SubFixtures.publishedPlan(jdbc);
        SubFixtures.standardPrices(jdbc);
        user = users.findOneByLogin("user").orElseThrow();
        subscriptions.findOneByUserId(user.getId()).ifPresent(s -> {
            subscriptions.delete(s);
            subscriptions.flush();
        });
    }

    private long quote(String interval, String addons) throws Exception {
        String body = mockMvc
            .perform(post("/api/billing/quotes").contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"CHECKOUT\",\"planKey\":\"TQ\",\"interval\":\"" + interval + "\",\"addons\":" + addons + "}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return ((Number) JsonPath.read(body, "$.quoteId")).longValue();
    }

    private ResultActions checkout(long quoteId, String json) throws Exception {
        return mockMvc.perform(post("/api/billing/quotes/" + quoteId + "/checkout").contentType(MediaType.APPLICATION_JSON).content(json));
    }

    @Test
    void theCheckoutLineItemsAreExactlyTheQuoteAndASecondClickReplaysTheSameSession() throws Exception {
        long id = quote("MONTH", "[{\"featureKey\":\"ai.credits_extra\",\"quantity\":2},{\"featureKey\":\"resume.extra_pack\",\"quantity\":1}]");
        checkout(id, "{\"returnTo\":\"/account/billing\"}").andExpect(status().isOk()).andExpect(jsonPath("$.url").value("https://checkout.test/co-" + id));

        assertThat(fake.checkoutSpecs).hasSize(1);
        StripeGateway.CheckoutSpec spec = fake.checkoutSpecs.get(0);
        assertThat(spec.lines()).containsExactly(new ItemQuantity(SubFixtures.BASE_MONTH, 1), new ItemQuantity(SubFixtures.AI_MONTH, 2), new ItemQuantity(SubFixtures.PACK_MONTH, 1));
        assertThat(spec.metadata()).containsEntry("quote_id", String.valueOf(id)).containsEntry("plan_version_id", String.valueOf(plan.versionId())).containsEntry("app", "kiwiply");
        assertThat(spec.userId()).isEqualTo(user.getId());
        assertThat(spec.successUrl()).contains("return_to=%2Faccount%2Fbilling");
        assertThat(spec.consentText()).contains("No refunds");
        assertThat(spec.allowPromotionCodes()).isFalse();
        assertThat(fake.checkoutKeys).containsExactly("co-" + id);

        Subscription sub = subscriptions.findOneByUserId(user.getId()).orElseThrow();
        assertThat(sub.getStripeCustomerId()).startsWith("cus_fake_");
        assertThat(sub.getStatus()).as("a checkout never makes anyone paid; only the webhook does").isEqualTo(Subscription.STATUS_NONE);

        checkout(id, "{}").andExpect(status().isOk()).andExpect(jsonPath("$.url").value("https://checkout.test/co-" + id));
        assertThat(fake.checkoutSpecs.get(1).customerId()).as("the customer is reused").isEqualTo(sub.getStripeCustomerId());
    }

    @Test
    void anUnsafeReturnPathIsDropped() throws Exception {
        long id = quote("MONTH", "[]");
        checkout(id, "{\"returnTo\":\"https://evil.example/x\"}").andExpect(status().isOk());
        assertThat(fake.checkoutSpecs.get(0).successUrl()).doesNotContain("return_to");
    }

    @Test
    void checkoutRefusesBillingOffAStaleQuoteAndAnAlreadyPaidSubscriber() throws Exception {
        long id = quote("MONTH", "[]");
        fake.enabled = false;
        checkout(id, "{}").andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("BILLING_DISABLED"));
        fake.enabled = true;

        jdbc.update("update product_price set amount_minor = 2099 where stripe_price_id = ?", SubFixtures.BASE_MONTH);
        checkout(id, "{}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("QUOTE_STALE")).andExpect(jsonPath("$.reason").value("PRICE_CHANGED"));
        jdbc.update("update product_price set amount_minor = 1999 where stripe_price_id = ?", SubFixtures.BASE_MONTH);

        fake.liveSubscription = true;
        subscriptions.saveAndFlush(rowWith("cus_known"));
        checkout(id, "{}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_SUBSCRIBED"));
        assertThat(fake.checkoutSpecs).isEmpty();
    }

    @Test
    void aPriceWithoutAStripeCounterpartCannotBeChargedYet() throws Exception {
        long id = quote("MONTH", "[{\"featureKey\":\"ai.credits_extra\",\"quantity\":1}]");
        jdbc.update("update product_price set stripe_price_id = null where stripe_price_id = ?", SubFixtures.AI_MONTH);
        checkout(id, "{}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PRICE_NOT_SYNCED"));
    }

    @Test
    void theWebhookWritesTheAddonRowsThePlanLinkAndTheQuoteStatusFromTheItems() throws Exception {
        long id = quote("MONTH", "[{\"featureKey\":\"ai.credits_extra\",\"quantity\":2}]");
        checkout(id, "{}").andExpect(status().isOk());
        Subscription sub = subscriptions.findOneByUserId(user.getId()).orElseThrow();
        Instant start = Instant.now().minus(1, ChronoUnit.HOURS);
        Instant end = start.plus(30, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);

        webhook.apply(event("evt_1", sub, id, start, end, List.of(new StripeWebhookEvent.Item("si_base", SubFixtures.BASE_MONTH, 1), new StripeWebhookEvent.Item("si_ai", SubFixtures.AI_MONTH, 2))));

        em.flush();
        em.clear();
        Subscription after = subscriptions.findOneByUserId(user.getId()).orElseThrow();
        assertThat(after.getStatus()).isEqualTo("active");
        assertThat(after.getPlanVersionId()).isEqualTo(plan.versionId());
        assertThat(after.getBillingInterval()).isEqualTo("MONTH");
        assertThat(after.getCurrency()).isEqualTo("USD");
        assertThat(after.getCurrentPeriodStart()).isNotNull();
        var rows = addons.findBySubscriptionIdAndLiveTrueOrderByIdAsc(after.getId());
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getFeatureKey()).isEqualTo("ai.credits_extra");
        assertThat(rows.get(0).getQuantity()).isEqualTo(2);
        assertThat(rows.get(0).getStripeItemId()).isEqualTo("si_ai");
        assertThat(jdbc.queryForObject("select status from subscription_quote where id = ?", String.class, id)).isEqualTo("APPLIED");

        // The success page and My plan list the add-ons.
        mockMvc
            .perform(get("/api/billing/me"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan").value("PRO"))
            .andExpect(jsonPath("$.planKey").value("TQ"))
            .andExpect(jsonPath("$.addons[0].featureKey").value("ai.credits_extra"))
            .andExpect(jsonPath("$.addons[0].quantity").value(2))
            .andExpect(jsonPath("$.addons[0].unitMinor").value(499))
            .andExpect(jsonPath("$.recurringMinor").value(1999 + 2 * 499));

        // A later event without the add-on (removed in the portal): the customer keeps it to the period end.
        webhook.apply(event("evt_2", sub, id, start, end, List.of(new StripeWebhookEvent.Item("si_base", SubFixtures.BASE_MONTH, 1)), Instant.now().plusSeconds(5)));
        em.flush();
        em.clear();
        var closed = addons.findBySubscriptionIdAndLiveTrueOrderByIdAsc(after.getId());
        assertThat(closed).hasSize(1);
        assertThat(closed.get(0).getEndsAt()).isEqualTo(end);
    }

    @Test
    void anEventWhosePricesAreNotCatalogPricesLeavesEverythingAlone() throws Exception {
        Subscription sub = rowWith("cus_legacy");
        sub.setStripeSubscriptionId("sub_legacy");
        subscriptions.saveAndFlush(sub);
        webhook.apply(event("evt_legacy", sub, 0, Instant.now().minusSeconds(60), Instant.now().plus(10, ChronoUnit.DAYS), List.of(new StripeWebhookEvent.Item("si_x", "price_env_monthly", 1))));
        em.flush();
        em.clear();
        Subscription after = subscriptions.findOneByUserId(user.getId()).orElseThrow();
        assertThat(after.getPlanVersionId()).isNull();
        assertThat(addons.findBySubscriptionIdAndLiveTrueOrderByIdAsc(after.getId())).isEmpty();
    }

    @Test
    void theLegacyAliasUsesTheCatalogWhenProIsSellableThereAndTheEnvironmentPricesOtherwise() throws Exception {
        // PRO is a draft with no prices: the alias is the unchanged environment path (the five-argument gateway call).
        mockMvc.perform(post("/api/billing/checkout").contentType(MediaType.APPLICATION_JSON).content("{\"plan\":\"monthly\"}"));
        assertThat(fake.checkoutSpecs).as("the catalog path was not used").isEmpty();
        assertThat(fake.checkoutKeys).isEmpty();

        // Publish PRO in the catalog: the alias becomes a checkout of a CHECKOUT quote.
        long proPlanId = jdbc.queryForObject("select id from plan where plan_key = 'PRO'", Long.class);
        jdbc.update("update plan set status = 'PUBLISHED', `public` = true where id = ?", proPlanId);
        jdbc.update("update plan_version set status = 'PUBLISHED', effective_from = ? where plan_id = ? and version = 1", java.sql.Timestamp.from(Instant.now().minus(1, ChronoUnit.DAYS)), proPlanId);
        em.clear();
        String url = JsonPath.read(
            mockMvc.perform(post("/api/billing/checkout").contentType(MediaType.APPLICATION_JSON).content("{\"plan\":\"monthly\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
            "$.url"
        );
        assertThat(url).startsWith("https://checkout.test/co-");
        assertThat(fake.checkoutSpecs).hasSize(1);
        assertThat(fake.checkoutSpecs.get(0).lines()).containsExactly(new ItemQuantity(SubFixtures.BASE_MONTH, 1));
    }

    private Subscription rowWith(String customer) {
        Subscription sub = subscriptions.findOneByUserId(user.getId()).orElseGet(Subscription::new);
        sub.setUser(user);
        sub.setStripeCustomerId(customer);
        return sub;
    }

    private StripeWebhookEvent event(String id, Subscription sub, long quoteId, Instant start, Instant end, List<StripeWebhookEvent.Item> items) {
        return event(id, sub, quoteId, start, end, items, Instant.now());
    }

    private StripeWebhookEvent event(String id, Subscription sub, long quoteId, Instant start, Instant end, List<StripeWebhookEvent.Item> items, Instant created) {
        return new StripeWebhookEvent(
            id, "customer.subscription.updated", created, "subscription", sub.getStripeCustomerId(), "sub_wh_1", "active", items.get(0).priceId(), end, false, null, null, null, "kiwiply",
            start, "personal", null, quoteId == 0 ? null : String.valueOf(quoteId), items, null, null, null, null
        );
    }
}
