package com.dossier.api.service.catalog;

import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.sub.ProductPriceRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PriceDTO;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PriceRequest;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PublishPriceRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.ComponentRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.ComponentsRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.PlanVersionDTO;
import com.dossier.api.service.catalog.dto.PlanDTOs.PublishPlanRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Shared helpers of the plan builder integration tests: seeded products by code, draft and live price rows, component lists and publish requests. Every
 * concrete test class carries the same annotations (so Spring reuses one context) and runs in a transaction that is rolled back.
 */
abstract class PlanItSupport {

    protected static final String REASON = "Launch pricing for the plan builder tests";

    @Autowired protected PlanService plans;
    @Autowired protected PlanPreviewService preview;
    @Autowired protected PlanLifecycleService lifecycle;
    @Autowired protected CatalogService catalog;
    @Autowired protected ProductRepository products;
    @Autowired protected ProductPriceRepository priceRepo;
    @Autowired protected JdbcTemplate jdbc;
    @Autowired protected ResumeBuilderSettings rbs;
    @Autowired protected ObjectMapper om;

    /** The settings cache survives the rollback of a test that wrote a setting: drop it around every test. */
    @BeforeEach
    void dropSettingsCacheBefore() {
        rbs.invalidate();
    }

    @AfterEach
    void dropSettingsCacheAfter() {
        rbs.invalidate();
    }

    protected Product product(String code) {
        return products.findByCode(code).orElseThrow(() -> new IllegalStateException("seeded product " + code + " is missing"));
    }

    /** A DRAFT price row. */
    protected PriceDTO draft(String productCode, String audience, String interval, long amountMinor) {
        return catalog.createDraft(new PriceRequest(product(productCode).getId(), audience, interval, amountMinor, "USD", null, null, false, null, null, null, null, null, REASON));
    }

    /** A price row that is already live (created and published). */
    protected PriceDTO live(String productCode, String audience, String interval, long amountMinor) {
        PriceDTO d = draft(productCode, audience, interval, amountMinor);
        return catalog.publish(d.id(), new PublishPriceRequest(null, REASON, null));
    }

    protected static ComponentRequest included(String feature) {
        return new ComponentRequest(feature, "INCLUDED", null, null, null, null, null, null, null, null);
    }

    protected ComponentRequest optional(String feature, String productCode, Integer max) {
        return new ComponentRequest(feature, "OPTIONAL", product(productCode).getId(), null, null, 1, max, null, null, null);
    }

    protected ComponentRequest seatOptional(String feature, String productCode, Integer max) {
        return new ComponentRequest(feature, "SEAT_OPTIONAL", product(productCode).getId(), null, null, 1, max, null, null, null);
    }

    /** The stored components of a version as requests (so a test can drop or add one and put the list back). */
    protected List<ComponentRequest> componentsOf(PlanVersionDTO v) {
        List<ComponentRequest> out = new ArrayList<>();
        v.components().forEach(c -> out.add(new ComponentRequest(c.featureKey(), c.role(), c.productId(), c.allowanceOverride(), c.limitOverrides(), c.defaultQuantity(), c.maxQuantity(), c.componentDiscountBp(), c.sortOrder(), c.marketingLabel())));
        return out;
    }

    protected PlanVersionDTO withComponents(String planKey, int version, List<ComponentRequest> list) {
        return plans.putComponents(planKey, version, new ComponentsRequest(list, null));
    }

    protected PlanVersionDTO withoutOptionals(String planKey, int version) {
        PlanVersionDTO v = plans.getVersion(planKey, version);
        List<ComponentRequest> keep = componentsOf(v).stream().filter(c -> !"OPTIONAL".equals(c.role()) && !"SEAT_OPTIONAL".equals(c.role())).toList();
        return withComponents(planKey, version, keep);
    }

    protected PlanVersionDTO patch(String planKey, int version, String json) {
        try {
            JsonNode n = om.readTree(json);
            return plans.patchVersion(planKey, version, n);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalArgumentException(e);
        }
    }

    protected static PublishPlanRequest publishRequest(int version, String overrideReason) {
        return new PublishPlanRequest(null, overrideReason, version, REASON);
    }

    protected static String key() {
        return UUID.randomUUID().toString();
    }

    protected PlanVersionDTO publish(String planKey, int version) {
        return plans.publish(planKey, version, publishRequest(version, null), key());
    }

    protected ProductPrice row(Long id) {
        return priceRepo.findById(id).orElseThrow();
    }
}
