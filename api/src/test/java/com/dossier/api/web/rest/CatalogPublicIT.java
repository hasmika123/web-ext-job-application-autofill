package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.catalog.PublicCatalogService;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithAnonymousUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * K5.1: {@code GET /api/catalog/public} (docs/subscriptions/09-apis.md section 2) over real tables with the in-memory price double. Anonymous; only the
 * published, public, effective plan with a priced base appears; add-ons without a price are omitted; totals are server-priced and agree with a quote.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithAnonymousUser
@Import({ SubFixtures.CatalogPortConfig.class, SubFixtures.FakeGatewayConfig.class })
class CatalogPublicIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PublicCatalogService service;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;

    @BeforeEach
    void data() {
        service.clearCache();
        SubFixtures.publishedPlan(jdbc);
        SubFixtures.standardPrices(jdbc);
    }

    private String body() throws Exception {
        return mockMvc.perform(get("/api/catalog/public")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    @Test
    void anAnonymousVisitorSeesThePublishedPlanWithPricesPerIntervalAndPrecomputedTotals() throws Exception {
        String body = body();
        assertThat(JsonPath.<java.util.List<Object>>read(body, "$.plans[?(@.planKey=='TQ')]")).hasSize(1);
        assertThat(JsonPath.<String>read(body, "$.currency")).isEqualTo("USD");
        assertThat(JsonPath.<java.util.List<Object>>read(body, "$.plans[?(@.planKey=='TQ')].prices.MONTH.amountMinor")).containsExactly(1999);
        assertThat(JsonPath.<java.util.List<Object>>read(body, "$.plans[?(@.planKey=='TQ')].prices.QUARTER.amountMinor")).containsExactly(4999);
        assertThat(JsonPath.<java.util.List<Object>>read(body, "$.plans[?(@.planKey=='TQ')].prices.QUARTER.savingsMinor")).containsExactly(998); // 3 x 1999 - 4999
        assertThat(JsonPath.<java.util.List<Object>>read(body, "$.plans[?(@.planKey=='TQ')].prices.QUARTER.monthlyEquivalentMinor")).containsExactly(1666);
        assertThat(JsonPath.<java.util.List<Object>>read(body, "$.plans[?(@.planKey=='TQ')].prices.MONTH.savingsMinor")).isEmpty(); // the monthly price carries no savings
        assertThat(JsonPath.<java.util.List<String>>read(body, "$.intervals")).contains("MONTH", "QUARTER").doesNotContain("YEAR");
        assertThat(((Number) JsonPath.read(body, "$.totals.TQ.MONTH['ai.credits_extra:2']")).longValue()).isEqualTo(1999 + 2 * 499);
        assertThat(((Number) JsonPath.read(body, "$.totals.TQ.QUARTER['ai.credits_extra:1']")).longValue()).isEqualTo(4999 + 1299);
        assertThat(((Number) JsonPath.read(body, "$.totals.TQ.MONTH['ai.credits_extra:1,resume.extra_pack:1']")).longValue()).isEqualTo(1999 + 499 + 299);
    }

    @Test
    void addOnsWithAPriceAreListedAndOthersAreOmittedPerInterval() throws Exception {
        String body = body();
        // ai.credits_extra has MONTH and QUARTER prices; resume.extra_pack only MONTH (standardPrices)
        assertThat(JsonPath.<java.util.List<Object>>read(body, "$.plans[?(@.planKey=='TQ')].optional[?(@.featureKey=='ai.credits_extra')].prices.MONTH.amountMinor")).containsExactly(499);
        assertThat(JsonPath.<java.util.List<Object>>read(body, "$.plans[?(@.planKey=='TQ')].optional[?(@.featureKey=='ai.credits_extra')].prices.QUARTER.amountMinor")).containsExactly(1299);
        assertThat(JsonPath.<java.util.List<Object>>read(body, "$.plans[?(@.planKey=='TQ')].optional[?(@.featureKey=='resume.extra_pack')].prices.QUARTER")).isEmpty();
    }

    @Test
    void aTotalIsTheSameNumberAnAnonymousQuoteReturns() throws Exception {
        String catalog = body();
        Number total = JsonPath.read(catalog, "$.totals.TQ.MONTH['ai.credits_extra:2']");
        String quote = mockMvc
            .perform(
                org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/billing/quotes")
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .content("{\"anonymous\":true,\"planKey\":\"TQ\",\"interval\":\"MONTH\",\"addons\":[{\"featureKey\":\"ai.credits_extra\",\"quantity\":2}]}")
            )
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        assertThat(((Number) JsonPath.read(quote, "$.proposed.recurringMinor")).longValue()).isEqualTo(total.longValue());
    }

    @Test
    void draftsAndNonPublicPlansNeverAppear() throws Exception {
        jdbc.update("update plan set status = 'DRAFT' where plan_key = 'TQ'");
        service.clearCache();
        assertThat(JsonPath.<java.util.List<Object>>read(body(), "$.plans[?(@.planKey=='TQ')]")).isEmpty();
        jdbc.update("update plan set status = 'PUBLISHED', `public` = FALSE where plan_key = 'TQ'");
        service.clearCache();
        assertThat(JsonPath.<java.util.List<Object>>read(body(), "$.plans[?(@.planKey=='TQ')]")).isEmpty();
        mockMvc.perform(get("/api/catalog/public/plans/TQ")).andExpect(status().isNotFound());
    }

    @Test
    void aPlanWhosePriceIsNotPublishedIsNotListedAndAVersionNotYetEffectiveIsHidden() throws Exception {
        jdbc.update("update product_price set active = false where stripe_price_id in (?, ?)", SubFixtures.BASE_MONTH, SubFixtures.BASE_QUARTER);
        service.clearCache();
        assertThat(JsonPath.<java.util.List<Object>>read(body(), "$.plans[?(@.planKey=='TQ')]")).isEmpty();
        jdbc.update("update product_price set active = true where stripe_price_id in (?, ?)", SubFixtures.BASE_MONTH, SubFixtures.BASE_QUARTER);
        jdbc.update("update plan_version set effective_from = ? where plan_id = (select id from plan where plan_key = 'TQ')", java.sql.Timestamp.from(java.time.Instant.now().plusSeconds(86_400)));
        service.clearCache();
        em.clear(); // the JDBC update is not visible to an entity already loaded in this test's persistence context
        assertThat(JsonPath.<java.util.List<Object>>read(body(), "$.plans[?(@.planKey=='TQ')]")).isEmpty();
    }

    @Test
    void aPlanLimitedToCountriesOnlyShowsForThem() throws Exception {
        jdbc.update("update plan set eligibility_json = '{\"countries\":[\"DE\"]}' where plan_key = 'TQ'");
        service.clearCache();
        assertThat(JsonPath.<java.util.List<Object>>read(body(), "$.plans[?(@.planKey=='TQ')]")).isEmpty();
        String de = mockMvc.perform(get("/api/catalog/public").param("country", "de")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<java.util.List<Object>>read(de, "$.plans[?(@.planKey=='TQ')]")).hasSize(1);
    }

    @Test
    void theResponseIsCacheableAndOneSinglePlanCanBeRead() throws Exception {
        mockMvc.perform(get("/api/catalog/public")).andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("max-age=")));
        mockMvc.perform(get("/api/catalog/public/plans/tq")).andExpect(status().isOk()).andExpect(jsonPath("$.planKey").value("TQ"));
        mockMvc.perform(get("/api/catalog/public/plans/NOPE")).andExpect(status().isNotFound());
    }

    @Test
    void anotherAudienceGetsAnEmptyCatalogNotAnError() throws Exception {
        mockMvc.perform(get("/api/catalog/public").param("audience", "ORG")).andExpect(status().isOk()).andExpect(jsonPath("$.plans.length()").value(0));
    }
}
