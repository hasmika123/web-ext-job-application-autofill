package com.dossier.api.service.billing.personal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.sub.SubscriptionAddon;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.sub.SubscriptionAddonRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** K5.7: {@code GET /api/entitlements/me} and {@code /check} from the plan version and the live add-ons, and the v3 additions of {@code GET /api/billing/me}. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "user")
@Import({ SubFixtures.CatalogPortConfig.class, SubFixtures.FakeGatewayConfig.class })
class PersonalEntitlementsIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private UserRepository users;
    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private SubscriptionAddonRepository addons;
    @Autowired private FakeStripeGateway fake;

    private User user;

    @BeforeEach
    void data() {
        fake.reset();
        user = users.findOneByLogin("user").orElseThrow();
        subscriptions.findOneByUserId(user.getId()).ifPresent(s -> {
            subscriptions.delete(s);
            subscriptions.flush();
        });
    }

    @Test
    void aFreeAccountSeesTheFreePlanAndTheV1PlanBodyStaysByteIdentical() throws Exception {
        mockMvc
            .perform(get("/api/entitlements/me"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.planKey").value("FREE"))
            .andExpect(jsonPath("$.state").value("FREE"))
            .andExpect(jsonPath("$.features").isArray());
        String body = mockMvc.perform(get("/api/billing/me")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(new com.fasterxml.jackson.databind.ObjectMapper().readTree(body).fieldNames()).toIterable().containsExactlyInAnyOrder("plan", "status", "currentPeriodEnd", "cancelAtPeriodEnd", "billingEnabled", "hasCustomer", "pro");
    }

    @Test
    void aSubscribersSetIsThePlanVersionPlusTheLiveAddons() throws Exception {
        SubFixtures.Plan plan = SubFixtures.publishedPlan(jdbc);
        SubFixtures.standardPrices(jdbc);
        Subscription sub = new Subscription();
        sub.setUser(user);
        sub.setStatus("active");
        sub.setPlan("PRO");
        sub.setPriceId(SubFixtures.BASE_MONTH);
        sub.setCurrentPeriodEnd(Instant.now().plus(20, ChronoUnit.DAYS));
        sub.setPlanVersionId(plan.versionId());
        sub.setBillingInterval("MONTH");
        sub.setCurrency("USD");
        sub = subscriptions.saveAndFlush(sub);
        SubscriptionAddon row = new SubscriptionAddon();
        row.setSubscriptionId(sub.getId());
        row.setUserId(user.getId());
        row.setFeatureKey("support.priority");
        row.setProductId(jdbc.queryForObject("select id from product where code = 'FEAT_SUPPORT'", Long.class));
        row.setPriceId(SubFixtures.price(jdbc, "FEAT_SUPPORT", "MONTH", 399, "price_tq_support_m"));
        row.setQuantity(1);
        row.setStartsAt(Instant.now());
        row.setLive(true);
        row.setCreatedAt(Instant.now());
        row.setUpdatedAt(Instant.now());
        addons.saveAndFlush(row);

        mockMvc
            .perform(get("/api/entitlements/me"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.planKey").value("TQ"))
            .andExpect(jsonPath("$.planVersion").value(1))
            .andExpect(jsonPath("$.interval").value("MONTH"))
            .andExpect(jsonPath("$.state").value("ACTIVE"))
            .andExpect(jsonPath("$.capabilities", hasItem("resume.library")))
            .andExpect(jsonPath("$.capabilities", hasItem("support.priority")))
            .andExpect(jsonPath("$.features[?(@.featureKey=='support.priority')].source").value(hasItem("ADDON")))
            .andExpect(jsonPath("$.features[?(@.featureKey=='resume.library')].source").value(hasItem("PLAN")))
            .andExpect(jsonPath("$.features[?(@.featureKey=='resume.library')].allowance").value(hasItem(25)));
        mockMvc.perform(get("/api/entitlements/check").param("feature", "support.priority")).andExpect(status().isOk()).andExpect(jsonPath("$.allowed").value(true)).andExpect(jsonPath("$.reasonCode").value("OK"));
        mockMvc
            .perform(get("/api/entitlements/check").param("feature", "automation.approved_apply"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.allowed").value(false))
            .andExpect(jsonPath("$.reasonCode").value("FEATURE_NOT_IN_PLAN"))
            .andExpect(jsonPath("$.details.featureKey").value("automation.approved_apply"));
        mockMvc.perform(get("/api/billing/me")).andExpect(jsonPath("$.planKey").value("TQ")).andExpect(jsonPath("$.features", not(org.hamcrest.Matchers.empty())));
    }

    @Test
    void checkNeedsAFeature() throws Exception {
        mockMvc.perform(get("/api/entitlements/check").param("feature", " ")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("FEATURE_REQUIRED"));
    }
}
