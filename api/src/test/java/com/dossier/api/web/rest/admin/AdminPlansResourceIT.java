package com.dossier.api.web.rest.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.catalog.CatalogService;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PublishPriceRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithAnonymousUser;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * K2.5 on MySQL: the plan builder's HTTP contract. Every route answers 401 without a token and 403 for a normal user (AuthzCoverage), a draft is built and
 * published over HTTP, publish needs an Idempotency-Key (400) and the typed version (412), a replay answers 200 with the same body, a margin failure is a 422
 * problem with its levers, and the error codes of 09 section 5 reach the client.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
class AdminPlansResourceIT {

    private static final String REASON = "Launch pricing for the plan builder tests";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private CatalogService catalog;
    @Autowired private com.dossier.api.repository.catalog.ProductRepository products;
    @Autowired private ResumeBuilderSettings rbs;

    @BeforeEach
    void before() {
        rbs.invalidate();
    }

    @AfterEach
    void after() {
        rbs.invalidate();
    }

    private static final List<String[]> ROUTES = List.of(
        new String[] { "GET", "/api/admin/plans" },
        new String[] { "POST", "/api/admin/plans" },
        new String[] { "PUT", "/api/admin/plans/PRO" },
        new String[] { "GET", "/api/admin/plans/PRO" },
        new String[] { "POST", "/api/admin/plans/PRO/versions" },
        new String[] { "GET", "/api/admin/plans/PRO/versions/1" },
        new String[] { "PATCH", "/api/admin/plans/PRO/versions/1" },
        new String[] { "PUT", "/api/admin/plans/PRO/versions/1/components" },
        new String[] { "GET", "/api/admin/plans/PRO/versions/1/preview" },
        new String[] { "POST", "/api/admin/plans/PRO/versions/1/publish" },
        new String[] { "POST", "/api/admin/plans/PRO/versions/1/discard" },
        new String[] { "GET", "/api/admin/plans/PRO/compare?a=1&b=1" },
        new String[] { "GET", "/api/admin/plans/PRO/subscribers" },
        new String[] { "GET", "/api/admin/catalog/margin?amountMinor=1999" },
        new String[] { "GET", "/api/admin/catalog/fee-model" },
        new String[] { "PUT", "/api/admin/catalog/fee-model" }
    );

    private static MockHttpServletRequestBuilder request(String method, String path) {
        MockHttpServletRequestBuilder b = switch (method) {
            case "GET" -> get(path);
            case "POST" -> post(path);
            case "PUT" -> put(path);
            default -> patch(path);
        };
        return b.contentType(MediaType.APPLICATION_JSON).content("{}");
    }

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void everyRouteIsForbiddenForANormalUser() throws Exception {
        for (String[] r : ROUTES) {
            mockMvc.perform(request(r[0], r[1])).andExpect(status().isForbidden());
        }
    }

    @Test
    @WithAnonymousUser
    void everyRouteNeedsAToken() throws Exception {
        for (String[] r : ROUTES) {
            mockMvc.perform(request(r[0], r[1])).andExpect(status().isUnauthorized());
        }
    }

    private JsonNode body(org.springframework.test.web.servlet.ResultActions a) throws Exception {
        return om.readTree(a.andReturn().getResponse().getContentAsString());
    }

    private void draftPrice(String code, String interval, long amount) {
        Long productId = products.findByCode(code).orElseThrow().getId();
        var d = catalog.createDraft(new com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PriceRequest(productId, "INDIVIDUAL", interval, amount, "USD", null, null, false, null, null, null, null, null, REASON));
        assertThat(d.id()).isNotNull();
    }

    private Map<String, Object> publishBody(int confirm, String override) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("confirmVersion", confirm);
        m.put("reason", REASON);
        if (override != null) m.put("overrideReason", override);
        return m;
    }

    @Test
    void theListAndTheDetailShowTheSeededPlans() throws Exception {
        JsonNode list = body(mockMvc.perform(get("/api/admin/plans").param("audience", "INDIVIDUAL")).andExpect(status().isOk()));
        List<String> keys = new java.util.ArrayList<>();
        list.forEach(p -> keys.add(p.get("planKey").asText()));
        assertThat(keys).contains("FREE", "PRO", "AUTOPILOT").doesNotContain("ORG_STANDARD");
        mockMvc.perform(get("/api/admin/plans/PRO")).andExpect(status().isOk()).andExpect(jsonPath("$.versions[0].status").value("DRAFT")).andExpect(jsonPath("$.versions[0].baseProduct.code").value("PRO"));
        mockMvc.perform(get("/api/admin/plans/FREE/versions/1")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PUBLISHED"));
        mockMvc.perform(get("/api/admin/plans/NOPE")).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void aDraftIsBuiltPreviewedAndPublishedOverHttpWithAnIdempotentPublish() throws Exception {
        draftPrice("PRO", "MONTH", 1999);
        draftPrice("PRO", "QUARTER", 4999);
        mockMvc.perform(put("/api/admin/plans/PRO/versions/1/components").contentType(MediaType.APPLICATION_JSON).content("{\"components\":[{\"featureKey\":\"resume.library\",\"role\":\"INCLUDED\",\"allowanceOverride\":25}]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.components.length()").value(1))
            .andExpect(jsonPath("$.components[0].allowance").value(25));
        mockMvc.perform(patch("/api/admin/plans/PRO/versions/1").contentType(MediaType.APPLICATION_JSON).content("{\"intervals\":[\"MONTH\",\"QUARTER\",\"YEAR\"],\"summary\":\"Launch Pro\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.intervals[2]").value("YEAR"))
            .andExpect(jsonPath("$.summary").value("Launch Pro"));
        mockMvc.perform(get("/api/admin/plans/PRO/versions/1/preview").param("interval", "YEAR"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.baseMinor").value(21589))
            .andExpect(jsonPath("$.annual.enabled").value(true))
            .andExpect(jsonPath("$.worstCase.ok").value(true))
            .andExpect(jsonPath("$.checks[3].id").value("margin"));

        String url = "/api/admin/plans/PRO/versions/1/publish";
        mockMvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(publishBody(1, null)))).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REQUIRED"));
        mockMvc.perform(post(url).header("Idempotency-Key", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(publishBody(7, null))))
            .andExpect(status().isPreconditionFailed())
            .andExpect(jsonPath("$.code").value("CONFIRM_MISMATCH"));
        String key = UUID.randomUUID().toString();
        JsonNode first = body(mockMvc.perform(post(url).header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(publishBody(1, null)))).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PUBLISHED")));
        long publishes = jdbc.queryForObject("select count(*) from catalog_publish", Long.class);
        JsonNode replay = body(mockMvc.perform(post(url).header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(publishBody(1, null)))).andExpect(status().isOk()));
        assertThat(replay.get("catalogVersion")).isEqualTo(first.get("catalogVersion"));
        assertThat(replay.get("snapshotHash")).isEqualTo(first.get("snapshotHash"));
        assertThat(jdbc.queryForObject("select count(*) from catalog_publish", Long.class)).isEqualTo(publishes);
        mockMvc.perform(post(url).header("Idempotency-Key", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(publishBody(1, null)))).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOT_DRAFT"));
        mockMvc.perform(patch("/api/admin/plans/PRO/versions/1").contentType(MediaType.APPLICATION_JSON).content("{\"summary\":\"x\"}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOT_DRAFT"));
        mockMvc.perform(get("/api/admin/plans/PRO/subscribers")).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void aMarginFailureIsAProblemWithLeversAndAReasonLetsItThrough() throws Exception {
        draftPrice("PRO", "MONTH", 1499);
        draftPrice("PRO", "QUARTER", 4999);
        mockMvc.perform(put("/api/admin/plans/PRO/versions/1/components").contentType(MediaType.APPLICATION_JSON).content("{\"components\":[{\"featureKey\":\"resume.library\",\"role\":\"INCLUDED\"}]}")).andExpect(status().isOk());
        String url = "/api/admin/plans/PRO/versions/1/publish";
        mockMvc.perform(post(url).header("Idempotency-Key", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(publishBody(1, null))))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("MARGIN_BELOW_FLOOR"))
            .andExpect(jsonPath("$.overrideAllowed").value(true))
            .andExpect(jsonPath("$.interval").value("MONTH"))
            .andExpect(jsonPath("$.floorBp").value(8000))
            .andExpect(jsonPath("$.levers.minPriceMinor").isNumber())
            .andExpect(jsonPath("$.checks[0].marginBp").isNumber());
        mockMvc.perform(post(url).header("Idempotency-Key", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(publishBody(1, "Founding price agreed for the cohort"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("PUBLISHED"));
    }

    @Test
    void createUpdateNewVersionDiscardAndCompareOverHttp() throws Exception {
        mockMvc.perform(post("/api/admin/plans").contentType(MediaType.APPLICATION_JSON).content("{\"planKey\":\"IT_HTTP\",\"name\":\"HTTP plan\",\"audience\":\"INDIVIDUAL\",\"reason\":\"" + REASON + "\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.planKey").value("IT_HTTP"))
            .andExpect(jsonPath("$.versions[0].version").value(1))
            .andExpect(jsonPath("$.versions[0].status").value("DRAFT"));
        mockMvc.perform(post("/api/admin/plans").contentType(MediaType.APPLICATION_JSON).content("{\"planKey\":\"IT_HTTP\",\"name\":\"Again\",\"audience\":\"INDIVIDUAL\",\"reason\":\"" + REASON + "\"}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PLAN_KEY_EXISTS"));
        mockMvc.perform(put("/api/admin/plans/IT_HTTP").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"HTTP plan renamed\",\"badge\":\"New\",\"reason\":\"" + REASON + "\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("HTTP plan renamed")).andExpect(jsonPath("$.badge").value("New"));
        mockMvc.perform(put("/api/admin/plans/IT_HTTP").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"x\"}")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("REASON_REQUIRED"));
        mockMvc.perform(post("/api/admin/plans/FREE/versions").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"" + REASON + "\"}")).andExpect(status().isCreated()).andExpect(jsonPath("$.version").value(2)).andExpect(jsonPath("$.status").value("DRAFT"));
        mockMvc.perform(post("/api/admin/plans/FREE/versions").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"" + REASON + "\"}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DRAFT_EXISTS"));
        mockMvc.perform(patch("/api/admin/plans/FREE/versions/2").contentType(MediaType.APPLICATION_JSON).content("{\"aiBudgetCapCents\":10}")).andExpect(status().isOk());
        mockMvc.perform(get("/api/admin/plans/FREE/compare").param("a", "1").param("b", "2"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.diff[?(@.path=='aiBudgetCapCents')].a").value(20))
            .andExpect(jsonPath("$.diff[?(@.path=='aiBudgetCapCents')].b").value(10))
            .andExpect(jsonPath("$.subscribers.a").value(0));
        mockMvc.perform(post("/api/admin/plans/FREE/versions/2/discard").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNoContent());
        mockMvc.perform(get("/api/admin/plans/FREE/versions/2")).andExpect(status().isNotFound());
        mockMvc.perform(post("/api/admin/plans/FREE/versions/1/discard").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOT_DRAFT"));
    }

    @Test
    void theMarginRouteAndThePlanRoutesSpeakTheSameFloor() throws Exception {
        mockMvc.perform(get("/api/admin/catalog/margin").param("amountMinor", "1999").param("aiBudgetCents", "300")).andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
        // a price publish stays unguarded by design: the guard applies at plan publish
        draftPrice("PRO", "MONTH", 1299);
        Long id = jdbc.queryForObject("select id from product_price where amount_minor = 1299 and published_at is null order by id desc limit 1", Long.class);
        assertThat(catalog.publish(id, new PublishPriceRequest(null, REASON, null)).amountMinor()).isEqualTo(1299L);
    }
}
