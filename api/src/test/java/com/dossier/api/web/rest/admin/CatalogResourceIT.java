package com.dossier.api.web.rest.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.catalog.CatalogService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * K1.3 on MySQL: prices are immutable effective-dated rows under a monotonic catalog version. Publish bumps the version by exactly one and stamps
 * the row, a replacement retires its predecessor, at most one row is active per key, ORG + QUARTER and a disabled YEAR are refused, retiring never
 * deletes, and the whole catalog reads on one page. (CatalogVersioningTest of the story, as an integration test.)
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
class CatalogResourceIT {

    private static final String REASON = "Launch price for the catalog tests";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private ProductRepository products;
    @Autowired private CatalogService catalog;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ResumeBuilderSettings rbs;

    private Long productId;

    @BeforeEach
    void product() {
        Product p = new Product();
        p.setCode("IT_PRICE_PRODUCT");
        p.setName("IT product");
        p.setKind("SUBSCRIPTION");
        p.setSoldTo("BOTH");
        p.setActive(true);
        productId = products.save(p).getId();
    }

    private Map<String, Object> price(String audience, String interval, long amount) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("productId", productId);
        m.put("audience", audience);
        m.put("interval", interval);
        m.put("amountMinor", amount);
        m.put("currency", "USD");
        return m;
    }

    private JsonNode draft(Map<String, Object> body) throws Exception {
        String json = mockMvc
            .perform(post("/api/admin/catalog/prices").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(body)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("DRAFT"))
            .andExpect(jsonPath("$.active").value(false))
            .andReturn()
            .getResponse()
            .getContentAsString();
        return om.readTree(json);
    }

    private JsonNode publish(long id, Map<String, Object> body) throws Exception {
        String json = mockMvc
            .perform(post("/api/admin/catalog/prices/" + id + "/publish").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(body)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return om.readTree(json);
    }

    private JsonNode publishNow(Map<String, Object> priceBody) throws Exception {
        return publish(draft(priceBody).get("id").asLong(), Map.of("reason", REASON));
    }

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void aNormalUserIsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/catalog")).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/admin/catalog/prices").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    }

    @Test
    void publishBumpsTheCatalogVersionByExactlyOneAndStampsTheRow() throws Exception {
        int before = catalog.currentVersion();
        JsonNode live = publishNow(price("INDIVIDUAL", "MONTH", 1999));
        assertThat(live.get("status").asText()).isEqualTo("ACTIVE");
        assertThat(live.get("catalogVersion").asInt()).isEqualTo(before + 1);
        assertThat(live.get("amountMinor").asLong()).isEqualTo(1999L);
        assertThat(live.get("stripePriceId").isNull()).as("no Stripe object until K1.5").isTrue();
        assertThat(catalog.currentVersion()).isEqualTo(before + 1);

        JsonNode second = publishNow(price("INDIVIDUAL", "QUARTER", 4999));
        assertThat(second.get("catalogVersion").asInt()).isEqualTo(before + 2);

        mockMvc.perform(get("/api/admin/catalog/versions/" + (before + 1)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.version").value(before + 1))
            .andExpect(jsonPath("$.priceIds[0]").value(live.get("id").asLong()))
            .andExpect(jsonPath("$.prices[0].amountMinor").value(1999))
            .andExpect(jsonPath("$.snapshotHash").isString());
        mockMvc.perform(get("/api/admin/catalog/versions/999999")).andExpect(status().isNotFound());
    }

    @Test
    void aReplacementRetiresItsPredecessorAndOnlyOneRowStaysActive() throws Exception {
        JsonNode first = publishNow(price("INDIVIDUAL", "MONTH", 1999));
        JsonNode second = publishNow(price("INDIVIDUAL", "MONTH", 2499));
        assertThat(second.get("status").asText()).isEqualTo("ACTIVE");

        mockMvc.perform(get("/api/admin/catalog/prices?productId=" + productId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.id==" + first.get("id").asLong() + ")].status").value("RETIRED"))
            .andExpect(jsonPath("$[?(@.id==" + first.get("id").asLong() + ")].amountMinor").value(1999))
            .andExpect(jsonPath("$[?(@.id==" + second.get("id").asLong() + ")].status").value("ACTIVE"));
        assertThat(jdbc.queryForObject("select count(*) from product_price where product_id = ? and active = true", Long.class, productId)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select effective_until is not null from product_price where id = ?", Boolean.class, first.get("id").asLong())).isTrue();
    }

    @Test
    void twoActiveRowsForOneKeyAreImpossibleInTheDatabase() throws Exception {
        publishNow(price("INDIVIDUAL", "MONTH", 1999));
        assertThatThrownBy(() ->
            jdbc.update(
                "insert into product_price (product_id, audience, billing_interval, amount_minor, currency, active, effective_from, created_by, created_at) values (?, 'INDIVIDUAL', 'MONTH', 5, 'USD', true, now(6), 'x', now(6))",
                productId
            )
        ).isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void aFuturePublishIsScheduledAndSwapsInWhenItsDateComes() throws Exception {
        JsonNode first = publishNow(price("INDIVIDUAL", "MONTH", 1999));
        Instant later = Instant.now().plus(2, ChronoUnit.HOURS);
        JsonNode next = publish(draft(price("INDIVIDUAL", "MONTH", 2499)).get("id").asLong(), Map.of("reason", REASON, "effectiveFrom", later.toString()));
        assertThat(next.get("status").asText()).isEqualTo("SCHEDULED");
        assertThat(next.get("active").asBoolean()).isFalse();
        mockMvc.perform(get("/api/admin/catalog/prices?productId=" + productId))
            .andExpect(jsonPath("$[?(@.id==" + first.get("id").asLong() + ")].status").value("ACTIVE"));

        // a second scheduled price for the same key is refused
        long third = draft(price("INDIVIDUAL", "MONTH", 2999)).get("id").asLong();
        mockMvc.perform(post("/api/admin/catalog/prices/" + third + "/publish").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(Map.of("reason", REASON))))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("PRICE_ACTIVE_EXISTS"));

        assertThat(catalog.activateDue(Instant.now())).as("nothing is due yet").isZero();
        assertThat(catalog.activateDue(later.plusSeconds(60))).isEqualTo(2); // the old row expires, the new row goes live
        mockMvc.perform(get("/api/admin/catalog/prices?productId=" + productId))
            .andExpect(jsonPath("$[?(@.id==" + first.get("id").asLong() + ")].status").value("RETIRED"))
            .andExpect(jsonPath("$[?(@.id==" + next.get("id").asLong() + ")].status").value("ACTIVE"));
    }

    @Test
    void retiringKeepsTheRowAndItsAmountAndOnlyHighWritesWithAReason() throws Exception {
        JsonNode live = publishNow(price("INDIVIDUAL", "MONTH", 1999));
        long id = live.get("id").asLong();
        mockMvc.perform(post("/api/admin/catalog/prices/" + id + "/retire").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"no\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("REASON_REQUIRED"));
        mockMvc.perform(post("/api/admin/catalog/prices/" + id + "/retire").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(Map.of("reason", REASON))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("RETIRED"))
            .andExpect(jsonPath("$.amountMinor").value(1999));
        assertThat(jdbc.queryForObject("select amount_minor from product_price where id = ?", Long.class, id)).isEqualTo(1999L);
        assertThat(jdbc.queryForObject("select active from product_price where id = ?", Boolean.class, id)).isFalse();
        mockMvc.perform(post("/api/admin/catalog/prices/" + id + "/retire").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(Map.of("reason", REASON))))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("PRICE_STATE"));
        assertThat(jdbc.queryForObject("select count(*) from admin_audit_event where action in ('CATALOG_PRICE_PUBLISH','CATALOG_PRICE_RETIRE') and details like '%risk=HIGH%'", Long.class)).isEqualTo(2L);
        assertThat(jdbc.queryForObject("select count(*) from catalog_change where entity = 'product_price' and entity_id = ?", Long.class, String.valueOf(id))).isGreaterThanOrEqualTo(2L);
    }

    @Test
    void publishNeedsADraftAndAReason() throws Exception {
        long id = draft(price("INDIVIDUAL", "MONTH", 1999)).get("id").asLong();
        mockMvc.perform(post("/api/admin/catalog/prices/" + id + "/publish").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("REASON_REQUIRED"));
        publish(id, Map.of("reason", REASON));
        mockMvc.perform(post("/api/admin/catalog/prices/" + id + "/publish").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(Map.of("reason", REASON))))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("PRICE_STATE"));
    }

    @Test
    void anOrganizationIsNeverQuarterlyAndUnknownCurrenciesAndProductsAreRefused() throws Exception {
        mockMvc.perform(post("/api/admin/catalog/prices").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(price("ORG", "QUARTER", 5000))))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("ORG_QUARTER_REFUSED"));
        Map<String, Object> eur = price("INDIVIDUAL", "MONTH", 1999);
        eur.put("currency", "EUR");
        mockMvc.perform(post("/api/admin/catalog/prices").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(eur)))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("CURRENCY_NOT_OFFERED"));
        Map<String, Object> ghost = price("INDIVIDUAL", "MONTH", 1999);
        ghost.put("productId", 999999999L);
        mockMvc.perform(post("/api/admin/catalog/prices").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(ghost)))
            .andExpect(status().isUnprocessableEntity());
        Map<String, Object> negative = price("INDIVIDUAL", "MONTH", -1);
        mockMvc.perform(post("/api/admin/catalog/prices").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(negative)))
            .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void yearIsRefusedWhileAnnualBillingIsOffAndAllowedWhenOn() throws Exception {
        // annual is ON by default (decision S-01)
        draft(price("INDIVIDUAL", "YEAR", 21589));
        try {
            jdbc.update("insert into app_setting (setting_key, setting_value, updated_by, updated_date) values ('billing.annual.enabled', 'false', 'test', now(6)) on duplicate key update setting_value = 'false'");
            rbs.invalidate();
            mockMvc.perform(post("/api/admin/catalog/prices").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(price("INDIVIDUAL", "YEAR", 21589))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("INTERVAL_NOT_ENABLED"))
                .andExpect(jsonPath("$.interval").value("YEAR"));
            // MONTH is unaffected
            draft(price("INDIVIDUAL", "MONTH", 1999));
        } finally {
            rbs.invalidate();
        }
    }

    @Test
    void theWholeCatalogReadsOnOnePage() throws Exception {
        publishNow(price("INDIVIDUAL", "MONTH", 1999));
        mockMvc.perform(get("/api/admin/catalog"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.products").isArray())
            .andExpect(jsonPath("$.prices").isArray())
            .andExpect(jsonPath("$.services").isArray())
            .andExpect(jsonPath("$.presets").isArray())
            .andExpect(jsonPath("$.tiers").isArray())
            .andExpect(jsonPath("$.floors.subscriptionPct").value(80))
            .andExpect(jsonPath("$.floors.servicePct").value(20))
            .andExpect(jsonPath("$.feeModel").value("SIMPLE"))
            .andExpect(jsonPath("$.catalogVersion").isNumber());
    }
}
