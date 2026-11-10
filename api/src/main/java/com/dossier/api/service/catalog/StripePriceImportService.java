package com.dossier.api.service.catalog;

import com.dossier.api.domain.catalog.Plan;
import com.dossier.api.domain.catalog.PlanVersion;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.repository.sub.ProductPriceRepository;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.PriceInterval;
import com.dossier.api.service.billing.StripeGateway.StripePriceInfo;
import com.dossier.api.service.billing.StripeProperties;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PriceDTO;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PriceRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decision B-01 (answered 2026-10-16): make PRO v1 publishable on a box that already sells Pro, without retyping the prices. Reads the configured
 * {@code STRIPE_PRICE_MONTHLY} and {@code STRIPE_PRICE_3MO} price ids (Stripe is the truth) through the gateway and creates the matching
 * {@code product_price} rows for the plan's base product: MONTH and QUARTER, INDIVIDUAL, amount and currency copied from Stripe, {@code stripe_price_id}
 * set, status DRAFT, so the margin guard still runs at plan publish.
 *
 * <p>Idempotent and never destructive: a (product, interval, currency) that already has a non-retired row, or a Stripe price id that is already on a row,
 * is skipped and reported; nothing is overwritten. Needs billing on (503 BILLING_DISABLED); HIGH audit with a reason. It is the cut-over runbook step
 * documented in {@code docs/subscriptions/README.md}. No Stripe write happens here and no key or customer id is logged.
 */
@Service
public class StripePriceImportService {

    private static final Logger LOG = LoggerFactory.getLogger(StripePriceImportService.class);
    public static final String PRICES_IMPORTED = "PLAN_PRICES_IMPORTED";

    /** One configured price id and what became of it: CREATED, SKIPPED_EXISTS or NOT_CONFIGURED. */
    public record ImportedRow(String interval, String stripePriceId, String outcome, Long priceId, Long amountMinor, String currency) {}

    public record ImportResult(String planKey, int version, List<ImportedRow> rows) {}

    public record ImportRequest(String reason) {}

    private final PlanService plans;
    private final CatalogService catalog;
    private final ProductPriceRepository prices;
    private final StripeGateway gateway;
    private final StripeProperties props;
    private final AdminAuditService audit;

    public StripePriceImportService(PlanService plans, CatalogService catalog, ProductPriceRepository prices, StripeGateway gateway, StripeProperties props, AdminAuditService audit) {
        this.plans = plans;
        this.catalog = catalog;
        this.prices = prices;
        this.gateway = gateway;
        this.props = props;
        this.audit = audit;
    }

    @Transactional
    public ImportResult importPrices(String planKey, int v, ImportRequest body) {
        String reason = body == null || body.reason() == null ? "" : body.reason().trim();
        if (reason.length() < CatalogException.REASON_MIN_LENGTH) {
            throw CatalogException.unprocessable("REASON_REQUIRED", "Importing Stripe prices needs a reason of at least " + CatalogException.REASON_MIN_LENGTH + " characters.");
        }
        Plan plan = plans.plan(planKey);
        PlanVersion ver = plans.version(plan, v);
        if (!"PRO".equals(plan.getPlanKey()) || !"INDIVIDUAL".equals(plan.getAudience())) {
            throw CatalogException.unprocessable("IMPORT_NOT_SUPPORTED", "Only the Pro plan has launch price ids to import (STRIPE_PRICE_MONTHLY and STRIPE_PRICE_3MO).", Map.of("planKey", plan.getPlanKey()));
        }
        if (!"DRAFT".equals(ver.getStatus())) {
            throw CatalogException.conflict("NOT_DRAFT", "Version " + ver.getVersion() + " is " + ver.getStatus() + ": import into a draft version.", Map.of("status", ver.getStatus()));
        }
        if (!gateway.isEnabled()) {
            throw new CatalogException(503, "BILLING_DISABLED", "Stripe is off (no key configured); there is nothing to import from.", null);
        }
        if (ver.getBaseProductId() == null) {
            throw CatalogException.unprocessable("BASE_PRODUCT_REQUIRED", "Version " + ver.getVersion() + " has no base product to attach the prices to.", Map.of("planKey", plan.getPlanKey()));
        }
        Long productId = ver.getBaseProductId();
        List<ImportedRow> rows = new ArrayList<>();
        rows.add(one(productId, "MONTH", PriceInterval.MONTH, props.getPriceMonthly(), reason));
        rows.add(one(productId, "QUARTER", PriceInterval.QUARTER, props.getPrice3mo(), reason));

        Map<String, Object> detail = new LinkedHashMap<>();
        rows.forEach(r -> detail.put(r.interval(), r.outcome() + (r.priceId() == null ? "" : " price=" + r.priceId())));
        audit.record(PRICES_IMPORTED, AdminAuditService.TARGET_CATALOG, "plan:" + plan.getPlanKey() + ":v" + v, reason, "risk=HIGH plan=" + plan.getPlanKey() + " version=" + v + " " + detail);
        LOG.info("catalog: stripe price import for {} v{}: {}", plan.getPlanKey(), v, detail);
        return new ImportResult(plan.getPlanKey(), v, rows);
    }

    private ImportedRow one(Long productId, String interval, PriceInterval expected, String stripePriceId, String reason) {
        if (stripePriceId == null || stripePriceId.isBlank()) return new ImportedRow(interval, null, "NOT_CONFIGURED", null, null, null);
        // already on a row (any status): the import ran before
        var onRow = prices.findByStripePriceId(stripePriceId).orElse(null);
        if (onRow != null) return new ImportedRow(interval, stripePriceId, "SKIPPED_EXISTS", onRow.getId(), onRow.getAmountMinor(), onRow.getCurrency());
        StripePriceInfo info = gateway.retrievePrice(stripePriceId);
        if (!info.active() || info.interval() != expected || info.unitAmountMinor() <= 0 || info.currency() == null) {
            throw CatalogException.unprocessable(
                "STRIPE_PRICE_MISMATCH",
                "The configured " + interval + " price is not an active " + interval + " recurring price in Stripe; fix the setting and try again.",
                Map.of("interval", interval, "active", info.active(), "stripeInterval", String.valueOf(info.interval()))
            );
        }
        for (ProductPrice p : prices.findByProductIdOrderByIdDesc(productId)) {
            if ("INDIVIDUAL".equals(p.getAudience()) && interval.equals(p.getBillingInterval()) && info.currency().equals(p.getCurrency()) && !"RETIRED".equals(p.status())) {
                return new ImportedRow(interval, stripePriceId, "SKIPPED_EXISTS", p.getId(), p.getAmountMinor(), p.getCurrency());
            }
        }
        PriceDTO created = catalog.createDraft(new PriceRequest(productId, "INDIVIDUAL", interval, info.unitAmountMinor(), info.currency(), null, null, false, null, null, null, null, null, reason));
        ProductPrice row = prices.findById(created.id()).orElseThrow();
        row.setStripePriceId(stripePriceId);
        prices.saveAndFlush(row);
        return new ImportedRow(interval, stripePriceId, "CREATED", created.id(), info.unitAmountMinor(), info.currency());
    }
}
