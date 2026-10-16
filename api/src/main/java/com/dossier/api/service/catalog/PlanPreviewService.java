package com.dossier.api.service.catalog;

import com.dossier.api.domain.catalog.Plan;
import com.dossier.api.domain.catalog.PlanVersion;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.sub.PlanRepository;
import com.dossier.api.repository.sub.PlanVersionRepository;
import com.dossier.api.repository.sub.ProductPriceRepository;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.margin.CheckKind;
import com.dossier.api.service.billing.margin.MarginCalculator;
import com.dossier.api.service.billing.margin.MarginCheck;
import com.dossier.api.service.billing.margin.MarginInputs.Preset;
import com.dossier.api.service.billing.margin.MarginInputs.PresetItem;
import com.dossier.api.service.billing.margin.MarginReport;
import com.dossier.api.service.catalog.dto.CatalogRulesDTOs.PresetDTO;
import com.dossier.api.service.catalog.dto.PlanPreviewDTO;
import com.dossier.api.service.catalog.dto.PlanPreviewDTO.AnnualPreview;
import com.dossier.api.service.catalog.dto.PlanPreviewDTO.CheckRow;
import com.dossier.api.service.catalog.dto.PlanPreviewDTO.Impact;
import com.dossier.api.service.catalog.dto.PlanPreviewDTO.OptionalRow;
import com.dossier.api.service.catalog.dto.PlanPreviewDTO.Roster;
import com.dossier.api.service.catalog.dto.PlanPreviewDTO.RosterLine;
import com.dossier.api.service.catalog.dto.PlanPreviewDTO.SeatPreset;
import com.dossier.api.service.catalog.dto.PlanPreviewDTO.SeatsPreview;
import com.dossier.api.service.catalog.dto.PlanPreviewDTO.StripeObject;
import com.dossier.api.service.catalog.dto.PlanPreviewDTO.WorstCase;
import com.dossier.api.service.catalog.plan.PlanCompositions;
import com.dossier.api.service.catalog.plan.PlanLoader;
import com.dossier.api.service.catalog.plan.PlanModel;
import com.dossier.api.service.catalog.plan.PlanSnapshot;
import com.dossier.api.service.catalog.plan.PlanSubscriberCounts;
import com.dossier.api.service.catalog.plan.PlanValidator;
import com.dossier.api.service.catalog.plan.PriceBook;
import com.dossier.api.service.catalog.plan.PriceBook.Entry;
import com.dossier.api.service.catalog.plan.PriceBook.Source;
import com.dossier.api.service.catalog.plan.PricingInputsLoader;
import com.dossier.api.service.pricing.AnnualPrices;
import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import com.dossier.api.service.pricing.Minor;
import com.dossier.api.service.pricing.PricingEngine;
import com.dossier.api.service.pricing.PricingException;
import com.dossier.api.service.pricing.PricingInputs;
import com.dossier.api.service.pricing.PricingInputs.LineGroup;
import com.dossier.api.service.pricing.PricingResult;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.ToIntFunction;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Story K2.3: everything the builder shows about a version, computed here so the web renders and computes nothing (docs/subscriptions/09 section 1.4). Pure
 * reads: totals from a {@link PricingEngine} that answers from the version's own {@link PriceBook} (a draft is priced with the DRAFT rows it will publish and the
 * yearly rows it will derive), margins and levers from the {@link MarginCalculator}, the same publish gates as {@code PlanService.publish} reported as data
 * (structure, deps, prices, margin), the roster of an organization plan, and the impact of publishing.
 *
 * <p>Roster syntax: a comma separated list of {@code [n]token}; {@code token} is {@code BASE} (a bare seat) or a preset key of the version (its
 * {@code presets_json}) or of the catalog presets. The sum of the seats is the organization's recurring total.
 */
@Service
public class PlanPreviewService {

    private final PlanRepository plans;
    private final PlanVersionRepository versions;
    private final PlanLoader loader;
    private final PlanValidator validator;
    private final MarginCalculator calculator;
    private final CatalogSettings settings;
    private final PlanSubscriberCounts counts;
    private final CatalogService catalog;
    private final PresetService presets;
    private final ProductRepository products;
    private final ProductPriceRepository prices;
    private final PricingInputsLoader inputs;
    private final StripeGateway gateway;
    private final PlanSnapshot snapshots;

    public PlanPreviewService(
        PlanRepository plans,
        PlanVersionRepository versions,
        PlanLoader loader,
        PlanValidator validator,
        MarginCalculator calculator,
        CatalogSettings settings,
        PlanSubscriberCounts counts,
        CatalogService catalog,
        PresetService presets,
        ProductRepository products,
        ProductPriceRepository prices,
        PricingInputsLoader inputs,
        StripeGateway gateway,
        PlanSnapshot snapshots
    ) {
        this.plans = plans;
        this.versions = versions;
        this.loader = loader;
        this.validator = validator;
        this.calculator = calculator;
        this.settings = settings;
        this.counts = counts;
        this.catalog = catalog;
        this.presets = presets;
        this.products = products;
        this.prices = prices;
        this.inputs = inputs;
        this.gateway = gateway;
        this.snapshots = snapshots;
    }

    @Transactional(readOnly = true)
    public PlanPreviewDTO preview(String planKey, int v, String intervalParam, String currencyParam, String roster) {
        Plan plan = plans.findByPlanKey(planKey == null ? "" : planKey.trim().toUpperCase(Locale.ROOT)).orElseThrow(() -> CatalogException.notFound("plan", String.valueOf(planKey)));
        PlanVersion ver = versions.findByPlanIdAndVersion(plan.getId(), v).orElseThrow(() -> CatalogException.notFound("plan version", plan.getPlanKey() + " v" + v));
        PlanModel m = loader.model(plan, ver);
        boolean draft = "DRAFT".equals(ver.getStatus());
        Instant now = Instant.now();
        Instant at = draft || ver.getEffectiveFrom() == null ? now : ver.getEffectiveFrom();

        String currency = currencyParam == null || currencyParam.isBlank() ? settings.defaultCurrency() : currencyParam.trim().toUpperCase(Locale.ROOT);
        if (!settings.currencies().contains(currency)) {
            throw CatalogException.unprocessable("CURRENCY_NOT_OFFERED", "Currency " + currency + " is not offered (billing.currencies).", Map.of("currency", currency));
        }
        BillingInterval interval = interval(intervalParam, m);
        PriceBook book = loader.book(m, at, currency, draft);
        Audience audience = m.audience();

        // ---- the gates, as data ----
        List<CheckRow> checks = new ArrayList<>();
        checks.add(gate("structure", () -> {
            validator.checkIntervals(plan.getAudience(), m.intervals().stream().map(Enum::name).toList());
            validator.checkStructure(plan, m);
        }));
        checks.add(gate("deps", () -> validator.checkDependencies(m)));
        List<PlanLoader.Missing> missing = m.pricedProductCodes().isEmpty() ? List.of() : PlanLoader.missing(m, book, currency);
        checks.add(new CheckRow("prices", missing.isEmpty(), missing.stream().map(x -> row("featureKey", x.featureKey(), "interval", x.interval().name(), "currency", x.currency())).toList()));

        // ---- the money ----
        MarginReport report = new MarginReport(List.of(), List.of());
        boolean priced = !m.pricedProductCodes().isEmpty() && missing.isEmpty();
        if (priced) report = calculator.checkPlan(PlanCompositions.of(m, book, currency));
        final MarginReport rep = report;
        List<MarginCheck> failing = report.failures();
        checks.add(new CheckRow("margin", failing.isEmpty(), failing.stream().map(PlanPreviewService::failure).toList()));

        String baseCode = m.baseProductCode() != null ? m.baseProductCode() : m.components().stream().filter(PlanModel.Comp::base).map(PlanModel.Comp::productCode).filter(java.util.Objects::nonNull).findFirst().orElse(null);
        Long baseMinor = baseCode == null ? null : book.get(baseCode, interval, currency).map(Entry::amountMinor).orElse(null);
        long aiCap = baseCode == null ? 0 : Math.max(0, PlanCompositions.aiWindow(m, baseCode, interval));

        List<OptionalRow> optional = new ArrayList<>();
        for (PlanModel.Comp c : m.components()) {
            if (!c.optional() || c.productCode() == null) continue;
            Optional<Entry> e = book.get(c.productCode(), interval, currency);
            if (e.isEmpty()) continue;
            MarginCheck mc = rep.checks().stream().filter(x -> x.interval() == interval && c.featureKey().equals(x.featureKey()) && x.kind() != CheckKind.COMPOSITION).findFirst().orElse(null);
            long ai = Math.multiplyExact((long) c.aiBudgetCentsPerMonth(), (long) Math.max(1, interval.factor()));
            if (mc == null) mc = calculator.checkFeature(c.featureKey(), audience, interval, currency, e.get().amountMinor(), ai);
            optional.add(new OptionalRow(c.featureKey(), e.get().amountMinor(), Math.max(1, c.maxQuantity()), ai, mc.marginBp(), mc.pass(), mc.levers()));
        }

        WorstCase worst = null;
        if (priced) {
            MarginCheck wc = rep.checks().stream().filter(x -> x.interval() == interval && x.kind() == CheckKind.COMPOSITION).findFirst()
                .or(() -> rep.checks().stream().filter(x -> x.interval() == interval && (x.kind() == CheckKind.BASE || x.kind() == CheckKind.DISCOUNT) && baseCode != null && (x.featureKey().equals(m.planKey()) || baseCodeFeature(m, baseCode, x.featureKey()))).findFirst())
                .orElse(null);
            if (wc != null) worst = new WorstCase(wc.amountMinor(), wc.aiCostMinor(), wc.feeMinor(), wc.marginBp(), wc.floorBp(), wc.pass(), wc.levers());
        }

        AnnualPreview annual = annual(m, book, currency, baseCode, report);
        SeatsPreview seats = audience == Audience.ORG ? seats(m, book, currency, interval, at, roster, ver.getPresetsJson()) : null;
        Impact impact = impact(plan, ver, m, book, draft);

        return new PlanPreviewDTO(plan.getPlanKey(), ver.getVersion(), ver.getStatus(), plan.getAudience(), interval.name(), currency, baseMinor, aiCap, optional, worst, annual, seats, checks, impact);
    }

    private static boolean baseCodeFeature(PlanModel m, String baseCode, String featureKey) {
        return m.components().stream().anyMatch(c -> baseCode.equals(c.productCode()) && c.featureKey().equals(featureKey) && c.base());
    }

    private BillingInterval interval(String param, PlanModel m) {
        BillingInterval i;
        if (param == null || param.isBlank()) {
            i = PlanLoader.primary(m);
        } else {
            try {
                i = BillingInterval.valueOf(param.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw CatalogException.unprocessable("INVALID_VALUE", "interval must be MONTH, QUARTER or YEAR.", Map.of("field", "interval"));
            }
            if (!i.isRecurring()) throw CatalogException.unprocessable("INVALID_VALUE", "interval must be MONTH, QUARTER or YEAR.", Map.of("field", "interval"));
        }
        if (i == BillingInterval.YEAR && !settings.annualEnabled()) {
            throw CatalogException.unprocessable("INTERVAL_NOT_ENABLED", "Yearly billing is switched off (billing.annual.enabled).", Map.of("interval", "YEAR"));
        }
        if (!m.intervals().isEmpty() && !m.intervals().contains(i)) {
            throw CatalogException.unprocessable("INTERVAL_NOT_AVAILABLE", "This version does not list " + i + ".", Map.of("interval", i.name()));
        }
        return i;
    }

    private static CheckRow gate(String id, Runnable r) {
        try {
            r.run();
            return new CheckRow(id, true, List.of());
        } catch (CatalogException e) {
            Map<String, Object> f = new LinkedHashMap<>(e.getExtra());
            f.put("code", e.getCode());
            f.put("message", e.getMessage());
            return new CheckRow(id, false, List.of(f));
        }
    }

    private static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(String.valueOf(kv[i]), kv[i + 1]);
        return m;
    }

    private static Map<String, Object> failure(MarginCheck c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("featureKey", c.featureKey());
        m.put("kind", c.kind().name());
        m.put("interval", c.interval().name());
        m.put("currency", c.currency());
        m.put("marginBp", c.marginBp());
        m.put("floorBp", c.floorBp());
        m.put("overridable", c.overridable());
        m.put("levers", c.levers());
        return m;
    }

    // ---- annual ---------------------------------------------------------------------------------------------------------

    private AnnualPreview annual(PlanModel m, PriceBook book, String currency, String baseCode, MarginReport report) {
        if (!settings.annualEnabled() || !m.intervals().contains(BillingInterval.YEAR) || baseCode == null) {
            return new AnnualPreview(false, null, null, null, null, null, false, List.of());
        }
        Entry year = book.get(baseCode, BillingInterval.YEAR, currency).orElse(null);
        Entry month = book.get(baseCode, BillingInterval.MONTH, currency).orElse(null);
        List<MarginCheck> yearChecks = report.checks().stream().filter(c -> c.interval() == BillingInterval.YEAR).toList();
        List<MarginCheck> yearFailing = yearChecks.stream().filter(c -> !c.pass()).toList();
        List<CheckRow> checks = List.of(new CheckRow("margin", yearFailing.isEmpty(), yearFailing.stream().map(PlanPreviewService::failure).toList()));
        if (year == null) return new AnnualPreview(true, AnnualPrices.resolveDiscountBp(null, m.annualDiscountBp(), settings.annualDefaultDiscountBp()), null, null, null, null, true, checks);
        Integer discount = year.isDerived() && year.derivedDiscountBp() != null ? year.derivedDiscountBp() : month == null ? null : AnnualPrices.impliedDiscountBp(month.amountMinor(), year.amountMinor());
        Long savings = month == null ? null : Minor.mul(month.amountMinor(), 12) - year.amountMinor();
        Integer savingsBp = month == null || month.amountMinor() == 0 ? null : (int) Minor.mulDivHalfEven(savings, 10_000, Minor.mul(month.amountMinor(), 12));
        return new AnnualPreview(true, discount, year.amountMinor(), Minor.mulDivHalfEven(year.amountMinor(), 1, 12), savings, savingsBp, year.isDerived(), checks);
    }

    // ---- seats (ORG) ----------------------------------------------------------------------------------------------------

    private record SeatDef(String token, List<String> features, Map<String, Integer> addons) {}

    private SeatsPreview seats(PlanModel m, PriceBook book, String currency, BillingInterval interval, Instant at, String roster, String presetsJson) {
        PricingEngine engine = engine(m, book);
        PlanModel.Comp seatBase = m.components().stream().filter(c -> PlanModel.SEAT_BASE.equals(c.role())).findFirst().orElse(null);
        Long seatBaseMinor = seatBase == null || seatBase.productCode() == null ? null : book.get(seatBase.productCode(), interval, currency).map(Entry::amountMinor).orElse(null);
        Map<String, SeatDef> defs = seatDefs(m, presetsJson);
        List<SeatPreset> presetRows = new ArrayList<>();
        for (SeatDef d : defs.values()) {
            if (d.token().equals("BASE") || seatBaseMinor == null) continue;
            Map<String, Integer> addons = d.addons();
            long total;
            try {
                total = seatTotal(engine, m, interval, currency, at, addons);
            } catch (CatalogException e) {
                continue; // an add-on without a price at this interval is simply not previewable
            }
            boolean mirrored = false;
            Long individual = null;
            boolean ok = true;
            Optional<PresetDTO> catalogPreset = presets.list().stream().filter(p -> p.key().equalsIgnoreCase(d.token())).findFirst();
            if (catalogPreset.isPresent() && catalogPreset.get().mirrorsProductCode() != null) {
                mirrored = true;
                individual = individualMonth(catalogPreset.get().mirrorsProductCode(), currency, at);
            }
            if (interval == BillingInterval.MONTH && individual != null) {
                List<PresetItem> items = new ArrayList<>();
                items.add(new PresetItem(seatBase.featureKey(), seatBaseMinor, 0));
                for (String f : addons.keySet()) {
                    PlanModel.Comp c = m.components().stream().filter(x -> x.featureKey().equals(f)).findFirst().orElse(null);
                    if (c != null && c.productCode() != null) {
                        items.add(new PresetItem(f, book.get(c.productCode(), interval, currency).map(Entry::amountMinor).orElse(0L), c.aiBudgetCentsPerMonth()));
                    }
                }
                ok = calculator.checkPreset(new Preset(d.token(), currency, interval, items, individual, mirrored)).presetFindings().isEmpty();
            }
            presetRows.add(new SeatPreset(d.token(), total, ok, mirrored, individual, d.features()));
        }
        Roster r = roster == null || roster.isBlank() ? null : roster(engine, m, defs, interval, currency, at, roster, seatBase);
        return new SeatsPreview(seatBaseMinor, presetRows, r);
    }

    private PricingEngine engine(PlanModel m, PriceBook book) {
        Map<String, String> kinds = new HashMap<>();
        Map<String, ToIntFunction<BillingInterval>> ai = new HashMap<>();
        for (String code : m.pricedProductCodes()) {
            PlanModel.Comp comp = m.components().stream().filter(c -> code.equals(c.productCode())).findFirst().orElse(null);
            if (comp != null && comp.productKind() != null) kinds.put(code, comp.productKind());
            ai.put(code, i -> PlanCompositions.aiWindow(m, code, i));
        }
        return new PricingEngine(book.asCatalogPort(kinds, ai));
    }

    private long seatTotal(PricingEngine engine, PlanModel m, BillingInterval interval, String currency, Instant at, Map<String, Integer> addons) {
        LineGroup g = inputs.orgSeat(m, "seat", addons);
        return price(engine, inputs.org(currency, interval, at, List.of(g))).recurringMinor();
    }

    /** The engine's business refusals (a missing price, a quantity above the limit) as the API's 422. */
    private static PricingResult price(PricingEngine engine, PricingInputs in) {
        try {
            return engine.price(in);
        } catch (PricingException e) {
            throw CatalogException.unprocessable(e.code(), e.getMessage(), new LinkedHashMap<>(e.details()));
        }
    }

    private Roster roster(PricingEngine engine, PlanModel m, Map<String, SeatDef> defs, BillingInterval interval, String currency, Instant at, String roster, PlanModel.Comp seatBase) {
        List<LineGroup> groups = new ArrayList<>();
        List<RosterLine> lines = new ArrayList<>();
        int seat = 0;
        for (String raw : roster.split(",")) {
            String t = raw.trim();
            if (t.isEmpty()) continue;
            int n = 1;
            int d = 0;
            while (d < t.length() && Character.isDigit(t.charAt(d))) d++;
            if (d > 0 && d < t.length()) {
                n = Integer.parseInt(t.substring(0, d));
                t = t.substring(d).trim();
            }
            if (n < 1 || n > 500) throw CatalogException.unprocessable("INVALID_VALUE", "A roster line counts 1 to 500 seats.", Map.of("field", "roster"));
            SeatDef def = defs.get(t.toUpperCase(Locale.ROOT));
            if (def == null) throw CatalogException.unprocessable("INVALID_VALUE", "Unknown roster token '" + t + "': use BASE or a preset key of this version.", Map.of("field", "roster", "token", t));
            long seatTotal = seatTotal(engine, m, interval, currency, at, def.addons());
            for (int i = 0; i < n; i++) groups.add(inputs.orgSeat(m, "seat-" + (++seat), def.addons()));
            lines.add(new RosterLine(def.token(), n, seatTotal, Math.multiplyExact(seatTotal, (long) n), def.features()));
        }
        if (groups.isEmpty()) throw CatalogException.unprocessable("INVALID_VALUE", "The roster is empty.", Map.of("field", "roster"));
        PricingResult total = price(engine, inputs.org(currency, interval, at, groups));
        return new Roster(lines, total.recurringMinor(), setupFee(m, currency, at));
    }

    private Long setupFee(PlanModel m, String currency, Instant at) {
        long sum = 0;
        boolean any = false;
        for (PlanModel.Comp c : m.components()) {
            if (!c.fee() || c.productCode() == null) continue;
            Product p = products.findByCode(c.productCode()).orElse(null);
            if (p == null) continue;
            Optional<ProductPrice> row = prices.findEffectiveAt(p.getId(), "ORG", "ONE_TIME", currency, at).stream().findFirst();
            if (row.isPresent()) {
                sum += row.get().getAmountMinor();
                any = true;
            }
        }
        return any ? sum : null;
    }

    private Long individualMonth(String productCode, String currency, Instant at) {
        Product p = products.findByCode(productCode).orElse(null);
        if (p == null) return null;
        return prices.findEffectiveAt(p.getId(), "INDIVIDUAL", "MONTH", currency, at).stream().findFirst().map(ProductPrice::getAmountMinor).orElse(null);
    }

    /** The seat shortcuts of the version: BASE, the presets of {@code presets_json} (addons with quantities) and the catalog presets that fit the version. */
    private Map<String, SeatDef> seatDefs(PlanModel m, String presetsJson) {
        Map<String, SeatDef> out = new LinkedHashMap<>();
        out.put("BASE", new SeatDef("BASE", List.of(), Map.of()));
        Set<String> optionalKeys = new LinkedHashSet<>();
        m.components().stream().filter(PlanModel.Comp::optional).forEach(c -> optionalKeys.add(c.featureKey()));
        JsonNode own = snapshots.parse(presetsJson);
        if (own != null && own.isArray()) {
            for (JsonNode p : own) {
                String key = p.path("key").asText("");
                if (key.isBlank()) continue;
                Map<String, Integer> addons = new LinkedHashMap<>();
                JsonNode list = p.path("addons");
                if (list.isArray()) {
                    for (JsonNode a : list) {
                        String f = a.path("featureKey").asText("");
                        int q = a.path("quantity").asInt(1);
                        if (optionalKeys.contains(f) && q > 0) addons.put(f, q);
                    }
                }
                out.put(key.toUpperCase(Locale.ROOT), new SeatDef(key, new ArrayList<>(addons.keySet()), addons));
            }
        }
        for (PresetDTO p : presets.list()) {
            Map<String, Integer> addons = new LinkedHashMap<>();
            boolean fits = true;
            for (String f : p.featureKeys()) {
                boolean isBase = m.components().stream().anyMatch(c -> c.featureKey().equals(f) && (c.base() || PlanModel.SEAT_INCLUDED.equals(c.role())));
                if (isBase) continue;
                if (optionalKeys.contains(f)) addons.put(f, 1);
                else fits = false;
            }
            if (fits) out.putIfAbsent(p.key().toUpperCase(Locale.ROOT), new SeatDef(p.key(), new ArrayList<>(addons.keySet()), addons));
        }
        return out;
    }

    // ---- impact ---------------------------------------------------------------------------------------------------------

    private Impact impact(Plan plan, PlanVersion ver, PlanModel m, PriceBook book, boolean draft) {
        Map<String, Long> subs = new LinkedHashMap<>();
        counts.byVersion(plan.getId()).forEach((k, n) -> subs.put(String.valueOf(k), n));
        List<StripeObject> objects = new ArrayList<>();
        if (draft) {
            Set<String> productsSeen = new LinkedHashSet<>();
            for (Entry e : book.all()) {
                if (e.source() == Source.ACTIVE) continue;
                Product p = products.findByCode(e.productCode()).orElse(null);
                if (p != null && (p.getStripeProductId() == null || p.getStripeProductId().isBlank()) && productsSeen.add(p.getCode())) {
                    objects.add(new StripeObject("product", p.getCode(), null, null, null, "prod-" + p.getCode()));
                }
                objects.add(new StripeObject("price", e.productCode(), e.interval().name(), e.currency(), e.priceId(), e.priceId() == null ? "price-{new row}" : "price-" + e.priceId()));
            }
        }
        return new Impact(subs, true, draft ? "on publish" : String.valueOf(ver.getEffectiveFrom()), catalog.currentVersion() + (draft ? 1 : 0), gateway.isEnabled(), objects);
    }
}
