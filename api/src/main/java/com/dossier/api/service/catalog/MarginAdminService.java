package com.dossier.api.service.catalog;

import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.billing.margin.CheckKind;
import com.dossier.api.service.billing.margin.FeeLine;
import com.dossier.api.service.billing.margin.FeeModelKind;
import com.dossier.api.service.billing.margin.MarginCalculator;
import com.dossier.api.service.billing.margin.MarginCalculator.Reevaluation;
import com.dossier.api.service.billing.margin.MarginCheck;
import com.dossier.api.service.billing.margin.MarginLevers;
import com.dossier.api.service.billing.margin.MarginSettings;
import com.dossier.api.service.catalog.plan.PlanLoader;
import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.TextNode;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The admin side of the margin guard (docs/subscriptions/09 section 1.2): "what would this price earn" ({@link #margin}), the fee model as the guard reads it
 * ({@link #feeModel}) and changing it ({@link #setFeeModel}, HIGH, with a re-evaluation of every published plan under the new numbers).
 */
@Service
public class MarginAdminService {

    public static final String FEE_MODEL_SET = "CATALOG_FEE_MODEL_SET";

    private final MarginCalculator calculator;
    private final CatalogMarginSettings marginSettings;
    private final SettingsService settings;
    private final PlanLoader loader;
    private final AdminAuditService audit;
    private final ObjectMapper mapper;

    public MarginAdminService(MarginCalculator calculator, CatalogMarginSettings marginSettings, SettingsService settings, PlanLoader loader, AdminAuditService audit, ObjectMapper mapper) {
        this.calculator = calculator;
        this.marginSettings = marginSettings;
        this.settings = settings;
        this.loader = loader;
        this.audit = audit;
        this.mapper = mapper;
    }

    // ---- GET /margin -----------------------------------------------------------------------------------------------------

    public record FeeLineDTO(String key, long cents) {}

    public record Worst(long marginBp, long costMinor, long feeMinor, long aiMinor, List<FeeLineDTO> lines) {}

    public record MarginDTO(Worst worst, Object typical, long floorBp, boolean ok, long headroomBp, MarginLevers levers, String code, boolean overridable) {}

    /**
     * @param kind          BASE (default), OPTIONAL, DISCOUNT, ONE_TIME or SERVICE
     * @param amountMinor   the price of ONE unit in minor units (the net price for DISCOUNT; the list price for SERVICE)
     * @param aiBudgetCents the worst-case AI cost of one unit over the whole billing period
     * @param quantity      units on the line (price and AI budget are multiplied by it); default 1
     */
    @Transactional(readOnly = true)
    public MarginDTO margin(String kind, String audience, String interval, long amountMinor, long aiBudgetCents, int quantity, long payoutMinor, int discountBp, String currency) {
        String k = kind == null || kind.isBlank() ? "BASE" : kind.trim().toUpperCase(Locale.ROOT);
        Audience a = parseAudience(audience);
        BillingInterval i = parseInterval(interval);
        String cur = currency == null || currency.isBlank() ? "USD" : currency.trim().toUpperCase(Locale.ROOT);
        if (amountMinor < 0 || aiBudgetCents < 0 || quantity < 1 || quantity > 10_000 || payoutMinor < 0 || discountBp < 0 || discountBp > 10_000) {
            throw CatalogException.unprocessable("INVALID_VALUE", "amountMinor, aiBudgetCents, payoutMinor and discountBp must not be negative, quantity is 1 to 10000, discountBp is at most 10000.");
        }
        long amount = Math.multiplyExact(amountMinor, (long) quantity);
        long ai = Math.multiplyExact(aiBudgetCents, (long) quantity);
        MarginCheck c;
        switch (k) {
            case "BASE" -> c = calculator.checkBase("price", a, i, cur, amount, ai);
            case "OPTIONAL" -> c = calculator.checkFeature("price", a, i, cur, amount, ai);
            case "DISCOUNT" -> c = calculator.checkDiscountedPrice("price", a, i, cur, amount, ai, true);
            case "ONE_TIME" -> c = calculator.checkOneTime("price", a, cur, amount, ai);
            case "SERVICE" -> c = calculator.checkService("price", a, cur, amount, discountBp, Math.multiplyExact(payoutMinor, (long) quantity), ai);
            default -> throw CatalogException.unprocessable("INVALID_VALUE", "kind must be BASE, OPTIONAL, DISCOUNT, ONE_TIME or SERVICE.", Map.of("field", "kind"));
        }
        long cost = Math.addExact(c.feeMinor(), c.aiCostMinor());
        List<FeeLineDTO> lines = c.feeLines().stream().map((FeeLine f) -> new FeeLineDTO(f.key(), f.cents())).toList();
        return new MarginDTO(new Worst(c.marginBp(), cost, c.feeMinor(), c.aiCostMinor(), lines), null, c.floorBp(), c.pass(), c.marginBp() - c.floorBp(), c.levers(), c.code(), c.overridable());
    }

    // ---- fee model -------------------------------------------------------------------------------------------------------

    public record FeeModelDTO(String model, Map<String, Object> schedule, Map<String, Object> stripe, Map<String, Object> floors, String version) {}

    public record ReevaluationDTO(String planKey, String featureKey, CheckKind kind, BillingInterval interval, String currency, long amountMinor, long marginBp, long floorBp, boolean passedBefore) {}

    public record FeeModelResult(FeeModelDTO feeModel, List<ReevaluationDTO> reevaluation) {}

    public record FeeModelRequest(String model, JsonNode schedule, String reason) {}

    @Transactional(readOnly = true)
    public FeeModelDTO feeModel() {
        return dto(marginSettings.current());
    }

    private FeeModelDTO dto(MarginSettings s) {
        return new FeeModelDTO(
            s.feeModel().name(),
            CatalogMarginSettings.scheduleMap(s.schedule()),
            Map.of("pctBp", s.stripePctBp(), "fixedCents", s.stripeFixedCents(), "invoicingBp", s.invoicingBp()),
            Map.of("subscriptionPct", s.floorSubscriptionPct(), "servicePct", s.floorServicePct(), "orgAboveIndividualPct", s.orgAboveIndividualPct()),
            s.feeModelInstance().fingerprint()
        );
    }

    /** Change the fee model and/or its schedule (HIGH, reason). Returns the new model and every published row that now sits below the floor. */
    @Transactional
    public FeeModelResult setFeeModel(FeeModelRequest r) {
        if (r == null || r.reason() == null || r.reason().trim().length() < CatalogException.REASON_MIN_LENGTH) {
            throw CatalogException.unprocessable("REASON_REQUIRED", "Changing the fee model needs a reason of at least " + CatalogException.REASON_MIN_LENGTH + " characters.");
        }
        String reason = r.reason().trim();
        MarginSettings before = marginSettings.current();
        FeeModelKind kind = before.feeModel();
        if (r.model() != null && !r.model().isBlank()) {
            try {
                kind = FeeModelKind.valueOf(r.model().trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw outOfBounds("model must be SIMPLE or SCHEDULE.", "model");
            }
        }
        if (r.schedule() != null) {
            if (!r.schedule().isObject() || r.schedule().isEmpty()) throw outOfBounds("schedule must be a non-empty object.", "schedule");
            String unknown = CatalogMarginSettings.unknownField(r.schedule());
            if (unknown != null) throw outOfBounds("Unknown fee schedule field " + unknown + ".", "schedule." + unknown);
        }
        MarginSettings after;
        try {
            after = marginSettings.with(kind, r.schedule());
        } catch (IllegalArgumentException e) {
            throw outOfBounds(e.getMessage(), "schedule");
        }
        if (kind != before.feeModel()) settings.set(BillingSettingKeys.FEES_MODEL, TextNode.valueOf(kind.name()), reason);
        if (r.schedule() != null) settings.set(BillingSettingKeys.FEES_SCHEDULE, r.schedule(), reason);
        List<Reevaluation> bad = MarginCalculator.reevaluate(loader.publishedCompositions(), before, after);
        List<ReevaluationDTO> rows = bad.stream()
            .map(e -> new ReevaluationDTO(e.planKey(), e.after().featureKey(), e.after().kind(), e.after().interval(), e.after().currency(), e.after().amountMinor(), e.after().marginBp(), e.after().floorBp(), e.passedBefore()))
            .toList();
        audit.record(
            FEE_MODEL_SET, AdminAuditService.TARGET_CATALOG, "fee-model", reason,
            "risk=HIGH from=" + before.feeModel() + " to=" + kind + " scheduleChanged=" + (r.schedule() != null) + " belowFloor=" + rows.size()
        );
        return new FeeModelResult(dto(after), rows);
    }

    private static CatalogException outOfBounds(String message, String field) {
        return CatalogException.unprocessable("OUT_OF_BOUNDS", message, Map.of("field", field));
    }

    private static Audience parseAudience(String s) {
        try {
            return s == null || s.isBlank() ? Audience.INDIVIDUAL : Audience.valueOf(s.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw CatalogException.unprocessable("INVALID_VALUE", "audience must be INDIVIDUAL or ORG.", Map.of("field", "audience"));
        }
    }

    private static BillingInterval parseInterval(String s) {
        try {
            return s == null || s.isBlank() ? BillingInterval.MONTH : BillingInterval.valueOf(s.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw CatalogException.unprocessable("INVALID_VALUE", "interval must be MONTH, QUARTER, YEAR or ONE_TIME.", Map.of("field", "interval"));
        }
    }
}
