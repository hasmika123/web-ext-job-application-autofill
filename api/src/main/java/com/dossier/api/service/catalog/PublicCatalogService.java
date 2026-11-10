package com.dossier.api.service.catalog;

import com.dossier.api.domain.catalog.Plan;
import com.dossier.api.domain.catalog.PlanComponent;
import com.dossier.api.domain.catalog.PlanVersion;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.sub.CatalogPublishRepository;
import com.dossier.api.repository.sub.PlanComponentRepository;
import com.dossier.api.repository.sub.PlanRepository;
import com.dossier.api.repository.sub.PlanVersionRepository;
import com.dossier.api.service.dto.PublicCatalogDTO;
import com.dossier.api.service.dto.PublicCatalogDTO.Addon;
import com.dossier.api.service.dto.PublicCatalogDTO.Included;
import com.dossier.api.service.dto.PublicCatalogDTO.Price;
import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import com.dossier.api.service.pricing.CatalogPort;
import com.dossier.api.service.pricing.IntervalPolicy;
import com.dossier.api.service.pricing.IntervalSummary;
import com.dossier.api.service.pricing.PricingEngine;
import com.dossier.api.service.pricing.PricingException;
import com.dossier.api.service.pricing.PricingInputs;
import com.dossier.api.service.pricing.PricingInputs.LineGroup;
import com.dossier.api.service.pricing.PricingInputs.LineRequest;
import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code GET /api/catalog/public} (docs/subscriptions/09-apis.md section 2; story K5.1): the published, public, effective individual plans with their prices
 * per interval, what each includes, the optional add-ons that have a price, and precomputed basket totals. Everything is priced by the same
 * {@link PricingEngine} the quotes use, so the page and a quote can never disagree. Read-only, no account.
 *
 * <p>Never listed: drafts, retired or sunset plans, plans that are not {@code public}, a version that is not yet effective, a plan with a base product but no
 * price at any offered interval (it cannot be sold), and a plan whose eligibility names a verification or a country the caller is not in. A plan with no
 * base product (Free) is listed without prices. The result is cached for a minute and dropped whenever the catalog version moves.
 */
@Service
@Transactional(readOnly = true)
public class PublicCatalogService {

    private static final long CACHE_MS = 60_000L;
    private static final String BASE_LINE = "base";
    private static final int MAX_PAIR_ADDONS = 6;

    private final PlanRepository plans;
    private final PlanVersionRepository versions;
    private final PlanComponentRepository components;
    private final ProductRepository products;
    private final FeatureDefinitionRepository features;
    private final CatalogPublishRepository catalogVersions;
    private final ObjectProvider<CatalogPort> catalog;
    private final CatalogSettings catalogSettings;
    private final SettingsService settings;
    private final ObjectMapper json;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    private record Cached(PublicCatalogDTO dto, int catalogVersion, long expiresAtMs) {}

    public PublicCatalogService(
        PlanRepository plans,
        PlanVersionRepository versions,
        PlanComponentRepository components,
        ProductRepository products,
        FeatureDefinitionRepository features,
        CatalogPublishRepository catalogVersions,
        ObjectProvider<CatalogPort> catalog,
        CatalogSettings catalogSettings,
        SettingsService settings,
        ObjectMapper json
    ) {
        this.plans = plans;
        this.versions = versions;
        this.components = components;
        this.products = products;
        this.features = features;
        this.catalogVersions = catalogVersions;
        this.catalog = catalog;
        this.catalogSettings = catalogSettings;
        this.settings = settings;
        this.json = json;
    }

    /** Seconds the HTTP response may be cached by clients ({@code billing.public_catalog.cache_seconds}); 0 means not at all. */
    public int cacheSeconds() {
        return Math.max(0, settings.getInt(BillingSettingKeys.PUBLIC_CATALOG_CACHE_SECONDS));
    }

    /** The individual catalog for a visitor in {@code country} (ISO code or null). */
    public PublicCatalogDTO catalog(String country) {
        String key = country == null ? "" : country.trim().toUpperCase(Locale.ROOT);
        int version = catalogVersions.currentVersion();
        long now = System.currentTimeMillis();
        Cached hit = cache.get(key);
        if (hit != null && hit.catalogVersion() == version && hit.expiresAtMs() > now) return hit.dto();
        PublicCatalogDTO fresh = build(key, version);
        cache.put(key, new Cached(fresh, version, now + CACHE_MS));
        return fresh;
    }

    /** One public plan, or empty when it does not exist or is not public. */
    public java.util.Optional<PublicCatalogDTO.Plan> plan(String planKey, String country) {
        if (planKey == null) return java.util.Optional.empty();
        return catalog(country).plans().stream().filter(p -> p.planKey().equalsIgnoreCase(planKey.trim())).findFirst();
    }

    /** Drops the cached answers (tests, and a publish that does not move the catalog version). */
    public void clearCache() {
        cache.clear();
    }

    // ---- build -----------------------------------------------------------------------------------------------------------------------

    private PublicCatalogDTO build(String country, int version) {
        String currency = catalogSettings.defaultCurrency();
        boolean annual = catalogSettings.annualEnabled();
        String consent = settings.getString(BillingSettingKeys.CHECKOUT_CONSENT_TEXT);
        CatalogPort port = catalog.getIfAvailable();
        List<PublicCatalogDTO.Plan> out = new ArrayList<>();
        Map<String, Map<String, Map<String, Long>>> totals = new LinkedHashMap<>();
        List<String> intervalUnion = new ArrayList<>();
        if (port != null) {
            PricingEngine engine = new PricingEngine(port);
            IntervalPolicy policy = policy();
            Instant now = Instant.now();
            Map<String, FeatureDefinition> defs = new LinkedHashMap<>();
            for (FeatureDefinition d : features.findAllByOrderBySortOrderAsc()) defs.put(d.getFeatureKey(), d);
            for (Plan plan : plans.findByAudienceOrderBySortOrderAscIdAsc("INDIVIDUAL")) {
                if (!"PUBLISHED".equals(plan.getStatus()) || !Boolean.TRUE.equals(plan.getPublicPlan())) continue;
                if (!eligible(plan, country)) continue;
                PlanVersion v = versions.findLive(plan.getId()).orElse(null);
                if (v == null) continue;
                if (v.getEffectiveFrom() != null && v.getEffectiveFrom().isAfter(now)) continue;
                if (v.getEffectiveUntil() != null && !v.getEffectiveUntil().isAfter(now)) continue;
                Built b = view(plan, v, engine, policy, currency, now, defs);
                if (b == null) continue;
                out.add(b.plan());
                if (!b.totals().isEmpty()) totals.put(plan.getPlanKey(), b.totals());
                for (String i : b.plan().intervals()) if (!intervalUnion.contains(i)) intervalUnion.add(i);
            }
        }
        List<String> order = List.of("MONTH", "QUARTER", "YEAR");
        intervalUnion.sort((a, c) -> Integer.compare(order.indexOf(a), order.indexOf(c)));
        return new PublicCatalogDTO(version, currency, List.copyOf(intervalUnion), annual, consent == null || consent.isBlank() ? null : consent, List.copyOf(out), totals);
    }

    private record Built(PublicCatalogDTO.Plan plan, Map<String, Map<String, Long>> totals) {}

    private Built view(Plan plan, PlanVersion v, PricingEngine engine, IntervalPolicy policy, String currency, Instant now, Map<String, FeatureDefinition> defs) {
        List<PlanComponent> comps = components.findByPlanVersionIdOrderBySortOrderAscIdAsc(v.getId());
        List<Included> included = new ArrayList<>();
        for (PlanComponent c : comps) {
            if (!"BASE".equals(c.getRole()) && !"INCLUDED".equals(c.getRole())) continue;
            FeatureDefinition d = defs.get(c.getFeatureKey());
            if (d == null || !Boolean.TRUE.equals(d.getActive())) continue;
            Long allowance = c.getAllowanceOverride() != null ? c.getAllowanceOverride() : d.getDefaultAllowance();
            included.add(new Included(d.getFeatureKey(), c.getMarketingLabel() != null && !c.getMarketingLabel().isBlank() ? c.getMarketingLabel() : d.getName(), d.getDescription(), allowance, d.getUsageUnit()));
        }

        // A plan without a base product is a free plan: listed, no prices.
        if (v.getBaseProductId() == null) {
            return new Built(new PublicCatalogDTO.Plan(plan.getPlanKey(), plan.getName(), plan.getBadge(), plan.getDescription(), List.of(), Map.of(), List.copyOf(included), List.of(), false), Map.of());
        }
        Product base = products.findById(v.getBaseProductId()).orElse(null);
        if (base == null) return null;

        List<BillingInterval> offered = new ArrayList<>();
        for (String s : intervalsOf(v)) {
            BillingInterval i = parse(s);
            if (i != null && policy.individual().contains(i) && (i != BillingInterval.YEAR || policy.annualEnabled())) offered.add(i);
        }
        Map<String, Price> prices = new LinkedHashMap<>();
        List<BillingInterval> priced = new ArrayList<>();
        for (BillingInterval i : offered) {
            IntervalSummary s = summarize(engine, policy, currency, i, now, List.of(new LineRequest(BASE_LINE, base.getCode(), 1, 0)));
            if (s == null) continue; // no published price at this interval: it is not offered
            prices.put(i.name(), price(s, i));
            priced.add(i);
        }
        if (priced.isEmpty()) return null;

        List<Addon> addons = new ArrayList<>();
        List<PlanComponent> addonComps = new ArrayList<>();
        for (PlanComponent c : comps) {
            if (!"OPTIONAL".equals(c.getRole()) || c.getProductId() == null) continue;
            Product p = products.findById(c.getProductId()).orElse(null);
            FeatureDefinition d = defs.get(c.getFeatureKey());
            if (p == null || d == null) continue;
            int max = c.getMaxQuantity() != null && c.getMaxQuantity() > 0 ? c.getMaxQuantity() : d.getMaxQuantity() != null && d.getMaxQuantity() > 0 ? d.getMaxQuantity() : 0;
            Map<String, Price> ap = new LinkedHashMap<>();
            for (BillingInterval i : priced) {
                IntervalSummary s = summarize(engine, policy, currency, i, now, List.of(new LineRequest(c.getFeatureKey(), p.getCode(), 1, max)));
                if (s != null) ap.put(i.name(), price(s, i));
            }
            if (ap.isEmpty()) continue; // an add-on with no published price is omitted, not listed
            addons.add(new Addon(d.getFeatureKey(), c.getMarketingLabel() != null && !c.getMarketingLabel().isBlank() ? c.getMarketingLabel() : d.getName(), d.getDescription(), max == 0 ? null : max, ap));
            addonComps.add(c);
        }

        Map<String, Map<String, Long>> totals = new LinkedHashMap<>();
        for (BillingInterval i : priced) {
            Map<String, Long> row = totalsFor(engine, policy, currency, i, now, base, addonComps, defs);
            if (!row.isEmpty()) totals.put(i.name(), row);
        }
        List<String> intervals = priced.stream().map(Enum::name).toList();
        boolean sunset = "SUNSET".equals(plan.getStatus());
        return new Built(new PublicCatalogDTO.Plan(plan.getPlanKey(), plan.getName(), plan.getBadge(), plan.getDescription(), intervals, prices, List.copyOf(included), List.copyOf(addons), sunset), totals);
    }

    /** One add-on at quantity 1 and 2, and every pair of add-ons at quantity 1 (up to {@value #MAX_PAIR_ADDONS} add-ons); keys sorted by feature key. */
    private Map<String, Long> totalsFor(PricingEngine engine, IntervalPolicy policy, String currency, BillingInterval interval, Instant now, Product base, List<PlanComponent> addons, Map<String, FeatureDefinition> defs) {
        Map<String, Long> row = new LinkedHashMap<>();
        List<PlanComponent> sorted = addons.stream().sorted((a, b) -> a.getFeatureKey().compareTo(b.getFeatureKey())).toList();
        for (PlanComponent a : sorted) {
            for (int q = 1; q <= 2; q++) {
                Long total = total(engine, policy, currency, interval, now, base, Map.of(a, q), defs);
                if (total != null) row.put(a.getFeatureKey() + ":" + q, total);
            }
        }
        if (sorted.size() <= MAX_PAIR_ADDONS) {
            for (int x = 0; x < sorted.size(); x++) {
                for (int y = x + 1; y < sorted.size(); y++) {
                    Map<PlanComponent, Integer> pair = new LinkedHashMap<>();
                    pair.put(sorted.get(x), 1);
                    pair.put(sorted.get(y), 1);
                    Long total = total(engine, policy, currency, interval, now, base, pair, defs);
                    if (total != null) row.put(sorted.get(x).getFeatureKey() + ":1," + sorted.get(y).getFeatureKey() + ":1", total);
                }
            }
        }
        return row;
    }

    private Long total(PricingEngine engine, IntervalPolicy policy, String currency, BillingInterval interval, Instant now, Product base, Map<PlanComponent, Integer> addons, Map<String, FeatureDefinition> defs) {
        List<LineRequest> lines = new ArrayList<>();
        lines.add(new LineRequest(BASE_LINE, base.getCode(), 1, 0));
        for (Map.Entry<PlanComponent, Integer> e : addons.entrySet()) {
            Product p = products.findById(e.getKey().getProductId()).orElse(null);
            if (p == null) return null;
            lines.add(new LineRequest(e.getKey().getFeatureKey(), p.getCode(), e.getValue(), 0));
        }
        try {
            return engine.price(inputs(policy, currency, interval, now, lines)).recurringMinor();
        } catch (PricingException e) {
            return null;
        }
    }

    private IntervalSummary summarize(PricingEngine engine, IntervalPolicy policy, String currency, BillingInterval interval, Instant now, List<LineRequest> lines) {
        try {
            return engine.summarize(inputs(policy, currency, interval, now, lines));
        } catch (PricingException e) {
            return null;
        }
    }

    private static PricingInputs inputs(IntervalPolicy policy, String currency, BillingInterval interval, Instant now, List<LineRequest> lines) {
        return new PricingInputs(Audience.INDIVIDUAL, currency, interval, now, List.of(new LineGroup(PricingInputs.PLAN_GROUP, lines)), null, null, null, 0, policy);
    }

    private static Price price(IntervalSummary s, BillingInterval interval) {
        if (interval == BillingInterval.MONTH) return new Price(s.totalMinor(), null, null, null);
        return new Price(s.totalMinor(), s.monthlyEquivalentMinor(), s.savingsMinor(), s.savingsBp());
    }

    private IntervalPolicy policy() {
        EnumSet<BillingInterval> individual = EnumSet.noneOf(BillingInterval.class);
        for (String s : catalogSettings.intervals("INDIVIDUAL")) {
            BillingInterval i = parse(s);
            if (i != null) individual.add(i);
        }
        EnumSet<BillingInterval> org = EnumSet.noneOf(BillingInterval.class);
        for (String s : catalogSettings.intervals("ORG")) {
            BillingInterval i = parse(s);
            if (i != null) org.add(i);
        }
        return new IntervalPolicy(individual, org, catalogSettings.annualEnabled());
    }

    /** A plan that needs a verification is not for the anonymous catalog; one limited to countries needs the caller's country to be among them. */
    private boolean eligible(Plan plan, String country) {
        if (plan.getEligibilityJson() == null || plan.getEligibilityJson().isBlank()) return true;
        try {
            JsonNode node = json.readTree(plan.getEligibilityJson());
            JsonNode verification = node.get("verification");
            if (verification != null && !verification.isNull() && !verification.asText().isBlank()) return false;
            JsonNode countries = node.get("countries");
            if (countries != null && countries.isArray() && countries.size() > 0) {
                if (country == null || country.isBlank()) return false;
                for (JsonNode c : countries) if (country.equalsIgnoreCase(c.asText())) return true;
                return false;
            }
            return true;
        } catch (JsonProcessingException e) {
            return false; // unreadable eligibility: do not offer it
        }
    }

    private List<String> intervalsOf(PlanVersion v) {
        try {
            return json.readValue(v.getIntervalsJson() == null ? "[]" : v.getIntervalsJson(), new TypeReference<List<String>>() {});
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    private static BillingInterval parse(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            BillingInterval i = BillingInterval.valueOf(s.trim().toUpperCase(Locale.ROOT));
            return i == BillingInterval.ONE_TIME ? null : i;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
