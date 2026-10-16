package com.dossier.api.service.catalog;

import com.dossier.api.domain.catalog.Plan;
import com.dossier.api.domain.catalog.PlanComponent;
import com.dossier.api.domain.catalog.PlanVersion;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.sub.PlanComponentRepository;
import com.dossier.api.repository.sub.PlanRepository;
import com.dossier.api.repository.sub.PlanVersionRepository;
import com.dossier.api.repository.sub.ProductPriceRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.billing.margin.MarginCalculator;
import com.dossier.api.service.billing.margin.MarginCheck;
import com.dossier.api.service.billing.margin.MarginReport;
import com.dossier.api.service.catalog.CatalogService.PublishedBatch;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PriceRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.ComponentDTO;
import com.dossier.api.service.catalog.dto.PlanDTOs.ComponentRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.ComponentsRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.CompareDTO;
import com.dossier.api.service.catalog.dto.PlanDTOs.CreatePlanRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.DiffRow;
import com.dossier.api.service.catalog.dto.PlanDTOs.DiscardRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.LiveVersion;
import com.dossier.api.service.catalog.dto.PlanDTOs.NewVersionRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.PlanDTO;
import com.dossier.api.service.catalog.dto.PlanDTOs.PlanSummaryDTO;
import com.dossier.api.service.catalog.dto.PlanDTOs.PlanVersionDTO;
import com.dossier.api.service.catalog.dto.PlanDTOs.PriceView;
import com.dossier.api.service.catalog.dto.PlanDTOs.ProductView;
import com.dossier.api.service.catalog.dto.PlanDTOs.PublishPlanRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.UpdatePlanRequest;
import com.dossier.api.service.catalog.plan.PlanCompositions;
import com.dossier.api.service.catalog.plan.PlanLoader;
import com.dossier.api.service.catalog.plan.PlanModel;
import com.dossier.api.service.catalog.plan.PlanSnapshot;
import com.dossier.api.service.catalog.plan.PlanSubscriberCounts;
import com.dossier.api.service.catalog.plan.PlanValidator;
import com.dossier.api.service.catalog.plan.PriceBook;
import com.dossier.api.service.catalog.plan.PriceBook.Entry;
import com.dossier.api.service.catalog.plan.PriceBook.Source;
import com.dossier.api.service.pricing.BillingInterval;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The plan builder's server side (docs/subscriptions/02 section 3, 04, 09 section 1.3; stories K2.2 and K9.1): plans, DRAFT versions, components, the
 * invariants, and the one transaction that makes a version live.
 *
 * <p><b>Publish</b> (HIGH, typed confirmation = the version number, Idempotency-Key): validates the version ({@link PlanValidator}), prices it from the
 * {@link PriceBook} (the DRAFT rows it will publish, the ACTIVE rows in force, and the yearly rows derived from the monthly ones when annual billing is on,
 * K9.1), runs the margin guard on every offered currency ({@link MarginCalculator#requirePublishable}: a failing row blocks the publish unless an
 * {@code overrideReason} of at least 10 characters is given, which writes a HIGH {@code CATALOG_MARGIN_OVERRIDE} audit row; derived yearly rows are discount
 * rows and are never overridable), creates the derived rows, publishes every price row and the version under ONE catalog version
 * ({@link CatalogService#publishBatch}, Stripe Prices created before the commit), supersedes the previous live version (still servable to its subscribers),
 * stores the snapshot and its hash, and records the change and the audit event. A replay with the same Idempotency-Key answers the same version and never
 * publishes twice. A published version is immutable: every write path answers 409 NOT_DRAFT.
 */
@Service
public class PlanService {

    public static final String PLAN_CREATE = "PLAN_CREATE";
    public static final String PLAN_UPDATE = "PLAN_UPDATE";
    public static final String PLAN_VERSION_CREATE = "PLAN_VERSION_CREATE";
    public static final String PLAN_VERSION_UPDATE = "PLAN_VERSION_UPDATE";
    public static final String PLAN_COMPONENTS_SET = "PLAN_COMPONENTS_SET";
    public static final String PLAN_DISCARD = "PLAN_DISCARD";
    public static final String PLAN_PUBLISHED = "PLAN_PUBLISHED";
    public static final String CATALOG_MARGIN_OVERRIDE = "CATALOG_MARGIN_OVERRIDE";

    private static final Pattern PLAN_KEY = Pattern.compile("[A-Z][A-Z0-9_]{1,39}");
    private static final List<BillingInterval> ORDER = List.of(BillingInterval.MONTH, BillingInterval.QUARTER, BillingInterval.YEAR, BillingInterval.ONE_TIME);

    private final PlanRepository plans;
    private final PlanVersionRepository versions;
    private final PlanComponentRepository components;
    private final ProductRepository products;
    private final FeatureDefinitionRepository features;
    private final ProductPriceRepository prices;
    private final PlanLoader loader;
    private final PlanValidator validator;
    private final PlanSnapshot snapshots;
    private final PlanSubscriberCounts counts;
    private final CatalogService catalog;
    private final CatalogSettings settings;
    private final MarginCalculator calculator;
    private final CatalogChangeRecorder changes;
    private final AdminAuditService audit;
    private final List<PriceStripeSync> stripeSyncs;
    private final ObjectMapper mapper;
    private final Clock clock = Clock.systemUTC();

    public PlanService(
        PlanRepository plans,
        PlanVersionRepository versions,
        PlanComponentRepository components,
        ProductRepository products,
        FeatureDefinitionRepository features,
        ProductPriceRepository prices,
        PlanLoader loader,
        PlanValidator validator,
        PlanSnapshot snapshots,
        PlanSubscriberCounts counts,
        CatalogService catalog,
        CatalogSettings settings,
        MarginCalculator calculator,
        CatalogChangeRecorder changes,
        AdminAuditService audit,
        List<PriceStripeSync> stripeSyncs,
        ObjectMapper mapper
    ) {
        this.plans = plans;
        this.versions = versions;
        this.components = components;
        this.products = products;
        this.features = features;
        this.prices = prices;
        this.loader = loader;
        this.validator = validator;
        this.snapshots = snapshots;
        this.counts = counts;
        this.catalog = catalog;
        this.settings = settings;
        this.calculator = calculator;
        this.changes = changes;
        this.audit = audit;
        this.stripeSyncs = stripeSyncs;
        this.mapper = mapper;
    }

    // ---- reads -----------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<PlanSummaryDTO> list(String audience, String status) {
        String a = audience == null || audience.isBlank() ? null : audience.trim().toUpperCase(Locale.ROOT);
        String s = status == null || status.isBlank() ? null : status.trim().toUpperCase(Locale.ROOT);
        List<PlanSummaryDTO> out = new ArrayList<>();
        for (Plan p : plans.findAllByOrderBySortOrderAscIdAsc()) {
            if (a != null && !a.equals(p.getAudience())) continue;
            if (s != null && !s.equals(p.getStatus())) continue;
            out.add(summary(p));
        }
        return out;
    }

    private PlanSummaryDTO summary(Plan p) {
        PlanVersion live = versions.findLive(p.getId()).orElse(null);
        Integer draft = versions.findByPlanIdOrderByVersionDesc(p.getId()).stream().filter(v -> "DRAFT".equals(v.getStatus())).map(PlanVersion::getVersion).findFirst().orElse(null);
        Map<String, Long> subs = new LinkedHashMap<>();
        counts.byVersion(p.getId()).forEach((v, n) -> subs.put(String.valueOf(v), n));
        Map<String, Long> priceByInterval = new LinkedHashMap<>();
        Long worst = null;
        if (live != null) {
            PlanModel m = loader.model(p, live);
            String currency = settings.defaultCurrency();
            PriceBook book = loader.book(m, clock.instant(), currency, false);
            String base = m.baseProductCode() != null ? m.baseProductCode() : m.components().stream().filter(PlanModel.Comp::base).map(PlanModel.Comp::productCode).filter(Objects::nonNull).findFirst().orElse(null);
            if (base != null) {
                for (BillingInterval i : ORDER) book.get(base, i, currency).ifPresent(e -> priceByInterval.put(i.name(), e.amountMinor()));
            }
            if (!m.pricedProductCodes().isEmpty() && PlanLoader.missing(m, book, currency).isEmpty()) {
                MarginReport r = calculator.checkPlan(PlanCompositions.of(m, book, currency));
                worst = r.checks().stream().map(MarginCheck::marginBp).min(Long::compare).orElse(null);
            }
        }
        return new PlanSummaryDTO(
            p.getPlanKey(), p.getName(), p.getAudience(), p.getStatus(), Boolean.TRUE.equals(p.getPublicPlan()),
            live == null ? null : new LiveVersion(live.getVersion(), live.getEffectiveFrom()), draft, subs, priceByInterval, worst, planKeyOf(p.getSuccessorPlanId())
        );
    }

    @Transactional(readOnly = true)
    public PlanDTO get(String planKey) {
        Plan p = plan(planKey);
        List<PlanVersionDTO> vs = new ArrayList<>();
        for (PlanVersion v : versions.findByPlanIdOrderByVersionDesc(p.getId())) vs.add(versionDto(p, v));
        return planDto(p, vs);
    }

    @Transactional(readOnly = true)
    public PlanVersionDTO getVersion(String planKey, int v) {
        Plan p = plan(planKey);
        return versionDto(p, version(p, v));
    }

    // ---- plan writes -----------------------------------------------------------------------------------------------------

    @Transactional
    public PlanDTO create(CreatePlanRequest r) {
        if (r == null) throw CatalogException.unprocessable("INVALID_VALUE", "A plan body is required.");
        String reason = requireReason(r.reason(), "Creating a plan");
        String key = r.planKey() == null ? "" : r.planKey().trim().toUpperCase(Locale.ROOT);
        if (!PLAN_KEY.matcher(key).matches()) {
            throw CatalogException.unprocessable("KEY_FORMAT", "A plan key is 2 to 40 upper-case letters, digits and underscores, starting with a letter.", Map.of("field", "planKey"));
        }
        if (plans.findByPlanKey(key).isPresent()) throw CatalogException.conflict("PLAN_KEY_EXISTS", "Plan " + key + " already exists.", Map.of("planKey", key));
        String audience = r.audience() == null ? "" : r.audience().trim().toUpperCase(Locale.ROOT);
        if (!CatalogService.AUDIENCES.contains(audience)) throw CatalogException.unprocessable("INVALID_VALUE", "audience must be INDIVIDUAL or ORG.", Map.of("field", "audience"));
        if (r.name() == null || r.name().isBlank() || r.name().trim().length() > 80) throw CatalogException.unprocessable("NAME_REQUIRED", "A plan has a name of 1 to 80 characters.", Map.of("field", "name"));
        checkText("description", r.description(), 1000);
        checkText("badge", r.badge(), 40);
        Instant now = now();
        Plan p = new Plan();
        p.setPlanKey(key);
        p.setName(r.name().trim());
        p.setAudience(audience);
        p.setStatus("DRAFT");
        p.setPublicPlan(Boolean.TRUE.equals(r.publicPlan()));
        p.setDescription(blankToNull(r.description()));
        p.setBadge(blankToNull(r.badge()));
        p.setSortOrder(r.sortOrder() == null ? 100 : r.sortOrder());
        p.setEligibilityJson(jsonOrNull(r.eligibility()));
        p.setCreatedAt(now);
        p.setCreatedBy(actor());
        p.setUpdatedAt(now);
        p.setUpdatedBy(actor());
        p = plans.saveAndFlush(p);
        PlanVersion v = new PlanVersion();
        v.setPlanId(p.getId());
        v.setVersion(1);
        v.setStatus("DRAFT");
        v.setIntervalsJson(write(defaultIntervals(audience)));
        v.setAiBudgetCapCents(0);
        v.setCreatedAt(now);
        v.setCreatedBy(actor());
        v.setUpdatedAt(now);
        versions.saveAndFlush(v);
        PlanDTO after = get(key);
        changes.record(CatalogChangeRecorder.ENTITY_PLAN, key, null, after, reason);
        audit.record(PLAN_CREATE, AdminAuditService.TARGET_CATALOG, "plan:" + key, reason, "risk=HIGH plan=" + key + " audience=" + audience);
        return after;
    }

    @Transactional
    public PlanDTO update(String planKey, UpdatePlanRequest r) {
        if (r == null) throw CatalogException.unprocessable("INVALID_VALUE", "A plan body is required.");
        String reason = requireReason(r.reason(), "Changing a plan");
        Plan p = plan(planKey);
        if (r.expectedUpdatedAt() != null && p.getUpdatedAt() != null && !sameInstant(r.expectedUpdatedAt(), p.getUpdatedAt())) {
            throw CatalogException.conflict("VERSION_CONFLICT", "Plan " + planKey + " changed since you opened it.", Map.of("updatedAt", String.valueOf(p.getUpdatedAt())));
        }
        PlanDTO before = get(planKey);
        if (r.name() != null) {
            if (r.name().isBlank() || r.name().trim().length() > 80) throw CatalogException.unprocessable("NAME_REQUIRED", "A plan has a name of 1 to 80 characters.", Map.of("field", "name"));
            p.setName(r.name().trim());
        }
        if (r.description() != null) {
            checkText("description", r.description(), 1000);
            p.setDescription(blankToNull(r.description()));
        }
        if (r.badge() != null) {
            checkText("badge", r.badge(), 40);
            p.setBadge(blankToNull(r.badge()));
        }
        if (r.publicPlan() != null) p.setPublicPlan(r.publicPlan());
        if (r.sortOrder() != null) p.setSortOrder(r.sortOrder());
        if (r.eligibility() != null) p.setEligibilityJson(r.eligibility().isNull() ? null : jsonOrNull(r.eligibility()));
        p.setUpdatedAt(now());
        p.setUpdatedBy(actor());
        plans.saveAndFlush(p);
        PlanDTO after = get(planKey);
        changes.record(CatalogChangeRecorder.ENTITY_PLAN, planKey, before, after, reason);
        audit.record(PLAN_UPDATE, AdminAuditService.TARGET_CATALOG, "plan:" + planKey, reason, "risk=HIGH plan=" + planKey);
        return after;
    }

    // ---- version writes (DRAFT only) ---------------------------------------------------------------------------------------

    @Transactional
    public PlanVersionDTO newVersion(String planKey, NewVersionRequest r) {
        String reason = requireReason(r == null ? null : r.reason(), "Starting a new version");
        Plan p = plan(planKey);
        requireEditable(p);
        List<PlanVersion> all = versions.findByPlanIdOrderByVersionDesc(p.getId());
        if (all.stream().anyMatch(v -> "DRAFT".equals(v.getStatus()))) {
            throw CatalogException.conflict("DRAFT_EXISTS", "Plan " + planKey + " already has a draft version.", Map.of("planKey", planKey));
        }
        PlanVersion from;
        if (r != null && r.from() != null) {
            from = version(p, r.from());
        } else {
            from = versions.findLive(p.getId()).orElse(all.isEmpty() ? null : all.get(0));
        }
        Instant now = now();
        PlanVersion v = new PlanVersion();
        v.setPlanId(p.getId());
        v.setVersion(all.isEmpty() ? 1 : all.get(0).getVersion() + 1);
        v.setStatus("DRAFT");
        v.setCreatedAt(now);
        v.setCreatedBy(actor());
        v.setUpdatedAt(now);
        if (from != null) {
            v.setBaseProductId(from.getBaseProductId());
            v.setIntervalsJson(from.getIntervalsJson());
            v.setAnnualDiscountBp(from.getAnnualDiscountBp());
            v.setAiBudgetCapCents(from.getAiBudgetCapCents());
            v.setAiWindowJson(from.getAiWindowJson());
            v.setSeatRulesJson(from.getSeatRulesJson());
            v.setPresetsJson(from.getPresetsJson());
        } else {
            v.setIntervalsJson(write(defaultIntervals(p.getAudience())));
        }
        v = versions.saveAndFlush(v);
        if (from != null) {
            for (PlanComponent c : components.findByPlanVersionIdOrderBySortOrderAscIdAsc(from.getId())) {
                PlanComponent n = new PlanComponent();
                n.setPlanVersionId(v.getId());
                n.setFeatureKey(c.getFeatureKey());
                n.setRole(c.getRole());
                n.setProductId(c.getProductId());
                n.setAllowanceOverride(c.getAllowanceOverride());
                n.setLimitOverridesJson(c.getLimitOverridesJson());
                n.setDefaultQuantity(c.getDefaultQuantity());
                n.setMaxQuantity(c.getMaxQuantity());
                n.setComponentDiscountBp(c.getComponentDiscountBp());
                n.setSortOrder(c.getSortOrder());
                n.setMarketingLabel(c.getMarketingLabel());
                components.save(n);
            }
            components.flush();
        }
        PlanVersionDTO after = versionDto(p, v);
        changes.record(CatalogChangeRecorder.ENTITY_PLAN_VERSION, planKey + ":" + v.getVersion(), null, after, reason);
        audit.record(PLAN_VERSION_CREATE, AdminAuditService.TARGET_CATALOG, "plan:" + planKey + ":v" + v.getVersion(), reason, "risk=HIGH plan=" + planKey + " version=" + v.getVersion() + " from=" + (from == null ? "none" : from.getVersion()));
        return after;
    }

    /**
     * Partial update of a DRAFT: only the fields present in {@code body} change. Fields: {@code intervals} (array), {@code annualDiscountBp} (int or null),
     * {@code aiBudgetCapCents}, {@code aiWindows} (object of interval to cents, or null), {@code baseProductId} (id or null), {@code seatRules}, {@code presets},
     * {@code summary}, {@code expectedUpdatedAt} (409 VERSION_CONFLICT when stale).
     */
    @Transactional
    public PlanVersionDTO patchVersion(String planKey, int v, JsonNode body) {
        if (body == null || !body.isObject()) throw CatalogException.unprocessable("INVALID_VALUE", "A JSON object is required.");
        Plan p = plan(planKey);
        PlanVersion ver = version(p, v);
        requireDraft(ver);
        if (body.hasNonNull("expectedUpdatedAt") && !sameInstant(Instant.parse(body.get("expectedUpdatedAt").asText()), ver.getUpdatedAt())) {
            throw CatalogException.conflict("VERSION_CONFLICT", "Version " + v + " of " + planKey + " changed since you opened it.", Map.of("updatedAt", String.valueOf(ver.getUpdatedAt())));
        }
        PlanVersionDTO before = versionDto(p, ver);
        if (body.has("intervals")) {
            List<String> wanted = new ArrayList<>();
            if (body.get("intervals").isArray()) body.get("intervals").forEach(n -> wanted.add(n.asText().trim().toUpperCase(Locale.ROOT)));
            else throw CatalogException.unprocessable("INVALID_VALUE", "intervals is an array.", Map.of("field", "intervals"));
            validator.checkIntervals(p.getAudience(), wanted);
            ver.setIntervalsJson(write(new LinkedHashSet<>(sortIntervals(wanted))));
        }
        if (body.has("annualDiscountBp")) {
            JsonNode n = body.get("annualDiscountBp");
            if (n.isNull()) ver.setAnnualDiscountBp(null);
            else if (n.isInt() && n.intValue() >= 0 && n.intValue() <= 10_000) ver.setAnnualDiscountBp(n.intValue());
            else throw CatalogException.unprocessable("INVALID_VALUE", "annualDiscountBp is 0 to 10000 or null (use the global default).", Map.of("field", "annualDiscountBp"));
        }
        if (body.has("aiBudgetCapCents")) {
            JsonNode n = body.get("aiBudgetCapCents");
            if (!n.isInt() || n.intValue() < 0 || n.intValue() > 1_000_000) throw CatalogException.unprocessable("INVALID_VALUE", "aiBudgetCapCents is 0 to 1000000.", Map.of("field", "aiBudgetCapCents"));
            ver.setAiBudgetCapCents(n.intValue());
        }
        if (body.has("aiWindows")) {
            JsonNode n = body.get("aiWindows");
            if (n.isNull() || (n.isObject() && n.isEmpty())) ver.setAiWindowJson(null);
            else {
                TreeMap<String, Long> windows = new TreeMap<>();
                if (!n.isObject()) throw CatalogException.unprocessable("INVALID_VALUE", "aiWindows is an object of interval to cents.", Map.of("field", "aiWindows"));
                n.fields().forEachRemaining(e -> {
                    BillingInterval i = parseRecurring(e.getKey());
                    if (!e.getValue().canConvertToLong() || e.getValue().longValue() < 0 || e.getValue().longValue() > 10_000_000L) {
                        throw CatalogException.unprocessable("INVALID_VALUE", "aiWindows." + e.getKey() + " is 0 to 10000000 cents.", Map.of("field", "aiWindows"));
                    }
                    windows.put(i.name(), e.getValue().longValue());
                });
                ver.setAiWindowJson(write(windows));
            }
        }
        if (body.has("baseProductId")) {
            JsonNode n = body.get("baseProductId");
            if (n.isNull()) ver.setBaseProductId(null);
            else {
                Product base = products.findById(n.asLong()).orElseThrow(() -> CatalogException.unprocessable("INVALID_VALUE", "Unknown product " + n.asLong() + ".", Map.of("field", "baseProductId")));
                if (!Boolean.TRUE.equals(base.getActive())) throw CatalogException.unprocessable("PRODUCT_RETIRED", "Product " + base.getCode() + " is retired.", Map.of("productId", base.getId()));
                if (!"SUBSCRIPTION".equals(base.getKind())) throw CatalogException.unprocessable("INVALID_VALUE", "The base of a plan is a SUBSCRIPTION product.", Map.of("field", "baseProductId", "kind", String.valueOf(base.getKind())));
                String soldTo = base.getSoldTo();
                if (soldTo != null && !"BOTH".equals(soldTo) && !soldTo.equals(p.getAudience())) {
                    throw CatalogException.unprocessable("PRODUCT_AUDIENCE_MISMATCH", "Product " + base.getCode() + " is not sold to " + p.getAudience() + ".", Map.of("productId", base.getId()));
                }
                ver.setBaseProductId(base.getId());
            }
        }
        if (body.has("seatRules")) {
            JsonNode n = body.get("seatRules");
            if (n.isNull()) ver.setSeatRulesJson(null);
            else if (n.isObject() && "ORG".equals(p.getAudience())) ver.setSeatRulesJson(write(n));
            else throw CatalogException.unprocessable("INVALID_VALUE", "seatRules is an object and applies to ORG plans only.", Map.of("field", "seatRules"));
        }
        if (body.has("presets")) {
            JsonNode n = body.get("presets");
            if (n.isNull()) ver.setPresetsJson(null);
            else {
                checkPresets(n);
                ver.setPresetsJson(write(n));
            }
        }
        if (body.has("summary")) {
            JsonNode n = body.get("summary");
            String s = n.isNull() ? null : n.asText();
            checkText("summary", s, 2000);
            ver.setSummary(blankToNull(s));
        }
        ver.setUpdatedAt(now());
        versions.saveAndFlush(ver);
        PlanVersionDTO after = versionDto(p, ver);
        changes.record(CatalogChangeRecorder.ENTITY_PLAN_VERSION, planKey + ":" + v, before, after, "draft edit");
        audit.record(PLAN_VERSION_UPDATE, AdminAuditService.TARGET_CATALOG, "plan:" + planKey + ":v" + v, null, "risk=MEDIUM plan=" + planKey + " version=" + v);
        return after;
    }

    /** Replace every component of a DRAFT (full replacement). */
    @Transactional
    public PlanVersionDTO putComponents(String planKey, int v, ComponentsRequest req) {
        if (req == null || req.components() == null) throw CatalogException.unprocessable("INVALID_VALUE", "A list of components is required.", Map.of("field", "components"));
        Plan p = plan(planKey);
        PlanVersion ver = version(p, v);
        requireDraft(ver);
        if (req.expectedUpdatedAt() != null && !sameInstant(req.expectedUpdatedAt(), ver.getUpdatedAt())) {
            throw CatalogException.conflict("VERSION_CONFLICT", "Version " + v + " of " + planKey + " changed since you opened it.", Map.of("updatedAt", String.valueOf(ver.getUpdatedAt())));
        }
        if (req.components().size() > 80) throw CatalogException.unprocessable("INVALID_VALUE", "A version has at most 80 components.", Map.of("field", "components"));
        validator.checkComponents(p, req.components());
        PlanVersionDTO before = versionDto(p, ver);
        components.deleteByPlanVersionId(ver.getId());
        components.flush();
        int index = 0;
        for (ComponentRequest c : req.components()) {
            String key = c.featureKey().trim();
            String role = c.role().trim().toUpperCase(Locale.ROOT);
            FeatureDefinition f = features.findByFeatureKey(key).orElseThrow();
            PlanComponent n = new PlanComponent();
            n.setPlanVersionId(ver.getId());
            n.setFeatureKey(key);
            n.setRole(role);
            n.setProductId(c.productId());
            n.setAllowanceOverride(c.allowanceOverride());
            n.setLimitOverridesJson(c.limitOverrides() == null || c.limitOverrides().isNull() ? null : write(c.limitOverrides()));
            n.setDefaultQuantity(c.defaultQuantity() == null ? 1 : c.defaultQuantity());
            boolean optional = "OPTIONAL".equals(role) || "SEAT_OPTIONAL".equals(role);
            n.setMaxQuantity(c.maxQuantity() != null ? c.maxQuantity() : optional && Boolean.TRUE.equals(f.getStackable()) ? f.getMaxQuantity() : optional ? 1 : null);
            n.setComponentDiscountBp(c.componentDiscountBp());
            n.setSortOrder(c.sortOrder() == null ? index : c.sortOrder());
            n.setMarketingLabel(blankToNull(c.marketingLabel()));
            components.save(n);
            index++;
        }
        components.flush();
        ver.setUpdatedAt(now());
        versions.saveAndFlush(ver);
        PlanVersionDTO after = versionDto(p, ver);
        changes.record(CatalogChangeRecorder.ENTITY_PLAN_VERSION, planKey + ":" + v, before, after, "components replaced");
        audit.record(PLAN_COMPONENTS_SET, AdminAuditService.TARGET_CATALOG, "plan:" + planKey + ":v" + v, null, "risk=MEDIUM plan=" + planKey + " version=" + v + " count=" + req.components().size());
        return after;
    }

    @Transactional
    public void discard(String planKey, int v, DiscardRequest r) {
        Plan p = plan(planKey);
        PlanVersion ver = version(p, v);
        requireDraft(ver);
        String reason = r == null || r.reason() == null || r.reason().isBlank() ? "draft discarded" : r.reason().trim();
        PlanVersionDTO before = versionDto(p, ver);
        components.deleteByPlanVersionId(ver.getId());
        components.flush();
        versions.delete(ver);
        versions.flush();
        if (versions.findByPlanIdOrderByVersionDesc(p.getId()).isEmpty() && "DRAFT".equals(p.getStatus())) {
            plans.delete(p);
            plans.flush();
        }
        changes.record(CatalogChangeRecorder.ENTITY_PLAN_VERSION, planKey + ":" + v, before, null, reason);
        audit.record(PLAN_DISCARD, AdminAuditService.TARGET_CATALOG, "plan:" + planKey + ":v" + v, null, "risk=MEDIUM plan=" + planKey + " version=" + v);
    }

    // ---- publish ---------------------------------------------------------------------------------------------------------

    /** 422 SERVICE_RETIRING: a draft that includes a service that is being (or has been) retired cannot be published (docs/subscriptions/11 section 2.2, story K10.1). */
    private void requireNoRetiringService(PlanVersion ver) {
        for (PlanComponent c : components.findByPlanVersionIdOrderBySortOrderAscIdAsc(ver.getId())) {
            features.findByFeatureKey(c.getFeatureKey()).ifPresent(d -> {
                if (d.getLifecycle() != null && !"ACTIVE".equals(d.getLifecycle())) {
                    throw CatalogException.unprocessable("SERVICE_RETIRING", "Service " + d.getFeatureKey() + " is " + d.getLifecycle() + ": remove it from the draft before publishing.", Map.of("featureKey", d.getFeatureKey(), "lifecycle", d.getLifecycle()));
                }
            });
        }
    }

    @Transactional
    public PlanVersionDTO publish(String planKey, int v, PublishPlanRequest r, String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new CatalogException(400, "IDEMPOTENCY_KEY_REQUIRED", "Publishing a plan needs an Idempotency-Key header.", null);
        }
        String key = idempotencyKey.trim();
        if (key.length() > 64) throw new CatalogException(400, "IDEMPOTENCY_KEY_INVALID", "The Idempotency-Key is at most 64 characters.", null);
        Plan plan = plan(planKey);
        PlanVersion ver = version(plan, v);
        if (key.equals(ver.getPublishKey()) && !"DRAFT".equals(ver.getStatus())) return versionDto(plan, ver); // a replay answers the same version
        requireDraft(ver);
        if (r == null || r.confirmVersion() == null || r.confirmVersion() != v) {
            throw new CatalogException(412, "CONFIRM_MISMATCH", "Type the version number (" + v + ") to confirm the publish.", Map.of("expected", v));
        }
        String reason = requireReason(r.reason(), "Publishing a plan version");
        requireEditable(plan);
        Instant now = now();
        if (r.effectiveFrom() != null && r.effectiveFrom().isAfter(now.plusSeconds(60))) {
            throw CatalogException.unprocessable("INVALID_VALUE", "A plan version goes live when it is published; scheduling a plan version is not supported yet.", Map.of("field", "effectiveFrom"));
        }

        PlanModel m = loader.model(plan, ver);
        validator.checkIntervals(plan.getAudience(), intervalNames(ver.getIntervalsJson()));
        validator.checkPublishable(plan, m);
        requireNoRetiringService(ver);

        // 1. price the version in every currency it is sold in, and run the margin guard on all of them
        List<PriceBook> usedBooks = new ArrayList<>();
        List<String> currencies = new ArrayList<>();
        MarginReport report = new MarginReport(List.of(), List.of());
        String defaultCurrency = settings.defaultCurrency();
        if (!m.pricedProductCodes().isEmpty()) {
            for (String currency : settings.currencies()) {
                PriceBook book = loader.book(m, now, currency, true);
                List<PlanLoader.Missing> missing = PlanLoader.missing(m, book, currency);
                boolean attempted = currency.equals(defaultCurrency) || (m.baseProductCode() != null && m.intervals().stream().anyMatch(i -> book.get(m.baseProductCode(), i, currency).isPresent()));
                if (!attempted) continue;
                if (!missing.isEmpty()) {
                    PlanLoader.Missing first = missing.get(0);
                    Map<String, Object> extra = new LinkedHashMap<>();
                    extra.put("featureKey", first.featureKey());
                    extra.put("productCode", first.productCode());
                    extra.put("interval", first.interval().name());
                    extra.put("currency", first.currency());
                    throw CatalogException.unprocessable("PLAN_PRICE_MISSING", first.featureKey() + " has no " + first.interval() + " price in " + first.currency() + ".", extra);
                }
                report = report.plus(calculator.checkPlan(PlanCompositions.of(m, book, currency)));
                usedBooks.add(book);
                currencies.add(currency);
            }
        }
        boolean overrideUsed = calculator.requirePublishable(report, r.overrideReason());

        // 2. the rows to publish: DRAFT rows as typed, DERIVED yearly projections become real rows (K9.1)
        List<Long> toPublish = new ArrayList<>();
        for (PriceBook book : usedBooks) {
            for (Entry e : book.all()) {
                if (e.source() == Source.DRAFT && !toPublish.contains(e.priceId())) toPublish.add(e.priceId());
            }
        }
        for (PriceBook book : usedBooks) {
            for (Entry e : book.all()) {
                if (e.source() != Source.DERIVED) continue;
                Product product = products.findByCode(e.productCode()).orElseThrow();
                var created = catalog.createDraft(new PriceRequest(
                    product.getId(), e.audience().name(), "YEAR", e.amountMinor(), e.currency(), null, null, false, null, "DERIVED", e.derivedFromPriceId(), e.derivedDiscountBp(), null,
                    "Derived yearly price for " + planKey + " v" + v
                ));
                toPublish.add(created.id());
            }
        }

        // 3. supersede the live version, publish the rows and the version under one catalog version
        PlanVersion previous = versions.findLive(plan.getId()).orElse(null);
        if (previous != null) {
            previous.setStatus("SUPERSEDED");
            previous.setEffectiveUntil(now);
            previous.setUpdatedAt(now);
            versions.saveAndFlush(previous);
        }
        PublishedBatch batch = catalog.publishBatch(toPublish, List.of(ver.getId()), "Published " + planKey + " v" + v + (m.pricedProductCodes().isEmpty() ? "" : " (" + toPublish.size() + " price row(s))"), reason);
        Instant at = batch.effectiveFrom();

        // rows that were published while Stripe was off get their Stripe Price now that this version needs them
        for (String currency : currencies) {
            PriceBook live = loader.book(m, at, currency, false);
            for (Entry e : live.all()) {
                if (e.stripePriceId() != null || e.priceId() == null) continue;
                ProductPrice row = prices.findById(e.priceId()).orElse(null);
                if (row == null) continue;
                for (PriceStripeSync s : stripeSyncs) s.onPublish(row);
                if (row.getStripePriceId() != null) prices.saveAndFlush(row);
            }
        }

        // 4. the immutable record
        ObjectNode snap = snapshot(plan, ver, m, currencies, at, batch.catalogVersion());
        ver.setStatus("PUBLISHED");
        ver.setEffectiveFrom(at);
        ver.setEffectiveUntil(null);
        ver.setCatalogVersion(batch.catalogVersion());
        ver.setSnapshotJson(snapshots.toJson(snap));
        ver.setSnapshotHash(snapshots.hash(snap));
        ver.setPublishedAt(at);
        ver.setPublishedBy(actor());
        ver.setPublishKey(key);
        ver.setUpdatedAt(now);
        versions.saveAndFlush(ver);
        if ("DRAFT".equals(plan.getStatus())) {
            plan.setStatus("PUBLISHED");
            plan.setUpdatedAt(now);
            plan.setUpdatedBy(actor());
            plans.saveAndFlush(plan);
        }

        PlanVersionDTO after = versionDto(plan, ver);
        changes.record(CatalogChangeRecorder.ENTITY_PLAN_VERSION, planKey + ":" + v, null, after, reason);
        audit.record(
            PLAN_PUBLISHED, AdminAuditService.TARGET_CATALOG, "plan:" + planKey + ":v" + v, reason,
            "risk=HIGH plan=" + planKey + " version=" + v + " catalogVersion=" + batch.catalogVersion() + " prices=" + toPublish + " superseded=" + (previous == null ? "none" : previous.getVersion())
                + " snapshot=" + ver.getSnapshotHash()
        );
        if (overrideUsed) {
            List<String> failing = report.failures().stream().map(c -> c.featureKey() + "/" + c.interval() + "/" + c.currency() + "=" + c.marginBp() + "bp<" + c.floorBp()).toList();
            audit.record(
                CATALOG_MARGIN_OVERRIDE, AdminAuditService.TARGET_CATALOG, "plan:" + planKey + ":v" + v, r.overrideReason().trim(),
                "risk=HIGH plan=" + planKey + " version=" + v + " failing=" + failing
            );
        }
        return after;
    }

    // ---- compare ---------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public CompareDTO compare(String planKey, int a, int b) {
        Plan p = plan(planKey);
        PlanVersion va = version(p, a);
        PlanVersion vb = version(p, b);
        PlanVersionDTO da = versionDto(p, va);
        PlanVersionDTO db = versionDto(p, vb);
        List<DiffRow> diff = new ArrayList<>();
        diffValue(diff, "intervals", da.intervals(), db.intervals());
        diffValue(diff, "annualDiscountBp", da.annualDiscountBp(), db.annualDiscountBp());
        diffValue(diff, "aiBudgetCapCents", da.aiBudgetCapCents(), db.aiBudgetCapCents());
        diffValue(diff, "aiWindows", da.aiWindows(), db.aiWindows());
        diffValue(diff, "baseProduct", da.baseProduct() == null ? null : da.baseProduct().code(), db.baseProduct() == null ? null : db.baseProduct().code());
        if (da.baseProduct() != null || db.baseProduct() != null) {
            diffValue(diff, "baseProduct.prices", priceMap(da.baseProduct()), priceMap(db.baseProduct()));
        }
        Map<String, ComponentDTO> ca = new TreeMap<>();
        Map<String, ComponentDTO> cb = new TreeMap<>();
        da.components().forEach(c -> ca.put(c.featureKey(), c));
        db.components().forEach(c -> cb.put(c.featureKey(), c));
        Set<String> keys = new java.util.TreeSet<>(ca.keySet());
        keys.addAll(cb.keySet());
        for (String k : keys) {
            ComponentDTO x = ca.get(k);
            ComponentDTO y = cb.get(k);
            if (x == null || y == null) {
                diff.add(new DiffRow("components." + k, x == null ? null : x.role(), y == null ? null : y.role()));
                continue;
            }
            diffValue(diff, "components." + k + ".role", x.role(), y.role());
            diffValue(diff, "components." + k + ".allowance", x.allowance(), y.allowance());
            diffValue(diff, "components." + k + ".maxQuantity", x.maxQuantity(), y.maxQuantity());
            diffValue(diff, "components." + k + ".componentDiscountBp", x.componentDiscountBp(), y.componentDiscountBp());
            diffValue(diff, "components." + k + ".prices", priceMap(x.prices()), priceMap(y.prices()));
        }
        Map<String, Long> subs = new LinkedHashMap<>();
        Map<Integer, Long> byVersion = counts.byVersion(p.getId());
        subs.put("a", byVersion.getOrDefault(a, 0L));
        subs.put("b", byVersion.getOrDefault(b, 0L));
        return new CompareDTO(planKey, a, b, diff, subs, marginByInterval(p, va), marginByInterval(p, vb));
    }

    private Map<String, Long> marginByInterval(Plan p, PlanVersion v) {
        Map<String, Long> out = new LinkedHashMap<>();
        PlanModel m = loader.model(p, v);
        if (m.pricedProductCodes().isEmpty()) return out;
        String currency = settings.defaultCurrency();
        boolean draft = "DRAFT".equals(v.getStatus());
        PriceBook book = loader.book(m, v.getEffectiveFrom() == null ? clock.instant() : v.getEffectiveFrom(), currency, draft);
        if (!PlanLoader.missing(m, book, currency).isEmpty()) return out;
        for (MarginCheck c : calculator.checkPlan(PlanCompositions.of(m, book, currency)).checks()) {
            out.merge(c.interval().name(), c.marginBp(), Math::min);
        }
        return out;
    }

    private static Map<String, Long> priceMap(ProductView p) {
        return p == null ? Map.of() : priceMap(p.prices());
    }

    private static Map<String, Long> priceMap(List<PriceView> prices) {
        Map<String, Long> out = new TreeMap<>();
        if (prices != null) for (PriceView v : prices) out.put(v.interval() + "/" + v.currency(), v.amountMinor());
        return out;
    }

    private static void diffValue(List<DiffRow> diff, String path, Object a, Object b) {
        if (!Objects.equals(a, b)) diff.add(new DiffRow(path, a, b));
    }

    // ---- DTOs ------------------------------------------------------------------------------------------------------------

    private PlanDTO planDto(Plan p, List<PlanVersionDTO> vs) {
        return new PlanDTO(
            p.getPlanKey(), p.getName(), p.getAudience(), p.getStatus(), Boolean.TRUE.equals(p.getPublicPlan()), p.getDescription(), p.getBadge(), p.getSortOrder() == null ? 0 : p.getSortOrder(),
            snapshots.parse(p.getEligibilityJson()), planKeyOf(p.getSuccessorPlanId()), p.getCreatedAt(), p.getUpdatedAt(), p.getUpdatedBy(), vs
        );
    }

    /** A version as the builder shows it. A DRAFT is priced from the live catalog (drafts and derivations included); anything published reads its own snapshot. */
    PlanVersionDTO versionDto(Plan p, PlanVersion v) {
        PlanModel m = loader.model(p, v);
        boolean draft = "DRAFT".equals(v.getStatus());
        JsonNode snap = draft ? null : snapshots.parse(v.getSnapshotJson());
        String currency = settings.defaultCurrency();
        PriceBook book = draft ? loader.book(m, clock.instant(), currency, true) : null;
        List<ComponentDTO> comps = new ArrayList<>();
        Map<String, JsonNode> snapComps = new LinkedHashMap<>();
        if (snap != null && snap.has("components")) snap.get("components").forEach(c -> snapComps.put(c.path("featureKey").asText(), c));
        for (PlanComponent c : components.findByPlanVersionIdOrderBySortOrderAscIdAsc(v.getId())) {
            FeatureDefinition f = features.findByFeatureKey(c.getFeatureKey()).orElse(null);
            String code = c.getProductId() == null ? null : products.findById(c.getProductId()).map(Product::getCode).orElse(null);
            List<PriceView> pv = draft ? views(book, code, m) : viewsFromSnapshot(snapComps.get(c.getFeatureKey()));
            Long allowance = c.getAllowanceOverride() != null ? c.getAllowanceOverride() : f == null ? null : f.getDefaultAllowance();
            comps.add(new ComponentDTO(
                c.getFeatureKey(), c.getRole(), f == null ? c.getFeatureKey() : f.getName(), f == null ? null : f.getCategory(), f == null ? null : f.getUsageUnit(), c.getProductId(), code, allowance, c.getAllowanceOverride(),
                f == null ? null : f.getLimitKey(), snapshots.parse(c.getLimitOverridesJson()), c.getDefaultQuantity() == null ? 1 : c.getDefaultQuantity(), c.getMaxQuantity(), c.getComponentDiscountBp(),
                c.getSortOrder() == null ? 0 : c.getSortOrder(), c.getMarketingLabel(), f == null || f.getAiBudgetCents() == null ? 0 : f.getAiBudgetCents(), pv
            ));
        }
        ProductView base = null;
        if (v.getBaseProductId() != null) {
            Product bp = products.findById(v.getBaseProductId()).orElse(null);
            if (bp != null) base = new ProductView(bp.getId(), bp.getCode(), draft ? views(book, bp.getCode(), m) : viewsFromSnapshot(snap == null ? null : snap.get("baseProduct")));
        }
        List<String> intervals = new ArrayList<>(intervalNames(v.getIntervalsJson()));
        Map<String, Long> windows = new LinkedHashMap<>();
        loader.aiWindows(v.getAiWindowJson()).forEach((k, val) -> windows.put(k.name(), val));
        return new PlanVersionDTO(
            p.getPlanKey(), v.getVersion(), v.getStatus(), p.getAudience(), intervals, v.getAnnualDiscountBp(), v.getAiBudgetCapCents() == null ? 0 : v.getAiBudgetCapCents(), windows, base, comps,
            snapshots.parse(v.getPresetsJson()), snapshots.parse(v.getSeatRulesJson()), v.getSnapshotHash(), v.getEffectiveFrom(), v.getEffectiveUntil(), v.getCatalogVersion(), v.getSummary(),
            v.getPublishedAt(), v.getPublishedBy(), v.getUpdatedAt()
        );
    }

    private static List<PriceView> views(PriceBook book, String productCode, PlanModel m) {
        List<PriceView> out = new ArrayList<>();
        if (book == null || productCode == null) return out;
        for (Entry e : book.all()) {
            if (productCode.equals(e.productCode())) {
                out.add(new PriceView(e.priceId(), e.interval().name(), e.currency(), e.amountMinor(), e.source().name(), e.isDerived(), e.stripePriceId(), null, null));
            }
        }
        out.sort(Comparator.comparing((PriceView x) -> ORDER.indexOf(BillingInterval.valueOf(x.interval()))).thenComparing(PriceView::currency));
        return out;
    }

    private static List<PriceView> viewsFromSnapshot(JsonNode node) {
        List<PriceView> out = new ArrayList<>();
        if (node == null) return out;
        JsonNode arr = node.path("prices");
        if (arr.isArray()) {
            for (JsonNode n : arr) {
                out.add(new PriceView(n.hasNonNull("priceId") ? n.get("priceId").asLong() : null, n.path("interval").asText(), n.path("currency").asText(), n.path("amountMinor").asLong(), "ACTIVE", n.path("derived").asBoolean(false), null, null, null));
            }
        }
        return out;
    }

    private ObjectNode snapshot(Plan plan, PlanVersion ver, PlanModel m, List<String> currencies, Instant at, int catalogVersion) {
        ObjectNode s = snapshots.newObject();
        s.put("planKey", plan.getPlanKey());
        s.put("version", ver.getVersion());
        s.put("name", plan.getName());
        s.put("audience", plan.getAudience());
        ArrayNode ints = s.putArray("intervals");
        sortIntervals(intervalNames(ver.getIntervalsJson())).forEach(ints::add);
        if (ver.getAnnualDiscountBp() == null) s.putNull("annualDiscountBp");
        else s.put("annualDiscountBp", ver.getAnnualDiscountBp());
        s.put("aiBudgetCapCents", ver.getAiBudgetCapCents() == null ? 0 : ver.getAiBudgetCapCents());
        ObjectNode win = s.putObject("aiWindows");
        new TreeMap<>(windowsByName(ver)).forEach(win::put);
        s.put("catalogVersion", catalogVersion);
        s.put("effectiveFrom", at.toString());
        ArrayNode curs = s.putArray("currencies");
        currencies.forEach(curs::add);
        Map<String, PriceBook> books = new LinkedHashMap<>();
        for (String c : currencies) books.put(c, loader.book(m, at, c, false));
        if (m.baseProductCode() != null) {
            ObjectNode base = s.putObject("baseProduct");
            base.put("code", m.baseProductCode());
            products.findByCode(m.baseProductCode()).ifPresent(pr -> base.put("id", pr.getId()));
            priceArray(base.putArray("prices"), m.baseProductCode(), books);
        }
        ArrayNode comps = s.putArray("components");
        for (PlanComponent c : components.findByPlanVersionIdOrderBySortOrderAscIdAsc(ver.getId())) {
            FeatureDefinition f = features.findByFeatureKey(c.getFeatureKey()).orElse(null);
            ObjectNode n = comps.addObject();
            n.put("featureKey", c.getFeatureKey());
            n.put("role", c.getRole());
            n.put("name", f == null ? c.getFeatureKey() : f.getName());
            if (f != null && f.getUsageUnit() != null) n.put("unit", f.getUsageUnit());
            Long allowance = c.getAllowanceOverride() != null ? c.getAllowanceOverride() : f == null ? null : f.getDefaultAllowance();
            if (allowance != null) n.put("allowance", allowance);
            if (f != null && f.getLimitKey() != null) n.put("limitKey", f.getLimitKey());
            if (c.getLimitOverridesJson() != null) n.set("limitOverrides", snapshots.parse(c.getLimitOverridesJson()));
            n.put("defaultQuantity", c.getDefaultQuantity() == null ? 1 : c.getDefaultQuantity());
            if (c.getMaxQuantity() != null) n.put("maxQuantity", c.getMaxQuantity());
            if (c.getComponentDiscountBp() != null) n.put("componentDiscountBp", c.getComponentDiscountBp());
            n.put("aiBudgetCents", f == null || f.getAiBudgetCents() == null ? 0 : f.getAiBudgetCents());
            n.put("sortOrder", c.getSortOrder() == null ? 0 : c.getSortOrder());
            if (c.getMarketingLabel() != null) n.put("marketingLabel", c.getMarketingLabel());
            if (c.getProductId() != null) {
                Product pr = products.findById(c.getProductId()).orElse(null);
                if (pr != null) {
                    n.put("productCode", pr.getCode());
                    n.put("productId", pr.getId());
                    priceArray(n.putArray("prices"), pr.getCode(), books);
                }
            }
        }
        if (ver.getPresetsJson() != null) s.set("presets", snapshots.parse(ver.getPresetsJson()));
        if (ver.getSeatRulesJson() != null) s.set("seatRules", snapshots.parse(ver.getSeatRulesJson()));
        return s;
    }

    private Map<String, Long> windowsByName(PlanVersion v) {
        Map<String, Long> out = new LinkedHashMap<>();
        loader.aiWindows(v.getAiWindowJson()).forEach((k, val) -> out.put(k.name(), val));
        return out;
    }

    private static void priceArray(ArrayNode arr, String productCode, Map<String, PriceBook> books) {
        for (Map.Entry<String, PriceBook> b : books.entrySet()) {
            List<Entry> rows = new ArrayList<>();
            for (Entry e : b.getValue().all()) if (productCode.equals(e.productCode())) rows.add(e);
            rows.sort(Comparator.comparingInt((Entry e) -> ORDER.indexOf(e.interval())));
            for (Entry e : rows) {
                ObjectNode n = arr.addObject();
                if (e.priceId() != null) n.put("priceId", e.priceId());
                n.put("interval", e.interval().name());
                n.put("currency", e.currency());
                n.put("amountMinor", e.amountMinor());
                n.put("derived", e.isDerived());
            }
        }
    }

    // ---- helpers ---------------------------------------------------------------------------------------------------------

    Plan plan(String planKey) {
        return plans.findByPlanKey(planKey == null ? "" : planKey.trim().toUpperCase(Locale.ROOT)).orElseThrow(() -> CatalogException.notFound("plan", String.valueOf(planKey)));
    }

    PlanVersion version(Plan p, int v) {
        return versions.findByPlanIdAndVersion(p.getId(), v).orElseThrow(() -> CatalogException.notFound("plan version", p.getPlanKey() + " v" + v));
    }

    private String planKeyOf(Long planId) {
        return planId == null ? null : plans.findById(planId).map(Plan::getPlanKey).orElse(null);
    }

    private static void requireDraft(PlanVersion v) {
        if (!"DRAFT".equals(v.getStatus())) {
            throw CatalogException.conflict("NOT_DRAFT", "Version " + v.getVersion() + " is " + v.getStatus() + ": a published version is immutable, start a new version instead.", Map.of("status", v.getStatus()));
        }
    }

    private static void requireEditable(Plan p) {
        if ("RETIRING".equals(p.getStatus()) || "RETIRED".equals(p.getStatus())) {
            throw CatalogException.conflict("PLAN_RETIRING", "Plan " + p.getPlanKey() + " is " + p.getStatus() + ": it takes no new versions.", Map.of("status", p.getStatus()));
        }
    }

    private static String requireReason(String reason, String what) {
        if (reason == null || reason.trim().length() < CatalogException.REASON_MIN_LENGTH) {
            throw CatalogException.unprocessable("REASON_REQUIRED", what + " needs a reason of at least " + CatalogException.REASON_MIN_LENGTH + " characters.", Map.of("minLength", CatalogException.REASON_MIN_LENGTH));
        }
        return reason.trim();
    }

    private static void checkText(String field, String s, int max) {
        if (s != null && s.length() > max) throw CatalogException.unprocessable("INVALID_VALUE", field + " is at most " + max + " characters.", Map.of("field", field));
    }

    private static void checkPresets(JsonNode n) {
        if (!n.isArray() || n.size() > 12) throw CatalogException.unprocessable("INVALID_VALUE", "presets is an array of at most 12 named add-on combinations.", Map.of("field", "presets"));
        Set<String> keys = new LinkedHashSet<>();
        for (JsonNode p : n) {
            String key = p.path("key").asText("");
            if (key.isBlank() || key.length() > 40 || !keys.add(key)) throw CatalogException.unprocessable("INVALID_VALUE", "Every preset has a unique key of 1 to 40 characters.", Map.of("field", "presets"));
            if (p.has("price") || p.has("bundleDiscountBp")) throw CatalogException.unprocessable("INVALID_VALUE", "A preset carries no price and no discount (S-05).", Map.of("field", "presets"));
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private String jsonOrNull(JsonNode n) {
        return n == null || n.isNull() ? null : write(n);
    }

    private List<String> defaultIntervals(String audience) {
        List<String> offered = settings.intervals(audience);
        List<String> out = new ArrayList<>();
        for (BillingInterval i : List.of(BillingInterval.MONTH, BillingInterval.QUARTER, BillingInterval.YEAR)) {
            if (offered.contains(i.name()) && !("ORG".equals(audience) && i == BillingInterval.QUARTER) && !(i == BillingInterval.YEAR && !settings.annualEnabled())) out.add(i.name());
        }
        return out;
    }

    private static BillingInterval parseRecurring(String s) {
        try {
            BillingInterval i = BillingInterval.valueOf(s.trim().toUpperCase(Locale.ROOT));
            if (i.isRecurring()) return i;
        } catch (IllegalArgumentException ignored) {
            // falls through
        }
        throw CatalogException.unprocessable("INVALID_VALUE", "Interval must be MONTH, QUARTER or YEAR.", Map.of("interval", s));
    }

    private static List<String> sortIntervals(Iterable<String> in) {
        Set<BillingInterval> set = EnumSet.noneOf(BillingInterval.class);
        in.forEach(s -> set.add(BillingInterval.valueOf(s)));
        return set.stream().sorted().map(Enum::name).toList();
    }

    private List<String> intervalNames(String json) {
        List<String> out = new ArrayList<>();
        JsonNode n = snapshots.parse(json);
        if (n != null && n.isArray()) n.forEach(e -> out.add(e.asText()));
        return sortIntervals(out);
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private static boolean sameInstant(Instant a, Instant b) {
        return a != null && b != null && a.toEpochMilli() == b.toEpochMilli();
    }

    private String write(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String actor() {
        String login = SecurityUtils.getCurrentUserLogin().orElse("system");
        return login.length() > 50 ? login.substring(0, 50) : login;
    }
}
