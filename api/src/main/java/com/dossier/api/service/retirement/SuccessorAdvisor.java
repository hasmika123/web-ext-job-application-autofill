package com.dossier.api.service.retirement;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.Plan;
import com.dossier.api.domain.catalog.PlanComponent;
import com.dossier.api.domain.catalog.PlanRetirement;
import com.dossier.api.domain.catalog.PlanRetirementSuccessor;
import com.dossier.api.domain.catalog.PlanVersion;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.sub.PlanComponentRepository;
import com.dossier.api.repository.sub.PlanRepository;
import com.dossier.api.repository.sub.PlanRetirementSuccessorRepository;
import com.dossier.api.repository.sub.PlanVersionRepository;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.billing.personal.PersonalBasket;
import com.dossier.api.service.catalog.CatalogSettings;
import com.dossier.api.service.entitlement.PlanCatalogReader;
import com.dossier.api.service.entitlement.PlanData.Component;
import com.dossier.api.service.entitlement.PlanData.FeatureDef;
import com.dossier.api.service.entitlement.PlanData.PlanVersionData;
import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import com.dossier.api.service.pricing.CatalogPort;
import com.dossier.api.service.pricing.IntervalPolicy;
import com.dossier.api.service.pricing.IntervalSummary;
import com.dossier.api.service.pricing.PriceRow;
import com.dossier.api.service.pricing.PricingEngine;
import com.dossier.api.service.pricing.PricingException;
import com.dossier.api.service.pricing.PricingInputs;
import com.dossier.api.service.pricing.PricingInputs.LineGroup;
import com.dossier.api.service.pricing.PricingInputs.LineRequest;
import com.dossier.api.service.pricing.PricingResult;
import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import com.fasterxml.jackson.annotation.JsonInclude;
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
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The closest match for a subscriber whose plan is being retired (docs/subscriptions/11-plan-retirement.md section 5; story K10.2). Deterministic, server-side, no AI,
 * counts only (never content).
 *
 * <pre>
 * used(s)      = what the subscriber used of the retiring plan in the last N periods (committed usage events, AI calls that name a service, a connected inbox,
 *                saved resumes) plus the add-ons they hold; N = billing.retirement.suggestion_lookback_periods
 * for each successor c, in the admin's order:
 *   covered(c) = used(s) in (INCLUDED(c) plus the OPTIONAL(c) they can add)       gaps(c) = used(s) minus covered(c), plus any limit they exceed (12 resumes on a cap of 3)
 *   price(c)   = PricingEngine on c's base and the add-ons they hold that c offers, at THEIR interval (exact, never a guess)
 *   score(c)   = (number of gaps, how much dearer than today, admin rank)           lowest wins; ties go to the admin's rank
 * </pre>
 * Free is always evaluated too and is listed with the alternatives, but it is never "the suggestion": it is the default outcome, shown separately. A successor that does
 * not sell the subscriber's interval is skipped (a different interval is a different decision, not a silent one).
 */
@Service
public class SuccessorAdvisor {

    private static final Logger LOG = LoggerFactory.getLogger(SuccessorAdvisor.class);

    /** Stored in {@code subscription_quote.kind} (the column holds 12 characters). */
    public static final String QUOTE_KIND = "RETIREMENT";
    /** The kind the quote DTO shows. */
    public static final String DTO_KIND = "RETIREMENT_SWITCH";
    public static final String FREE_KEY = "FREE";
    static final String BASE_LINE = "base";

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AnnualAlt(long proposedMinor, long savingsMinor) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Carried(String featureKey, int quantity) {}

    /** One candidate as the subscriber sees it. {@code kind} is PLAN, ADDON or FREE; {@code quoteId} is set once a RETIREMENT_SWITCH quote exists for it. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Suggestion(
        String successorKey,
        String successorName,
        String kind,
        int rank,
        List<String> covered,
        List<String> gaps,
        long currentMinor,
        long proposedMinor,
        long deltaMinor,
        String priceDirection,
        String interval,
        long monthlyEquivalentMinor,
        AnnualAlt annualAlternative,
        List<Carried> carriedAddons,
        Long quoteId
    ) {
        public Suggestion withQuote(Long id) {
            return new Suggestion(successorKey, successorName, kind, rank, covered, gaps, currentMinor, proposedMinor, deltaMinor, priceDirection, interval, monthlyEquivalentMinor, annualAlternative, carriedAddons, id);
        }
    }

    public record Used(String featureKey, String name, boolean covered) {}

    public record LockPreview(String featureKey, String name) {}

    /** A priced candidate with what a quote needs; not serialised. */
    public record Scored(Suggestion suggestion, Plan plan, PlanVersion version, PricingResult priced, IntervalSummary summary, Map<String, Integer> addons) {}

    public record Evaluation(Scored best, List<Scored> ranked, List<Used> used, List<LockPreview> lockPreview, long currentMinor, String currency, String interval) {}

    private final PlanRepository plans;
    private final PlanVersionRepository versions;
    private final PlanComponentRepository components;
    private final ProductRepository products;
    private final FeatureDefinitionRepository features;
    private final PlanRetirementSuccessorRepository successors;
    private final PlanCatalogReader catalogReader;
    private final PersonalBasket basket;
    private final RetirementMoney money;
    private final CatalogSettings catalogSettings;
    private final SettingsService settings;
    private final ObjectProvider<CatalogPort> catalog;
    private final JdbcTemplate jdbc;
    private final SubscriptionOwners owners;

    public SuccessorAdvisor(
        PlanRepository plans,
        PlanVersionRepository versions,
        PlanComponentRepository components,
        ProductRepository products,
        FeatureDefinitionRepository features,
        PlanRetirementSuccessorRepository successors,
        PlanCatalogReader catalogReader,
        PersonalBasket basket,
        RetirementMoney money,
        CatalogSettings catalogSettings,
        SettingsService settings,
        ObjectProvider<CatalogPort> catalog,
        JdbcTemplate jdbc,
        SubscriptionOwners owners
    ) {
        this.owners = owners;
        this.plans = plans;
        this.versions = versions;
        this.components = components;
        this.products = products;
        this.features = features;
        this.successors = successors;
        this.catalogReader = catalogReader;
        this.basket = basket;
        this.money = money;
        this.catalogSettings = catalogSettings;
        this.settings = settings;
        this.catalog = catalog;
        this.jdbc = jdbc;
    }

    // ---- evaluation ---------------------------------------------------------------------------------------------------------------

    /** The ranked candidates for one subscriber of {@code r}. Read-only; throws 503 CATALOG_UNAVAILABLE when prices cannot be read. */
    @Transactional(readOnly = true)
    public Evaluation evaluate(PlanRetirement r, Subscription sub, Instant now) {
        return PlanRetirement.KIND_ADDON.equals(r.getKind()) ? evaluateAddon(r, sub, now) : evaluatePlan(r, sub, now);
    }

    private Evaluation evaluatePlan(PlanRetirement r, Subscription sub, Instant now) {
        Ctx c = ctx(sub, now);
        Map<String, String> names = names();
        Set<String> previousIncluded = includedKeys(sub.getPlanVersionId());
        Set<String> used = usedFeatures(sub, c, previousIncluded);
        Map<String, Long> needs = limitNeeds(sub);
        List<PersonalBasket.Held> held = basket.held(sub.getId(), now);

        List<Scored> ranked = new ArrayList<>();
        for (PlanRetirementSuccessor s : successors.findByRetirementIdOrderByRankNoAsc(r.getId())) {
            if (s.getSuccessorPlanKey() == null) continue;
            Optional<Plan> plan = plans.findByPlanKey(s.getSuccessorPlanKey());
            if (plan.isEmpty()) continue;
            Scored scored = scoreCandidate(c, plan.get(), s.getRankNo(), used, needs, held, names);
            if (scored != null) ranked.add(scored);
        }
        Scored free = scoreFree(c, used, needs, names);
        List<Scored> all = new ArrayList<>(ranked);
        if (free != null) all.add(free);
        all.sort(SCORE_ORDER);
        Scored best = all.stream().filter(sc -> !FREE_KEY.equals(sc.suggestion().kind())).findFirst().orElse(null);
        Set<String> bestCovered = best == null ? Set.of() : new LinkedHashSet<>(best.suggestion().covered());
        List<Used> usedOut = new ArrayList<>();
        for (String k : new TreeSet<>(used)) usedOut.add(new Used(k, names.getOrDefault(k, k), bestCovered.contains(k)));
        return new Evaluation(best, List.copyOf(all), usedOut, lockPreview(sub.getPlanVersionId(), held, names), c.currentMinor, c.currency, c.interval.name());
    }

    private Evaluation evaluateAddon(PlanRetirement r, Subscription sub, Instant now) {
        Ctx c = ctx(sub, now);
        Map<String, String> names = names();
        String retiring = r.getFeatureKey();
        List<PersonalBasket.Held> held = basket.held(sub.getId(), now);
        int qty = held.stream().filter(h -> h.featureKey().equals(retiring)).mapToInt(PersonalBasket.Held::effectiveQuantity).findFirst().orElse(0);
        long oldUnit = unitPrice(c, retiring, sub.getPlanVersionId());
        long oldTotal = oldUnit * qty;
        List<Scored> ranked = new ArrayList<>();
        for (PlanRetirementSuccessor s : successors.findByRetirementIdOrderByRankNoAsc(r.getId())) {
            String fk = s.getSuccessorFeatureKey();
            if (fk == null) continue;
            boolean offered = offeredOptional(sub.getPlanVersionId()).contains(fk) || includedKeys(sub.getPlanVersionId()).contains(fk);
            long unit = includedKeys(sub.getPlanVersionId()).contains(fk) ? 0L : unitPrice(c, fk, sub.getPlanVersionId());
            long newTotal = unit * Math.max(qty, 1);
            long delta = newTotal - oldTotal;
            List<String> covered = offered ? List.of(retiring) : List.of();
            List<String> gaps = offered ? List.of() : List.of(retiring);
            Suggestion sug = new Suggestion(fk, names.getOrDefault(fk, fk), "ADDON", s.getRankNo(), covered, gaps, oldTotal, newTotal, delta, direction(delta), c.interval.name(), RetirementMoney.monthlyEquivalent(newTotal, c.interval.name()), null, List.of(new Carried(fk, Math.max(qty, 1))), null);
            ranked.add(new Scored(sug, null, null, null, null, Map.of(fk, Math.max(qty, 1))));
        }
        ranked.sort(SCORE_ORDER);
        Scored best = ranked.stream().findFirst().orElse(null);
        List<Used> usedOut = List.of(new Used(retiring, names.getOrDefault(retiring, retiring), best != null && best.suggestion().gaps().isEmpty()));
        Set<String> freeIncluded = freeIncluded();
        List<LockPreview> lock = !includedKeys(sub.getPlanVersionId()).contains(retiring) && !freeIncluded.contains(retiring) ? List.of(new LockPreview(retiring, names.getOrDefault(retiring, retiring))) : List.of();
        return new Evaluation(best, List.copyOf(ranked), usedOut, lock, c.currentMinor, c.currency, c.interval.name());
    }

    /** Price one specific plan for the subscriber (the PICK choice): any PUBLISHED public individual plan, at the subscriber's interval or the one asked for. */
    @Transactional(readOnly = true)
    public Scored priceFor(Subscription sub, String planKey, String interval, Map<String, Integer> requestedAddons, Instant now) {
        Ctx c = ctx(sub, now);
        BillingInterval iv = interval == null || interval.isBlank() ? c.interval : parseInterval(interval);
        if (iv == null) throw new BillingException(422, "INTERVAL_NOT_AVAILABLE", "That billing interval isn't offered");
        Ctx at = c.withInterval(iv);
        Plan plan = plans.findByPlanKey(planKey == null ? "" : planKey.trim().toUpperCase(Locale.ROOT)).orElseThrow(() -> new BillingException(422, "SUCCESSOR_NOT_AVAILABLE", "That plan isn't available"));
        if (FREE_KEY.equals(plan.getPlanKey()) || !"INDIVIDUAL".equals(plan.getAudience()) || !"PUBLISHED".equals(plan.getStatus()) || !Boolean.TRUE.equals(plan.getPublicPlan())) {
            throw new BillingException(422, "SUCCESSOR_NOT_AVAILABLE", "That plan isn't available", Map.of("planKey", plan.getPlanKey()));
        }
        Map<String, String> names = names();
        Set<String> previousIncluded = includedKeys(sub.getPlanVersionId());
        Set<String> used = usedFeatures(sub, at, previousIncluded);
        List<PersonalBasket.Held> held = basket.held(sub.getId(), now);
        Scored scored = scoreCandidate(at, plan, 1, used, limitNeeds(sub), requestedAddons == null ? held : heldFrom(requestedAddons, held), names);
        if (scored == null) throw new BillingException(422, "INTERVAL_NOT_AVAILABLE", "That plan isn't sold at that billing interval", Map.of("planKey", plan.getPlanKey(), "interval", iv.name()));
        return scored;
    }

    // ---- scoring ------------------------------------------------------------------------------------------------------------------

    /** Fewest gaps, then the smallest increase, then the admin's rank. */
    private static final Comparator<Scored> SCORE_ORDER = Comparator
        .<Scored>comparingInt(s -> s.suggestion().gaps().size())
        .thenComparingLong(s -> Math.max(0L, s.suggestion().deltaMinor()))
        .thenComparingInt(s -> s.suggestion().rank());

    private Scored scoreCandidate(Ctx c, Plan plan, int rank, Set<String> used, Map<String, Long> needs, List<PersonalBasket.Held> held, Map<String, String> names) {
        if (!"INDIVIDUAL".equals(plan.getAudience()) || !"PUBLISHED".equals(plan.getStatus())) return null;
        PlanVersion version = versions.findLive(plan.getId()).orElse(null);
        if (version == null || version.getBaseProductId() == null) return null;
        Product baseProduct = products.findById(version.getBaseProductId()).orElse(null);
        if (baseProduct == null) return null;
        List<PlanComponent> comps = components.findByPlanVersionIdOrderBySortOrderAscIdAsc(version.getId());
        Set<String> included = new LinkedHashSet<>();
        Map<String, PlanComponent> optional = new LinkedHashMap<>();
        for (PlanComponent pc : comps) {
            if ("BASE".equals(pc.getRole()) || "INCLUDED".equals(pc.getRole())) included.add(pc.getFeatureKey());
            else if ("OPTIONAL".equals(pc.getRole()) && pc.getProductId() != null) optional.put(pc.getFeatureKey(), pc);
        }
        List<LineRequest> lines = new ArrayList<>();
        lines.add(new LineRequest(BASE_LINE, baseProduct.getCode(), 1, 0));
        Map<String, Integer> carried = new LinkedHashMap<>();
        Set<String> droppedAddons = new LinkedHashSet<>();
        for (PersonalBasket.Held h : held) {
            if (h.effectiveQuantity() <= 0) continue;
            PlanComponent oc = optional.get(h.featureKey());
            Product p = oc == null ? null : products.findById(oc.getProductId()).orElse(null);
            if (oc == null || p == null) {
                if (!included.contains(h.featureKey())) droppedAddons.add(h.featureKey());
                continue; // an include covers it; otherwise it is a gap below
            }
            int max = oc.getMaxQuantity() != null && oc.getMaxQuantity() > 0 ? oc.getMaxQuantity() : 0;
            int q = max > 0 ? Math.min(h.effectiveQuantity(), max) : h.effectiveQuantity();
            lines.add(new LineRequest(h.featureKey(), p.getCode(), q, max));
            carried.put(h.featureKey(), q);
        }
        PricingResult priced;
        IntervalSummary summary;
        PricingEngine engine = engine();
        PricingInputs in = new PricingInputs(Audience.INDIVIDUAL, c.currency, c.interval, c.now, List.of(new LineGroup(PricingInputs.PLAN_GROUP, lines)), null, null, null, 0, c.policy);
        try {
            priced = engine.price(in);
            summary = engine.summarize(in);
        } catch (PricingException e) {
            // an add-on without a price at this interval is a gap, not a failure: try once more without the add-ons that cannot be priced
            if (lines.size() > 1 && "PRICE_MISSING".equals(e.code())) {
                droppedAddons.addAll(carried.keySet());
                carried.clear();
                in = new PricingInputs(Audience.INDIVIDUAL, c.currency, c.interval, c.now, List.of(new LineGroup(PricingInputs.PLAN_GROUP, List.of(lines.get(0)))), null, null, null, 0, c.policy);
                try {
                    priced = engine.price(in);
                    summary = engine.summarize(in);
                } catch (PricingException e2) {
                    LOG.debug("retirement candidate {} is not priced at {}: {}", plan.getPlanKey(), c.interval, e2.code());
                    return null;
                }
            } else {
                LOG.debug("retirement candidate {} is not priced at {}: {}", plan.getPlanKey(), c.interval, e.code());
                return null;
            }
        }
        Set<String> offered = new LinkedHashSet<>(included);
        offered.addAll(optional.keySet());
        offered.removeAll(droppedAddons);
        List<String> covered = new ArrayList<>();
        List<String> gaps = new ArrayList<>();
        for (String u : new TreeSet<>(used)) {
            if (included.contains(u) || (offered.contains(u) && (carried.containsKey(u) || optional.containsKey(u)))) covered.add(u);
            else gaps.add(u);
        }
        Map<String, Long> capacity = capacity(catalogReader.version(version.getId()).orElse(null));
        for (Map.Entry<String, Long> need : needs.entrySet()) {
            if (capacity.getOrDefault(need.getKey(), 0L) < need.getValue()) gaps.add("limit:" + need.getKey());
        }
        long proposed = priced.recurringMinor();
        long delta = proposed - c.currentMinor;
        AnnualAlt annual = annualAlternative(c, plan, version, lines);
        List<Carried> carriedOut = carried.entrySet().stream().map(e -> new Carried(e.getKey(), e.getValue())).toList();
        Suggestion sug = new Suggestion(
            plan.getPlanKey(), plan.getName(), "PLAN", rank, List.copyOf(covered), List.copyOf(gaps), c.currentMinor, proposed, delta, direction(delta), c.interval.name(),
            summary.monthlyEquivalentMinor(), annual, carriedOut, null
        );
        return new Scored(sug, plan, version, priced, summary, carried);
    }

    private Scored scoreFree(Ctx c, Set<String> used, Map<String, Long> needs, Map<String, String> names) {
        Plan free = plans.findByPlanKey(FREE_KEY).orElse(null);
        if (free == null) return null;
        PlanVersion version = versions.findLive(free.getId()).orElse(null);
        if (version == null) return null;
        Set<String> included = includedKeys(version.getId());
        List<String> covered = new ArrayList<>();
        List<String> gaps = new ArrayList<>();
        for (String u : new TreeSet<>(used)) {
            if (included.contains(u)) covered.add(u);
            else gaps.add(u);
        }
        Map<String, Long> capacity = capacity(catalogReader.version(version.getId()).orElse(null));
        for (Map.Entry<String, Long> need : needs.entrySet()) {
            if (capacity.getOrDefault(need.getKey(), 0L) < need.getValue()) gaps.add("limit:" + need.getKey());
        }
        long delta = -c.currentMinor;
        Suggestion sug = new Suggestion(FREE_KEY, free.getName(), FREE_KEY, 1000, List.copyOf(covered), List.copyOf(gaps), c.currentMinor, 0L, delta, direction(delta), c.interval.name(), 0L, null, List.of(), null);
        return new Scored(sug, free, version, null, null, Map.of());
    }

    private AnnualAlt annualAlternative(Ctx c, Plan plan, PlanVersion version, List<LineRequest> lines) {
        if (c.interval == BillingInterval.YEAR || !catalogSettings.annualEnabled() || !intervalsOf(version).contains("YEAR")) return null;
        try {
            Ctx y = c.withInterval(BillingInterval.YEAR);
            PricingInputs in = new PricingInputs(Audience.INDIVIDUAL, y.currency, BillingInterval.YEAR, y.now, List.of(new LineGroup(PricingInputs.PLAN_GROUP, lines)), null, null, null, 0, y.policy);
            PricingEngine engine = engine();
            PricingResult res = engine.price(in);
            IntervalSummary sum = engine.summarize(in);
            long savings = sum.savingsMinor() == null ? 0L : Math.max(0L, sum.savingsMinor());
            return new AnnualAlt(res.recurringMinor(), savings);
        } catch (PricingException e) {
            return null;
        }
    }

    private static String direction(long delta) {
        return delta == 0 ? "SAME" : delta < 0 ? "LOWER" : "HIGHER";
    }

    // ---- what the subscriber uses -------------------------------------------------------------------------------------------------

    private Set<String> usedFeatures(Subscription sub, Ctx c, Set<String> previousIncluded) {
        int periods = Math.max(1, settings.getInt(BillingSettingKeys.RETIREMENT_SUGGESTION_LOOKBACK_PERIODS));
        Instant since = c.now.minus((long) periods * RetirementEffectiveDateService.months(c.interval.name()) * 30L, ChronoUnit.DAYS);
        SubscriptionOwners.Owner owner = owners.of(sub);
        Long userId = owner.userId();
        String login = owner.login();
        Set<String> signals = new LinkedHashSet<>();
        signals.addAll(jdbc.queryForList("SELECT DISTINCT feature_key FROM personal_usage_event WHERE user_id = ? AND status = 'COMMITTED' AND quantity > 0 AND created_at >= ?", String.class, userId, java.sql.Timestamp.from(since)));
        signals.addAll(jdbc.queryForList("SELECT DISTINCT feature_key FROM ai_call WHERE login = ? AND feature_key IS NOT NULL AND success = TRUE AND created_at >= ?", String.class, login, java.sql.Timestamp.from(since)));
        Integer inbox = jdbc.queryForObject("SELECT COUNT(*) FROM inbox_connection WHERE user_id = ?", Integer.class, userId);
        if (inbox != null && inbox > 0) signals.add("inbox.monitoring");
        Integer resumes = jdbc.queryForObject("SELECT COUNT(*) FROM resume WHERE user_id = ? AND (archived IS NULL OR archived = FALSE)", Integer.class, userId);
        if (resumes != null && resumes > 0) signals.add("resume.library");
        Set<String> used = new LinkedHashSet<>();
        for (String s : signals) if (previousIncluded.contains(s)) used.add(s);
        for (PersonalBasket.Held h : basket.held(sub.getId(), c.now)) if (h.effectiveQuantity() > 0) used.add(h.featureKey());
        return used;
    }

    /** Limits the subscriber's data already needs (a number of saved resumes): a candidate whose cap is lower has a gap there. */
    private Map<String, Long> limitNeeds(Subscription sub) {
        Map<String, Long> needs = new LinkedHashMap<>();
        Integer resumes = jdbc.queryForObject("SELECT COUNT(*) FROM resume WHERE user_id = ? AND (archived IS NULL OR archived = FALSE)", Integer.class, owners.of(sub).userId());
        if (resumes != null && resumes > 0) needs.put("resumes.max", resumes.longValue());
        return needs;
    }

    private Map<String, Long> capacity(PlanVersionData v) {
        Map<String, Long> out = new LinkedHashMap<>();
        if (v == null) return out;
        Map<String, FeatureDef> defs = catalogReader.features();
        for (Component comp : v.components()) {
            if (!comp.included()) continue;
            FeatureDef def = defs.get(comp.featureKey());
            if (def == null) continue;
            long value = comp.allowanceOverride() != null ? comp.allowanceOverride() : def.defaultAllowance();
            if (def.limitKey() != null) {
                if (comp.limitOverrides().containsKey(def.limitKey())) value = comp.limitOverrides().get(def.limitKey());
                out.merge(def.limitKey(), value, Math::max);
            }
            comp.limitOverrides().forEach((k, val) -> {
                if (!k.equals(def.limitKey())) out.merge(k, val, Math::max);
            });
        }
        return out;
    }

    private List<LockPreview> lockPreview(Long previousVersionId, List<PersonalBasket.Held> held, Map<String, String> names) {
        Set<String> holding = new LinkedHashSet<>(includedKeys(previousVersionId));
        for (PersonalBasket.Held h : held) if (h.effectiveQuantity() > 0) holding.add(h.featureKey());
        holding.removeAll(freeIncluded());
        List<LockPreview> out = new ArrayList<>();
        for (String k : new TreeSet<>(holding)) out.add(new LockPreview(k, names.getOrDefault(k, k)));
        return out;
    }

    /** What a Free account has: the included services of the live Free version. */
    Set<String> freeIncluded() {
        return plans.findByPlanKey(FREE_KEY).flatMap(p -> versions.findLive(p.getId())).map(v -> includedKeys(v.getId())).orElse(Set.of());
    }

    Set<String> includedKeys(Long versionId) {
        Set<String> out = new LinkedHashSet<>();
        if (versionId == null) return out;
        for (PlanComponent pc : components.findByPlanVersionIdOrderBySortOrderAscIdAsc(versionId)) {
            if ("BASE".equals(pc.getRole()) || "INCLUDED".equals(pc.getRole())) out.add(pc.getFeatureKey());
        }
        return out;
    }

    private Set<String> offeredOptional(Long versionId) {
        Set<String> out = new LinkedHashSet<>();
        if (versionId == null) return out;
        for (PlanComponent pc : components.findByPlanVersionIdOrderBySortOrderAscIdAsc(versionId)) {
            if ("OPTIONAL".equals(pc.getRole()) && pc.getProductId() != null) out.add(pc.getFeatureKey());
        }
        return out;
    }

    private long unitPrice(Ctx c, String featureKey, Long versionId) {
        if (versionId == null) return 0L;
        for (PlanComponent pc : components.findByPlanVersionIdOrderBySortOrderAscIdAsc(versionId)) {
            if (!featureKey.equals(pc.getFeatureKey()) || pc.getProductId() == null) continue;
            Product p = products.findById(pc.getProductId()).orElse(null);
            CatalogPort port = catalog.getIfAvailable();
            if (p == null || port == null) return 0L;
            return port.activePrice(p.getCode(), Audience.INDIVIDUAL, c.interval, c.currency, c.now).map(PriceRow::amountMinor).orElse(0L);
        }
        return 0L;
    }

    private List<PersonalBasket.Held> heldFrom(Map<String, Integer> requested, List<PersonalBasket.Held> actual) {
        List<PersonalBasket.Held> out = new ArrayList<>();
        for (PersonalBasket.Held h : actual) {
            Integer q = requested.get(h.featureKey());
            if (q != null && q > 0) out.add(new PersonalBasket.Held(h.row(), q, null));
        }
        return out;
    }

    private Map<String, String> names() {
        Map<String, String> out = new LinkedHashMap<>();
        for (FeatureDefinition d : features.findAllByOrderBySortOrderAsc()) out.put(d.getFeatureKey(), d.getName() == null || d.getName().isBlank() ? d.getFeatureKey() : d.getName());
        return out;
    }

    // ---- context ------------------------------------------------------------------------------------------------------------------

    private record Ctx(Instant now, BillingInterval interval, String currency, long currentMinor, IntervalPolicy policy) {
        Ctx withInterval(BillingInterval other) {
            return new Ctx(now, other, currency, currentMinor, policy);
        }
    }

    private Ctx ctx(Subscription sub, Instant now) {
        BillingInterval interval = parseInterval(sub.getBillingInterval());
        if (interval == null) interval = BillingInterval.MONTH;
        String currency = sub.getCurrency() == null || sub.getCurrency().isBlank() ? catalogSettings.defaultCurrency() : sub.getCurrency();
        return new Ctx(now, interval, currency, money.recurringMinor(sub, now), policy(interval == BillingInterval.YEAR));
    }

    private IntervalPolicy policy(boolean existingYearly) {
        EnumSet<BillingInterval> individual = EnumSet.noneOf(BillingInterval.class);
        for (String s : catalogSettings.intervals("INDIVIDUAL")) {
            BillingInterval i = parseInterval(s);
            if (i != null) individual.add(i);
        }
        EnumSet<BillingInterval> org = EnumSet.noneOf(BillingInterval.class);
        for (String s : catalogSettings.intervals("ORG")) {
            BillingInterval i = parseInterval(s);
            if (i != null) org.add(i);
        }
        if (existingYearly) individual.add(BillingInterval.YEAR); // an existing yearly term runs to its end even after annual is switched off (03 section 5)
        return new IntervalPolicy(individual, org, existingYearly || catalogSettings.annualEnabled());
    }

    private PricingEngine engine() {
        CatalogPort port = catalog.getIfAvailable();
        if (port == null) throw new BillingException(503, "CATALOG_UNAVAILABLE", "Prices are not available right now");
        return new PricingEngine(port);
    }

    private List<String> intervalsOf(PlanVersion v) {
        try {
            String raw = v.getIntervalsJson() == null ? "[]" : v.getIntervalsJson();
            return List.of(new com.fasterxml.jackson.databind.ObjectMapper().readValue(raw, String[].class));
        } catch (Exception e) {
            return List.of();
        }
    }

    private static BillingInterval parseInterval(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            BillingInterval i = BillingInterval.valueOf(s.trim().toUpperCase(Locale.ROOT));
            return i == BillingInterval.ONE_TIME ? null : i;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
