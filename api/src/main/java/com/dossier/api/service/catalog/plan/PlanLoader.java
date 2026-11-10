package com.dossier.api.service.catalog.plan;

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
import com.dossier.api.service.billing.margin.MarginInputs.PlanComposition;
import com.dossier.api.service.catalog.CatalogSettings;
import com.dossier.api.service.catalog.plan.PriceBook.Entry;
import com.dossier.api.service.catalog.plan.PriceBook.Source;
import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads the plan tables into the plain values the guard, the preview and the snapshot are computed from ({@link PlanModel}, {@link PriceBook}). The one place
 * that knows how a version, its components, their products and their price rows fit together; everything downstream is pure.
 *
 * <p>Price resolution (decision recorded in decisions-for-user.md): for a version being priced, a DRAFT row of a key <b>wins</b> over the ACTIVE one,
 * because publishing the version publishes that draft (and retires the active row it replaces). Pass {@code includeDrafts=false} for a version already
 * live: it is priced by what is in force.
 */
@Component
public class PlanLoader {

    private final PlanRepository plans;
    private final PlanVersionRepository versions;
    private final PlanComponentRepository components;
    private final ProductRepository products;
    private final FeatureDefinitionRepository features;
    private final ProductPriceRepository prices;
    private final CatalogSettings settings;
    private final ObjectMapper mapper;

    public PlanLoader(
        PlanRepository plans,
        PlanVersionRepository versions,
        PlanComponentRepository components,
        ProductRepository products,
        FeatureDefinitionRepository features,
        ProductPriceRepository prices,
        CatalogSettings settings,
        ObjectMapper mapper
    ) {
        this.plans = plans;
        this.versions = versions;
        this.components = components;
        this.products = products;
        this.features = features;
        this.prices = prices;
        this.settings = settings;
        this.mapper = mapper;
    }

    // ---- the model -------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public PlanModel model(Plan plan, PlanVersion v) {
        Audience audience = "ORG".equals(plan.getAudience()) ? Audience.ORG : Audience.INDIVIDUAL;
        String baseCode = v.getBaseProductId() == null ? null : products.findById(v.getBaseProductId()).map(Product::getCode).orElse(null);
        List<PlanModel.Comp> comps = new ArrayList<>();
        for (PlanComponent c : components.findByPlanVersionIdOrderBySortOrderAscIdAsc(v.getId())) {
            Product p = c.getProductId() == null ? null : products.findById(c.getProductId()).orElse(null);
            FeatureDefinition f = features.findByFeatureKey(c.getFeatureKey()).orElse(null);
            int ai = f == null || f.getAiBudgetCents() == null ? 0 : f.getAiBudgetCents();
            comps.add(new PlanModel.Comp(
                c.getFeatureKey(),
                c.getRole(),
                p == null ? null : p.getCode(),
                p == null ? null : p.getKind(),
                ai,
                c.getMaxQuantity() == null ? 1 : c.getMaxQuantity(),
                c.getDefaultQuantity() == null ? 1 : c.getDefaultQuantity(),
                c.getComponentDiscountBp()
            ));
        }
        return new PlanModel(
            plan.getPlanKey(),
            v.getVersion(),
            v.getStatus(),
            audience,
            plan.getName(),
            intervals(v.getIntervalsJson()),
            v.getAnnualDiscountBp(),
            v.getAiBudgetCapCents() == null ? 0 : v.getAiBudgetCapCents(),
            aiWindows(v.getAiWindowJson()),
            baseCode,
            comps,
            presetKeys(v.getPresetsJson())
        );
    }

    @Transactional(readOnly = true)
    public Optional<PlanModel> live(String planKey) {
        return plans.findByPlanKey(planKey).flatMap(p -> versions.findLive(p.getId()).map(v -> model(p, v)));
    }

    public Set<BillingInterval> intervals(String json) {
        Set<BillingInterval> out = EnumSet.noneOf(BillingInterval.class);
        JsonNode n = read(json);
        if (n != null && n.isArray()) {
            for (JsonNode e : n) {
                try {
                    out.add(BillingInterval.valueOf(e.asText()));
                } catch (IllegalArgumentException ignored) {
                    // an unknown interval is reported by the validator, which reads the raw JSON
                }
            }
        }
        return out;
    }

    /** {"QUARTER":800} to a map; the budget of a whole period in cents (decision E-2). */
    public Map<BillingInterval, Long> aiWindows(String json) {
        Map<BillingInterval, Long> out = new EnumMap<>(BillingInterval.class);
        JsonNode n = read(json);
        if (n != null && n.isObject()) {
            n.fields().forEachRemaining(e -> {
                try {
                    if (e.getValue().canConvertToLong() && e.getValue().longValue() >= 0) out.put(BillingInterval.valueOf(e.getKey()), e.getValue().longValue());
                } catch (IllegalArgumentException ignored) {
                    // unknown interval name: ignored
                }
            });
        }
        return out;
    }

    private List<String> presetKeys(String json) {
        List<String> out = new ArrayList<>();
        JsonNode n = read(json);
        if (n != null && n.isArray()) {
            for (JsonNode p : n) {
                if (p.hasNonNull("key")) out.add(p.get("key").asText());
            }
        }
        return out;
    }

    private JsonNode read(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return mapper.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }

    // ---- the price book --------------------------------------------------------------------------------------------------

    /**
     * What the version would sell at, per product, interval and currency. YEAR comes from an explicit row when there is one, else it is derived from the
     * MONTH price (K9.1) as a projection; a derived projection has no row until the version is published.
     */
    @Transactional(readOnly = true)
    public PriceBook book(PlanModel m, Instant at, String currency, boolean includeDrafts) {
        PriceBook book = new PriceBook();
        Audience audience = m.audience();
        boolean annual = settings.annualEnabled();
        for (String code : m.pricedProductCodes()) {
            Product product = products.findByCode(code).orElse(null);
            if (product == null) continue;
            Integer componentBp = m.components().stream().filter(c -> code.equals(c.productCode())).map(PlanModel.Comp::componentDiscountBp).filter(java.util.Objects::nonNull).findFirst().orElse(null);
            Set<BillingInterval> wanted = EnumSet.copyOf(m.intervals().isEmpty() ? EnumSet.of(BillingInterval.MONTH) : m.intervals());
            wanted.add(BillingInterval.ONE_TIME);
            for (BillingInterval interval : wanted) {
                if (interval == BillingInterval.YEAR) continue;
                resolve(product, audience, interval, currency, at, includeDrafts).ifPresent(book::put);
            }
            if (m.intervals().contains(BillingInterval.YEAR)) {
                Entry month = book.get(code, BillingInterval.MONTH, currency).orElse(null);
                Entry existing = resolve(product, audience, BillingInterval.YEAR, currency, at, includeDrafts).orElse(null);
                if (annual && month != null) {
                    AnnualPriceDeriver.yearFor(month, existing, componentBp, m.annualDiscountBp(), settings.annualDefaultDiscountBp()).ifPresent(book::put);
                } else if (existing != null) {
                    book.put(existing);
                }
            }
        }
        return book;
    }

    private Optional<Entry> resolve(Product product, Audience audience, BillingInterval interval, String currency, Instant at, boolean includeDrafts) {
        if (includeDrafts) {
            List<ProductPrice> drafts = prices.findDrafts(product.getId(), audience.name(), interval.name(), currency);
            if (!drafts.isEmpty()) return Optional.of(entry(product, drafts.get(0), Source.DRAFT));
        }
        List<ProductPrice> effective = prices.findEffectiveAt(product.getId(), audience.name(), interval.name(), currency, at);
        return effective.isEmpty() ? Optional.empty() : Optional.of(entry(product, effective.get(0), Source.ACTIVE));
    }

    private static Entry entry(Product product, ProductPrice p, Source source) {
        return new Entry(
            p.getId(), product.getCode(), "ORG".equals(p.getAudience()) ? Audience.ORG : Audience.INDIVIDUAL, BillingInterval.valueOf(p.getBillingInterval()), p.getCurrency(),
            p.getAmountMinor(), source, p.getStripePriceId(), p.getDerivedFromPriceId(), p.getDerivedDiscountBp(), "DERIVED".equals(p.getAnnualSource())
        );
    }

    /** The margin inputs of every PUBLISHED plan version, one per offered currency whose prices are all in force (for the fee-model re-evaluation). */
    @Transactional(readOnly = true)
    public List<PlanComposition> publishedCompositions() {
        List<PlanComposition> out = new ArrayList<>();
        Instant now = Instant.now();
        for (Plan p : plans.findAllByOrderBySortOrderAscIdAsc()) {
            Optional<PlanVersion> live = versions.findLive(p.getId());
            if (live.isEmpty()) continue;
            PlanModel m = model(p, live.get());
            for (String currency : settings.currencies()) {
                PriceBook book = book(m, now, currency, false);
                if (!missing(m, book, currency).isEmpty() || m.pricedProductCodes().isEmpty()) continue;
                out.add(PlanCompositions.of(m, book, currency));
            }
        }
        return out;
    }

    /**
     * The (feature, interval) pairs a version cannot sell in {@code currency}: the base and a seat base at every interval it lists, an optional component at the
     * primary interval only (a later interval it lacks is simply not offered for that add-on). FEE components are never required.
     */
    public static List<Missing> missing(PlanModel m, PriceBook book, String currency) {
        List<Missing> out = new ArrayList<>();
        BillingInterval primary = primary(m);
        if (m.baseProductCode() != null) {
            for (BillingInterval i : m.intervals()) {
                if (book.get(m.baseProductCode(), i, currency).isEmpty()) out.add(new Missing(m.planKey(), m.baseProductCode(), i, currency));
            }
        }
        for (PlanModel.Comp c : m.components()) {
            if (!c.priced() || c.fee() || c.productCode() == null) continue;
            if (c.base()) {
                for (BillingInterval i : m.intervals()) {
                    if (book.get(c.productCode(), i, currency).isEmpty()) out.add(new Missing(c.featureKey(), c.productCode(), i, currency));
                }
            } else if (book.get(c.productCode(), primary, currency).isEmpty()) {
                out.add(new Missing(c.featureKey(), c.productCode(), primary, currency));
            }
        }
        return out;
    }

    /** The interval every priced component must have a price for: MONTH when the version lists it, else the first listed. */
    public static BillingInterval primary(PlanModel m) {
        if (m.intervals().contains(BillingInterval.MONTH) || m.intervals().isEmpty()) return BillingInterval.MONTH;
        return m.intervals().stream().filter(BillingInterval::isRecurring).sorted().findFirst().orElse(BillingInterval.MONTH);
    }

    public record Missing(String featureKey, String productCode, BillingInterval interval, String currency) {}
}
