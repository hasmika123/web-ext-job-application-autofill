package com.dossier.api.web.rest.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.retirement.RecordingStripeGateway;
import com.dossier.api.service.retirement.RetirementFixtures;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * K10.1 over HTTP (docs/subscriptions/11): the admin retirement routes answer 401 without a token and 403 for a normal user, a retirement is created, started and read
 * back with the contract shapes, and the problems carry their {@code code}.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
@Import({ SubFixtures.CatalogPortConfig.class, RecordingStripeGateway.Config.class })
class AdminRetirementsResourceIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private UserRepository users;
    @Autowired private SubscriptionRepository subscriptions;

    private SubFixtures.Plan plan;

    @BeforeEach
    void data() {
        plan = SubFixtures.publishedPlan(jdbc);
        SubFixtures.standardPrices(jdbc);
    }

    private static final List<String[]> ROUTES = List.of(
        new String[] { "POST", "/api/admin/retirements" },
        new String[] { "GET", "/api/admin/retirements" },
        new String[] { "GET", "/api/admin/retirements/1" },
        new String[] { "PATCH", "/api/admin/retirements/1" },
        new String[] { "POST", "/api/admin/retirements/1/start" },
        new String[] { "POST", "/api/admin/retirements/1/cancel" },
        new String[] { "POST", "/api/admin/retirements/1/complete" },
        new String[] { "GET", "/api/admin/retirements/1/items" },
        new String[] { "GET", "/api/admin/retirements/1/impact" },
        new String[] { "PUT", "/api/admin/retirements/1/successors" },
        new String[] { "GET", "/api/admin/retirements/1/coverage" },
        new String[] { "GET", "/api/admin/retirements/1/notices" },
        new String[] { "GET", "/api/admin/retirements/1/notices/preview" },
        new String[] { "POST", "/api/admin/retirements/1/items/1/resend" }
    );

    private static MockHttpServletRequestBuilder request(String method, String path) {
        return switch (method) {
            case "POST" -> post(path);
            case "PATCH" -> patch(path);
            case "PUT" -> put(path);
            default -> get(path);
        };
    }

    @Test
    @WithAnonymousUser
    void everyRouteAnswers401WithoutAToken() throws Exception {
        for (String[] r : ROUTES) {
            mockMvc.perform(request(r[0], r[1]).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
        }
    }

    @Test
    @WithMockUser(username = "user")
    void everyRouteAnswers403ForANormalUser() throws Exception {
        for (String[] r : ROUTES) {
            mockMvc.perform(request(r[0], r[1]).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
        }
    }

    private ResultActions create(String body) throws Exception {
        return mockMvc.perform(post("/api/admin/retirements").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void aRetirementIsCreatedStartedAndReadBack() throws Exception {
        RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), "MONTH", "active", 10, false, false);
        String created = create("{\"kind\":\"PLAN\",\"planKey\":\"TQ\",\"reason\":\"" + RetirementFixtures.REASON + "\"}")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("DRAFT"))
            .andExpect(jsonPath("$.planKey").value("TQ"))
            .andExpect(jsonPath("$.mode").value("RETIRE_AT_RENEWAL"))
            .andExpect(jsonPath("$.defaultOutcome").value("FREE"))
            .andExpect(jsonPath("$.noticeScheduleDays[0]").value(60))
            .andExpect(jsonPath("$.minNoticeDays").value(30))
            .andReturn()
            .getResponse()
            .getContentAsString();
        long id = ((Number) JsonPath.read(created, "$.id")).longValue();

        mockMvc.perform(get("/api/admin/retirements/" + id + "/impact")).andExpect(status().isOk()).andExpect(jsonPath("$.subscribers").value(1)).andExpect(jsonPath("$.mrrMinor").value(1999));
        mockMvc
            .perform(post("/api/admin/retirements/" + id + "/start").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"" + RetirementFixtures.REASON + "\",\"confirmKey\":\"nope\"}"))
            .andExpect(status().isPreconditionFailed())
            .andExpect(jsonPath("$.code").value("CONFIRM_MISMATCH"));
        mockMvc
            .perform(post("/api/admin/retirements/" + id + "/start").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"" + RetirementFixtures.REASON + "\",\"confirmKey\":\"TQ\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("NOTICING"))
            .andExpect(jsonPath("$.impact.subscribers").value(1))
            .andExpect(jsonPath("$.itemCounts.PENDING").value(1));
        mockMvc.perform(get("/api/admin/retirements/" + id)).andExpect(status().isOk()).andExpect(jsonPath("$.startedBy").value("boss"));
        mockMvc.perform(get("/api/admin/retirements?status=NOTICING")).andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(id)).andExpect(jsonPath("$.total").value(1));
        mockMvc
            .perform(get("/api/admin/retirements/" + id + "/items"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(1))
            .andExpect(jsonPath("$.items[0].status").value("PENDING"))
            .andExpect(jsonPath("$.items[0].interval").value("MONTH"))
            .andExpect(jsonPath("$.items[0].login").isNotEmpty())
            .andExpect(jsonPath("$.items[0].retireEffectiveAt").isNotEmpty());
        mockMvc
            .perform(post("/api/admin/retirements/" + id + "/cancel").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"" + RetirementFixtures.REASON + "\",\"confirmKey\":\"TQ\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    @Test
    void theProblemsCarryTheirCode() throws Exception {
        create("{\"kind\":\"PLAN\",\"planKey\":\"TQ\",\"reason\":\"short\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("REASON_REQUIRED"));
        create("{\"kind\":\"PLAN\",\"planKey\":\"TQ\",\"minNoticeDays\":10,\"reason\":\"" + RetirementFixtures.REASON + "\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("MIN_NOTICE_TOO_SHORT"));
        create("{\"kind\":\"PRICE\",\"planKey\":\"TQ\",\"reason\":\"" + RetirementFixtures.REASON + "\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("KIND_NOT_SUPPORTED"));
        create("{\"kind\":\"PLAN\",\"planKey\":\"NOPE\",\"reason\":\"" + RetirementFixtures.REASON + "\"}").andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
        mockMvc.perform(get("/api/admin/retirements/999999")).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select count(*) from plan_retirement", Integer.class)).isZero();
    }

    @Test
    void successorsCoverageAndNoticesAreReadableOverHttp() throws Exception {
        com.dossier.api.service.retirement.RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        com.dossier.api.service.retirement.RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), "MONTH", "active", 40, false, true);
        String created = create("{\"kind\":\"PLAN\",\"planKey\":\"TQ\",\"reason\":\"" + RetirementFixtures.REASON + "\"}").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(created, "$.id")).longValue();

        mockMvc
            .perform(put("/api/admin/retirements/" + id + "/successors").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"" + RetirementFixtures.REASON + "\",\"successors\":[{\"planKey\":\"TS\",\"rank\":1,\"note\":\"same price\"}]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.successors[0].planKey").value("TS"))
            .andExpect(jsonPath("$.successors[0].rank").value(1));
        mockMvc
            .perform(put("/api/admin/retirements/" + id + "/successors").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"" + RetirementFixtures.REASON + "\",\"successors\":[{\"planKey\":\"TQ\"}]}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("SUCCESSOR_NOT_SELLABLE"));
        mockMvc
            .perform(get("/api/admin/retirements/" + id + "/coverage"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.subscribers").value(1))
            .andExpect(jsonPath("$.fullyCovered").value(1))
            .andExpect(jsonPath("$.wouldPayMore").value(0))
            .andExpect(jsonPath("$.migrateAllowed").value(true))
            .andExpect(jsonPath("$.bySuccessor[0].planKey").value("TS"));

        mockMvc
            .perform(get("/api/admin/retirements/" + id + "/notices/preview"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sample").value(true))
            .andExpect(jsonPath("$.subject").value(org.hamcrest.Matchers.containsString("is changing on")))
            .andExpect(jsonPath("$.defaultOutcome").value(org.hamcrest.Matchers.containsString("If you do nothing")))
            .andExpect(jsonPath("$.suggest").value(org.hamcrest.Matchers.containsString("Successor plan is the closest match")));
        mockMvc
            .perform(post("/api/admin/retirements/" + id + "/start").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"" + RetirementFixtures.REASON + "\",\"confirmKey\":\"TQ\"}"))
            .andExpect(status().isOk());
        String items = mockMvc.perform(get("/api/admin/retirements/" + id + "/items")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long itemId = ((Number) JsonPath.read(items, "$.items[0].id")).longValue();
        long subscriptionId = ((Number) JsonPath.read(items, "$.items[0].subscriptionId")).longValue();
        mockMvc.perform(get("/api/admin/retirements/" + id + "/notices")).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mockMvc
            .perform(get("/api/admin/retirements/" + id + "/notices/preview").param("subscriptionId", String.valueOf(subscriptionId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sample").value(false))
            .andExpect(jsonPath("$.effectiveAt").isNotEmpty());
        mockMvc
            .perform(post("/api/admin/retirements/" + id + "/items/" + itemId + "/resend").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"short\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("REASON_REQUIRED"));
        mockMvc
            .perform(post("/api/admin/retirements/" + id + "/items/" + itemId + "/resend").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"The customer asked us to send it again\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sent").value(true));
        mockMvc.perform(get("/api/admin/retirements/" + id + "/notices")).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].status").value("SENT"));
    }
}
