package com.dossier.api.web.rest.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.margin.MarginCalculator;
import com.dossier.api.service.billing.margin.MarginSettingsPort;
import com.dossier.api.service.catalog.CatalogPortAdapter;
import com.dossier.api.service.catalog.CatalogService;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PriceDTO;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PriceRequest;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PublishPriceRequest;
import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import com.dossier.api.service.pricing.PriceRow;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * The wiring of K3.1 / K3.2 to the real catalog and settings: the {@link CatalogPortAdapter} reads {@code product_price}, the {@link MarginSettingsPort} reads
 * the settings registry (an admin change is seen by the very next check), and the admin routes {@code GET /margin} and {@code GET/PUT /fee-model} answer.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
class AdminCatalogMarginResourceIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ProductRepository products;
    @Autowired private CatalogService catalog;
    @Autowired private CatalogPortAdapter port;
    @Autowired private MarginCalculator calculator;
    @Autowired private MarginSettingsPort marginSettings;
    @Autowired private com.dossier.api.service.ResumeBuilderSettings rbs;

    /** The settings cache survives the rollback of a test that wrote a setting: drop it before and after every test. */
    @org.junit.jupiter.api.BeforeEach
    void dropSettingsCacheBefore() {
        rbs.invalidate();
    }

    @org.junit.jupiter.api.AfterEach
    void dropSettingsCacheAfter() {
        rbs.invalidate();
    }

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void aNormalUserIsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/catalog/margin").param("amountMinor", "1999")).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/catalog/fee-model")).andExpect(status().isForbidden());
        mockMvc.perform(put("/api/admin/catalog/fee-model").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    }

    @Test
    void theCatalogPortReadsTheActiveRowWithItsKindAndAiWindow() {
        Product p = new Product();
        p.setCode("IT_PORT_PRODUCT");
        p.setName("Port product");
        p.setKind("FEATURE");
        p.setSoldTo("BOTH");
        p.setActive(true);
        p = products.save(p);
        PriceRequest req = new PriceRequest(p.getId(), "INDIVIDUAL", "MONTH", 499L, "USD", null, null, null, null, null, null, null, null, "wiring test");
        PriceDTO draft = catalog.createDraft(req);
        assertThat(port.activePrice("IT_PORT_PRODUCT", Audience.INDIVIDUAL, BillingInterval.MONTH, "USD", Instant.now())).as("a draft is not in force").isEmpty();
        catalog.publish(draft.id(), new PublishPriceRequest(null, "Publish for the wiring test", null));
        Optional<PriceRow> row = port.activePrice("IT_PORT_PRODUCT", Audience.INDIVIDUAL, BillingInterval.MONTH, "USD", Instant.now());
        assertThat(row).isPresent();
        assertThat(row.get().amountMinor()).isEqualTo(499L);
        assertThat(row.get().kind()).isEqualTo("FEATURE");
        assertThat(row.get().aiBudgetCentsPerWindow()).isZero();
        assertThat(port.activePrice("IT_PORT_PRODUCT", Audience.INDIVIDUAL, BillingInterval.QUARTER, "USD", Instant.now())).isEmpty();
        assertThat(port.activePrice("NO_SUCH_PRODUCT", Audience.INDIVIDUAL, BillingInterval.MONTH, "USD", Instant.now())).isEmpty();
    }

    @Test
    void marginPassesTheLockedProPriceAndRefusesAnUnderpricedOneWithLevers() throws Exception {
        mockMvc
            .perform(get("/api/admin/catalog/margin").param("kind", "BASE").param("audience", "INDIVIDUAL").param("interval", "MONTH").param("amountMinor", "1999").param("aiBudgetCents", "300"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ok").value(true))
            .andExpect(jsonPath("$.floorBp").value(8000))
            .andExpect(jsonPath("$.worst.marginBp").value(8059))
            .andExpect(jsonPath("$.worst.costMinor").value(388))
            .andExpect(jsonPath("$.levers").doesNotExist());
        mockMvc
            .perform(get("/api/admin/catalog/margin").param("amountMinor", "1499").param("aiBudgetCents", "300"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ok").value(false))
            .andExpect(jsonPath("$.code").value("MARGIN_BELOW_FLOOR"))
            .andExpect(jsonPath("$.levers.minPriceMinor").isNumber())
            .andExpect(jsonPath("$.headroomBp").value(org.hamcrest.Matchers.lessThan(0)));
        mockMvc.perform(get("/api/admin/catalog/margin").param("amountMinor", "1999").param("kind", "NOPE")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INVALID_VALUE"));
    }

    @Test
    void theFeeModelIsReadableAndChangingItTakesEffectOnTheNextCheck() throws Exception {
        mockMvc
            .perform(get("/api/admin/catalog/fee-model"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.model").value("SIMPLE"))
            .andExpect(jsonPath("$.stripe.pctBp").value(290))
            .andExpect(jsonPath("$.floors.subscriptionPct").value(80))
            .andExpect(jsonPath("$.schedule.billing_pct_bp").value(70));
        assertThat(calculator.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.MONTH, "USD", 1999, 300).pass()).isTrue();

        mockMvc
            .perform(put("/api/admin/catalog/fee-model").contentType(MediaType.APPLICATION_JSON).content("{\"model\":\"SCHEDULE\",\"reason\":\"Compare both models before Launch 2\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.feeModel.model").value("SCHEDULE"))
            .andExpect(jsonPath("$.reevaluation").isArray());
        assertThat(marginSettings.current().feeModel().name()).isEqualTo("SCHEDULE");
        assertThat(calculator.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.MONTH, "USD", 1999, 300).pass()).as("S-11: under SCHEDULE the locked Pro price fails").isFalse();
    }

    @Test
    void theFeeModelWriteNeedsAReasonAndRefusesNonsense() throws Exception {
        mockMvc.perform(put("/api/admin/catalog/fee-model").contentType(MediaType.APPLICATION_JSON).content("{\"model\":\"SCHEDULE\"}")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("REASON_REQUIRED"));
        mockMvc
            .perform(put("/api/admin/catalog/fee-model").contentType(MediaType.APPLICATION_JSON).content("{\"model\":\"FANCY\",\"reason\":\"Trying a nonsense model\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("OUT_OF_BOUNDS"));
        mockMvc
            .perform(put("/api/admin/catalog/fee-model").contentType(MediaType.APPLICATION_JSON).content("{\"schedule\":{\"unknown_field\":5},\"reason\":\"Trying an unknown field\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("OUT_OF_BOUNDS"));
    }
}
