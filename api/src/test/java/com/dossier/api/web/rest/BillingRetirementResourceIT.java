package com.dossier.api.web.rest;

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
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.retirement.RecordingStripeGateway;
import com.dossier.api.service.retirement.RetirementFixtures;
import com.dossier.api.service.retirement.RetirementService;
import com.dossier.api.service.retirement.dto.RetirementDTOs.CreateRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementDTO;
import com.dossier.api.service.retirement.dto.RetirementDTOs.StartRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.SuccessorRequest;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithAnonymousUser;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * K10.4 over HTTP (docs/subscriptions/11 sections 6 and 12): the subscriber's page and choice routes, and the {@code sunset} block of {@code GET /api/billing/me} in exactly
 * the shape the web banner reads. The signed-in account is the seeded {@code user}; a subscriber outside a retirement sees today's body, byte for byte.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "user")
@Import({ SubFixtures.CatalogPortConfig.class, RecordingStripeGateway.Config.class })
class BillingRetirementResourceIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private UserRepository users;
    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private RetirementService retirements;
    @Autowired private RecordingStripeGateway stripe;

    private SubFixtures.Plan plan;
    private Subscription sub;

    @BeforeEach
    void data() {
        stripe.reset();
        plan = SubFixtures.publishedPlan(jdbc);
        SubFixtures.standardPrices(jdbc);
        RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        User me = users.findOneByLogin("user").orElseThrow();
        sub = RetirementFixtures.subscriberFor(me, subscriptions, plan.versionId(), "MONTH", "active", 20, false, true);
    }

    private void startRetirement() {
        RetirementDTO d = retirements.create(new CreateRequest("PLAN", "TQ", null, null, null, null, null, null, null, null, RetirementFixtures.REASON, List.of(new SuccessorRequest("TS", null, 1, null))));
        retirements.start(d.id(), new StartRequest(RetirementFixtures.REASON, "TQ"));
    }

    @Test
    void outsideARetirementTheRouteIs404AndMyPlanHasNoSunsetBlock() throws Exception {
        mockMvc.perform(get("/api/billing/retirement/me")).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NO_RETIREMENT"));
        mockMvc.perform(get("/api/billing/me")).andExpect(status().isOk()).andExpect(jsonPath("$.sunset").doesNotExist()).andExpect(jsonPath("$.planKey").value("TQ"));
    }

    @Test
    @WithAnonymousUser
    void bothRoutesNeedASignedInAccount() throws Exception {
        mockMvc.perform(get("/api/billing/retirement/me")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/billing/retirement/me/choice").contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"LATER\"}")).andExpect(status().isUnauthorized());
    }

    @Test
    void whileMyPlanIsRetiringBillingMeCarriesTheSunsetBlockTheBannerReads() throws Exception {
        startRetirement();
        mockMvc
            .perform(get("/api/billing/me"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan").value("PRO"))
            .andExpect(jsonPath("$.planKey").value("TQ"))
            .andExpect(jsonPath("$.sunset.successorPlanKey").value("TS"))
            .andExpect(jsonPath("$.sunset.defaultOutcome").value("FREE"))
            .andExpect(jsonPath("$.sunset.itemStatus").value("PENDING"))
            .andExpect(jsonPath("$.sunset.effectiveAt").isNotEmpty())
            .andExpect(jsonPath("$.sunset.retirementId").isNumber());
    }

    @Test
    void thePageAndTheChoiceRoundTrip() throws Exception {
        startRetirement();
        String me = mockMvc
            .perform(get("/api/billing/retirement/me"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.state").value("CHANGING"))
            .andExpect(jsonPath("$.planKey").value("TQ"))
            .andExpect(jsonPath("$.defaultOutcome").value("FREE"))
            .andExpect(jsonPath("$.currentRecurringMinor").value(1999))
            .andExpect(jsonPath("$.suggestion.successorKey").value("TS"))
            .andExpect(jsonPath("$.suggestion.priceDirection").value("SAME"))
            .andExpect(jsonPath("$.suggestion.quoteId").isNumber())
            .andExpect(jsonPath("$.lockPreview").isArray())
            .andReturn()
            .getResponse()
            .getContentAsString();
        long quoteId = ((Number) JsonPath.read(me, "$.suggestion.quoteId")).longValue();

        mockMvc.perform(post("/api/billing/retirement/me/choice").contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"LATER\"}")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REQUIRED"));
        String key = UUID.randomUUID().toString();
        mockMvc
            .perform(post("/api/billing/retirement/me/choice").header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"SWITCH_AT_RENEWAL\",\"quoteId\":" + quoteId + "}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.scheduled").value(true))
            .andExpect(jsonPath("$.itemStatus").value("SWITCH_SCHEDULED"))
            .andExpect(jsonPath("$.change.kind").value("RETIREMENT_SWITCH"));
        mockMvc
            .perform(post("/api/billing/retirement/me/choice").header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"SWITCH_AT_RENEWAL\",\"quoteId\":" + quoteId + "}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.itemStatus").value("SWITCH_SCHEDULED"));
        assertThat(stripe.scheduleCalls).hasSize(1);
        mockMvc.perform(get("/api/billing/retirement/me")).andExpect(status().isOk()).andExpect(jsonPath("$.choice.kind").value("SWITCH_AT_RENEWAL")).andExpect(jsonPath("$.choice.planKey").value("TS"));
        mockMvc.perform(get("/api/billing/me")).andExpect(jsonPath("$.sunset.itemStatus").value("SWITCH_SCHEDULED"));
    }

    @Test
    void thePickRouteReturnsAFreshQuoteInTheMyPlanShape() throws Exception {
        startRetirement();
        mockMvc
            .perform(post("/api/billing/retirement/me/choice").header("Idempotency-Key", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"PICK\",\"planKey\":\"TS\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.quote.kind").value("RETIREMENT_SWITCH"))
            .andExpect(jsonPath("$.quote.status").value("OPEN"))
            .andExpect(jsonPath("$.quote.plan.planKey").value("TS"))
            .andExpect(jsonPath("$.quote.proposed.recurringMinor").value(1999))
            .andExpect(jsonPath("$.quote.current.recurringMinor").value(1999))
            .andExpect(jsonPath("$.quote.deltaMinor").value(0))
            .andExpect(jsonPath("$.scheduled").value(false));
        mockMvc
            .perform(post("/api/billing/retirement/me/choice").header("Idempotency-Key", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"PICK\",\"planKey\":\"FREE\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("SUCCESSOR_NOT_AVAILABLE"));
    }
}
