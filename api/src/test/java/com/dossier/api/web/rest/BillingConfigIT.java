package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.sub.BillingDriftRepository;
import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.CheckoutSpec;
import com.dossier.api.service.billing.StripeGateway.ItemQuantity;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.billing.reconcile.PersonalBillingReconcileJob;
import com.dossier.api.service.billing.reconcile.PersonalBillingReconciler;
import com.dossier.api.service.catalog.CatalogReconciler;
import com.dossier.api.service.catalog.PublicCatalogService;
import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * K8.7: the billing-disabled matrix of docs/subscriptions/07 section 8, against the REAL gateway with a blank Stripe key (no fake, no mock): develop and CI run
 * the whole module without secrets and nothing can charge by accident. Existing routes answer exactly as they always did; the routes added by the unified
 * module answer 503 {@code BILLING_DISABLED} where they would call Stripe and work where they only read the catalog; the reconcilers and their jobs are idle.
 *
 * <p>Covered elsewhere and cross-referenced: a LIVE key refuses test clocks ({@code StripeGatewayImplTest.liveKeyRefusesTestClocks}); the plan publish with a
 * blank key is silent by decision P-02 (the publish stream's tests); the organization's local activation (26 section 11) belongs to the enterprise module
 * and never reaches this code (enterprise accounts have no personal billing).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "user")
@Import(SubFixtures.CatalogPortConfig.class)
@TestPropertySource(properties = { "dossier.stripe.secret-key=", "dossier.stripe.webhook-secret=" })
class BillingConfigIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private UserRepository users;
    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private BillingDriftRepository drifts;
    @Autowired private StripeGateway gateway;
    @Autowired private PersonalBillingReconciler personalReconciler;
    @Autowired private PersonalBillingReconcileJob personalJob;
    @Autowired private CatalogReconciler catalogReconciler;
    @Autowired private PublicCatalogService publicCatalog;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;

    @BeforeEach
    void data() {
        publicCatalog.clearCache();
        SubFixtures.publishedPlan(jdbc);
        SubFixtures.standardPrices(jdbc);
        User user = users.findOneByLogin("user").orElseThrow();
        subscriptions.findOneByUserId(user.getId()).ifPresent(s -> {
            subscriptions.delete(s);
            subscriptions.flush();
        });
    }

    private static final String ADMIN = "ROLE_ADMIN";

    private long checkoutQuote() throws Exception {
        String body = mockMvc
            .perform(post("/api/billing/quotes").contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"CHECKOUT\",\"planKey\":\"TQ\",\"interval\":\"MONTH\",\"addons\":[{\"featureKey\":\"ai.credits_extra\",\"quantity\":1}]}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return ((Number) JsonPath.read(body, "$.quoteId")).longValue();
    }

    @Test
    void theGatewayIsOffAndEveryStripeCallRefusesWithNotEnabled() {
        assertThat(gateway.isEnabled()).isFalse();
        assertThat(gateway.hasLiveSubscription("cus_x")).as("a keyless server never blocks on Stripe").isFalse();
        IdempotencyKey key = IdempotencyKey.of("cfg", 1);
        CheckoutSpec spec = new CheckoutSpec("cus_x", 1L, List.of(new ItemQuantity("price_x", 1)), Map.of(), "https://ok", "https://no", false, null);
        List<Runnable> calls = List.of(
            () -> gateway.createCheckoutSession(spec, key),
            () -> gateway.setSubscriptionItems("sub_x", List.of(new ItemQuantity("price_x", 1)), key),
            () -> gateway.setCancelAtPeriodEnd("sub_x", true, key),
            () -> gateway.createSchedule("sub_x", List.of(new ItemQuantity("price_x", 1)), Instant.now(), key),
            () -> gateway.createSubscription("cus_x", List.of(new ItemQuantity("price_x", 1)), Instant.now(), Map.of(), key),
            () -> gateway.listInvoices("cus_x", 5, null),
            () -> gateway.listPrices(10),
            () -> gateway.retrieveSubscription("sub_x"),
            () -> gateway.retrieveEvent("evt_x"),
            () -> gateway.createTestClock(Instant.now(), key),
            () -> gateway.advanceTestClock("clock_x", Instant.now(), key)
        );
        for (Runnable call : calls) {
            assertThatThrownBy(call::run).isInstanceOfSatisfying(StripeGatewayException.class, e -> assertThat(e.getKind()).isEqualTo(StripeGatewayException.Kind.NOT_ENABLED));
        }
    }

    @Test
    void existingRoutesAnswerAsTheyAlwaysDidWithoutAKey() throws Exception {
        mockMvc.perform(get("/api/billing/me")).andExpect(status().isOk()).andExpect(jsonPath("$.plan").value("FREE")).andExpect(jsonPath("$.billingEnabled").value(false));
        mockMvc.perform(post("/api/billing/checkout").contentType(MediaType.APPLICATION_JSON).content("{\"plan\":\"monthly\"}")).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("BILLING_DISABLED"));
        mockMvc.perform(post("/api/billing/portal")).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("BILLING_DISABLED"));
        mockMvc.perform(get("/api/billing/invoices")).andExpect(status().isOk());
        mockMvc.perform(post("/api/billing/webhook").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
    }

    @Test
    void quotesAndThePublicCatalogWorkWithoutAKeyAndCheckoutAndConfirmAnswer503() throws Exception {
        long id = checkoutQuote();
        mockMvc.perform(get("/api/billing/quotes/" + id)).andExpect(status().isOk()).andExpect(jsonPath("$.quoteId").value(id));
        mockMvc
            .perform(post("/api/billing/quotes/" + id + "/checkout").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.code").value("BILLING_DISABLED"));

        // A subscriber's change quote also works; confirming it needs Stripe and is refused.
        User user = users.findOneByLogin("user").orElseThrow();
        Subscription sub = new Subscription();
        sub.setUser(user);
        sub.setStatus("active");
        sub.setPlan("PRO");
        sub.setPriceId(SubFixtures.BASE_MONTH);
        sub.setStripeCustomerId("cus_cfg_1");
        sub.setStripeSubscriptionId("sub_cfg_1");
        sub.setCurrentPeriodEnd(Instant.now().plus(20, ChronoUnit.DAYS));
        sub.setCurrentPeriodStart(Instant.now().minus(10, ChronoUnit.DAYS));
        sub.setBillingInterval("MONTH");
        sub.setCurrency("USD");
        subscriptions.saveAndFlush(sub);
        String change = mockMvc
            .perform(post("/api/billing/quotes").contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"CHANGE\",\"addons\":[{\"featureKey\":\"ai.credits_extra\",\"quantity\":2}]}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        long changeId = ((Number) JsonPath.read(change, "$.quoteId")).longValue();
        mockMvc
            .perform(post("/api/billing/quotes/" + changeId + "/confirm").header("Idempotency-Key", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.code").value("BILLING_DISABLED"));

        // The public catalog shows the published plan with prices and hides the seeded drafts.
        String catalog = mockMvc.perform(get("/api/catalog/public").with(user("anon").roles())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<List<Object>>read(catalog, "$.plans[?(@.planKey=='TQ')]")).hasSize(1);
        assertThat(JsonPath.<List<Object>>read(catalog, "$.plans[?(@.planKey=='PRO')]")).as("a draft is never public").isEmpty();
        assertThat(JsonPath.<List<Object>>read(catalog, "$.plans[?(@.planKey=='AUTOPILOT')]")).isEmpty();
    }

    @Test
    void theReconcilersAndTheirJobsAreIdleAndTheAdminRoutesSayPlainly() throws Exception {
        long before = drifts.count();
        assertThat(personalReconciler.run().ran()).isFalse();
        assertThat(catalogReconciler.run().ran()).isFalse();
        personalJob.run(); // logs nothing, throws nothing
        assertThat(drifts.count()).as("an idle job writes nothing").isEqualTo(before);

        mockMvc.perform(get("/api/admin/billing/attention").with(user("admin").authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority(ADMIN)))).andExpect(status().isOk());
        mockMvc.perform(get("/api/admin/billing/drift").with(user("admin").authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority(ADMIN)))).andExpect(status().isOk());
        mockMvc
            .perform(
                post("/api/admin/billing/events/evt_cfg_1/replay")
                    .with(user("admin").authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority(ADMIN)))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"reason\":\"Webhook was lost during the outage\"}")
            )
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.code").value("BILLING_DISABLED"));
    }
}
