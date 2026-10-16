package com.dossier.api.service.catalog;

import com.dossier.api.domain.catalog.CatalogPublish;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.sub.CatalogPublishRepository;
import com.dossier.api.repository.sub.ProductPriceRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.CatalogDTO;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.CatalogVersionDTO;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PriceDTO;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PriceRequest;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.ProductDTO;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PublishPriceRequest;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.RetirePriceRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The catalog's prices and versions (docs/subscriptions/08-data-model.md section 2.3 and 2.4, 21-feature-catalog.md section 7; story K1.3). Prices are
 * immutable, effective-dated rows under a monotonic catalog version; nothing updates an amount.
 *
 * <ul>
 *   <li><b>Draft</b>: {@link #createDraft} stores a price that is not live. It is checked against the settings: ORG + QUARTER is refused (E17), YEAR is
 *       refused while {@code billing.annual.enabled} is false (422 INTERVAL_NOT_ENABLED), an interval or currency the settings do not offer is refused.</li>
 *   <li><b>Publish</b> (HIGH, reason): one transaction. {@code catalog_publish} gets version N+1; the row is stamped with it; {@code effective_from =
 *       max(now, requested)}; the row it replaces is retired ({@code active = false}, {@code retired_at}, {@code effective_until = the new effective_from}).
 *       A future {@code effective_from} makes the row SCHEDULED: the old row stays in force until {@link #activateDue} swaps them. At most one row is ever
 *       active per (product, audience, interval, currency): the database enforces it and the service answers 409 PRICE_ACTIVE_EXISTS.</li>
 *   <li><b>Retire</b> (HIGH, reason): refused (409 LAST_ACTIVE_PRICE_IN_LIVE_PLAN) when a PUBLISHED plan version still sells the product at that interval.
 *       Retiring never touches a license or add-on: they keep pointing at the retired row and keep being billed at it.</li>
 * </ul>
 *
 * Stripe objects are created by a {@link PriceStripeSync} (story K1.5) inside the same transaction; until then {@code stripe_price_id} stays NULL.
 */
@Service
public class CatalogService {

    public static final Set<String> AUDIENCES = Set.of("INDIVIDUAL", "ORG");
    public static final Set<String> INTERVALS = Set.of("MONTH", "QUARTER", "YEAR", "ONE_TIME");
    public static final Set<String> ANNUAL_SOURCES = Set.of("EXPLICIT", "DERIVED");
    private static final long MAX_AMOUNT_MINOR = 100_000_000_00L; // 100 million major units: a typo guard, not a business limit

    private final ProductPriceRepository prices;
    private final CatalogPublishRepository publishes;
    private final ProductRepository products;
    private final ServiceService services;
    private final PresetService presets;
    private final VolumeTierService tiers;
    private final CatalogSettings settings;
    private final LivePlanLookup livePlans;
    private final CatalogChangeRecorder changes;
    private final AdminAuditService audit;
    private final List<PriceStripeSync> stripeSyncs;
    private final ObjectMapper mapper;
    private final Clock clock;

    public CatalogService(
        ProductPriceRepository prices,
        CatalogPublishRepository publishes,
        ProductRepository products,
        ServiceService services,
        PresetService presets,
        VolumeTierService tiers,
        CatalogSettings settings,
        LivePlanLookup livePlans,
        CatalogChangeRecorder changes,
        AdminAuditService audit,
        List<PriceStripeSync> stripeSyncs,
        ObjectMapper mapper
    ) {
        this.prices = prices;
        this.publishes = publishes;
        this.products = products;
        this.services = services;
        this.presets = presets;
        this.tiers = tiers;
        this.settings = settings;
        this.livePlans = livePlans;
        this.changes = changes;
        this.audit = audit;
        this.stripeSyncs = stripeSyncs;
        this.mapper = mapper;
        this.clock = Clock.systemUTC();
    }

    // ---- reads -------------------------------------------------------------------

    @Transactional(readOnly = true)
    public CatalogDTO catalog() {
        List<ProductDTO> productDtos = new ArrayList<>();
        Map<Long, String> codes = new LinkedHashMap<>();
        for (Product p : products.findAllByOrderBySortOrderAsc()) {
            productDtos.add(ProductDTO.from(p));
            codes.put(p.getId(), p.getCode());
        }
        List<PriceDTO> priceDtos = new ArrayList<>();
        for (ProductPrice p : prices.findAllByOrderByIdDesc()) priceDtos.add(PriceDTO.from(p, codes.get(p.getProductId())));
        Map<String, Integer> floors = new LinkedHashMap<>();
        floors.put("subscriptionPct", settings.subscriptionFloorPct());
        floors.put("servicePct", settings.serviceFloorPct());
        return new CatalogDTO(productDtos, priceDtos, services.list(null, null, null, null), presets.list(), tiers.list(), floors, settings.feeModel(), publishes.currentVersion());
    }

    @Transactional(readOnly = true)
    public List<PriceDTO> prices(Long productId) {
        List<ProductPrice> rows = productId == null ? prices.findAllByOrderByIdDesc() : prices.findByProductIdOrderByIdDesc(productId);
        List<PriceDTO> out = new ArrayList<>();
        for (ProductPrice p : rows) out.add(PriceDTO.from(p, codeOf(p.getProductId())));
        return out;
    }

    @Transactional(readOnly = true)
    public int currentVersion() {
        return publishes.currentVersion();
    }

    @Transactional(readOnly = true)
    public List<CatalogVersionDTO> versions() {
        List<CatalogVersionDTO> out = new ArrayList<>();
        for (CatalogPublish c : publishes.findAllByOrderByIdDesc()) out.add(CatalogVersionDTO.from(c, ids(c.getPriceIdsJson()), List.of()));
        return out;
    }

    @Transactional(readOnly = true)
    public CatalogVersionDTO version(int n) {
        CatalogPublish c = publishes.findById(n).orElseThrow(() -> CatalogException.notFound("catalog version", String.valueOf(n)));
        List<PriceDTO> rows = new ArrayList<>();
        for (ProductPrice p : prices.findByCatalogVersionOrderByIdAsc(n)) rows.add(PriceDTO.from(p, codeOf(p.getProductId())));
        return CatalogVersionDTO.from(c, ids(c.getPriceIdsJson()), rows);
    }

    // ---- writes ------------------------------------------------------------------

    /** Create a DRAFT price. Nothing is live until {@link #publish}. */
    @Transactional
    public PriceDTO createDraft(PriceRequest r) {
        if (r == null) throw CatalogException.unprocessable("INVALID_VALUE", "A price body is required.");
        Product product = r.productId() == null ? null : products.findById(r.productId()).orElse(null);
        if (product == null) throw CatalogException.unprocessable("INVALID_VALUE", "Unknown product " + r.productId() + ".", Map.of("field", "productId"));
        String audience = upper(r.audience());
        if (!AUDIENCES.contains(audience)) throw CatalogException.unprocessable("INVALID_VALUE", "audience must be INDIVIDUAL or ORG.", Map.of("field", "audience"));
        if (!soldTo(product, audience)) {
            throw CatalogException.unprocessable("INVALID_VALUE", "Product " + product.getCode() + " is not sold to " + audience + ".", Map.of("field", "audience", "soldTo", String.valueOf(product.getSoldTo())));
        }
        String interval = upper(r.interval());
        String currency = r.currency() == null || r.currency().isBlank() ? settings.defaultCurrency() : upper(r.currency());
        checkIntervalAndCurrency(audience, interval, currency);
        if (r.amountMinor() == null || r.amountMinor() < 0 || r.amountMinor() > MAX_AMOUNT_MINOR) {
            throw CatalogException.unprocessable("INVALID_VALUE", "amountMinor must be a whole number of minor units, 0 or more.", Map.of("field", "amountMinor"));
        }
        long payout = r.payoutMinor() == null ? 0 : r.payoutMinor();
        int discount = r.subscriberDiscountBp() == null ? 0 : r.subscriberDiscountBp();
        if (payout < 0 || payout > r.amountMinor()) throw CatalogException.unprocessable("INVALID_VALUE", "payoutMinor must be between 0 and the amount.", Map.of("field", "payoutMinor"));
        if (discount < 0 || discount > 10_000) throw CatalogException.unprocessable("INVALID_VALUE", "subscriberDiscountBp must be between 0 and 10000.", Map.of("field", "subscriberDiscountBp"));
        if (r.countrySet() != null && r.countrySet().length() > 400) throw CatalogException.unprocessable("INVALID_VALUE", "countrySet is too long.", Map.of("field", "countrySet"));

        String annualSource = null;
        if ("YEAR".equals(interval)) {
            annualSource = r.annualSource() == null || r.annualSource().isBlank() ? "EXPLICIT" : upper(r.annualSource());
            if (!ANNUAL_SOURCES.contains(annualSource)) throw CatalogException.unprocessable("INVALID_VALUE", "annualSource must be EXPLICIT or DERIVED.", Map.of("field", "annualSource"));
            if ("DERIVED".equals(annualSource)) {
                ProductPrice from = r.derivedFromPriceId() == null ? null : prices.findById(r.derivedFromPriceId()).orElse(null);
                if (from == null || !"MONTH".equals(from.getBillingInterval()) || !from.getProductId().equals(product.getId())) {
                    throw CatalogException.unprocessable("INVALID_VALUE", "A derived yearly price names the monthly price of the same product it comes from.", Map.of("field", "derivedFromPriceId"));
                }
            }
        } else if (r.annualSource() != null && !r.annualSource().isBlank()) {
            throw CatalogException.unprocessable("INVALID_VALUE", "annualSource applies to YEAR prices only.", Map.of("field", "annualSource"));
        }

        Instant now = clock.instant();
        ProductPrice p = new ProductPrice();
        p.setProductId(product.getId());
        p.setAudience(audience);
        p.setBillingInterval(interval);
        p.setAmountMinor(r.amountMinor());
        p.setCurrency(currency);
        p.setPayoutMinor(payout);
        p.setSubscriberDiscountBp(discount);
        p.setAcceptsPromos(Boolean.TRUE.equals(r.acceptsPromos()));
        p.setCountrySet(r.countrySet() == null || r.countrySet().isBlank() ? null : r.countrySet().trim());
        p.setAnnualSource(annualSource);
        p.setDerivedFromPriceId("DERIVED".equals(annualSource) ? r.derivedFromPriceId() : null);
        p.setDerivedDiscountBp("DERIVED".equals(annualSource) ? r.derivedDiscountBp() : null);
        p.setActive(false);
        p.setEffectiveFrom(r.effectiveFrom() == null ? now : r.effectiveFrom());
        p.setCatalogVersion(0);
        p.setCreatedBy(actor());
        p.setCreatedAt(now);
        p = prices.save(p);
        PriceDTO after = PriceDTO.from(p, product.getCode());
        changes.record(CatalogChangeRecorder.ENTITY_PRODUCT_PRICE, String.valueOf(p.getId()), null, after, r.reason());
        audit.record(AdminAuditService.CATALOG_PRICE_CREATE, AdminAuditService.TARGET_CATALOG, "price:" + p.getId(), r.reason(), "risk=MEDIUM product=" + product.getCode() + " " + audience + " " + interval + " " + currency + " draft");
        return after;
    }

    /** Publish a draft (HIGH). See the class comment for the exact semantics. */
    @Transactional
    public PriceDTO publish(Long id, PublishPriceRequest r) {
        String reason = requireReason(r == null ? null : r.reason(), "Publishing a price");
        ProductPrice p = load(id);
        if (!"DRAFT".equals(p.status())) throw CatalogException.conflict("PRICE_STATE", "Price " + id + " is " + p.status() + ", only a DRAFT can be published.", Map.of("status", p.status()));
        Product product = products.findById(p.getProductId()).orElseThrow(() -> CatalogException.notFound("product", "of price " + id));
        if (!Boolean.TRUE.equals(product.getActive())) throw CatalogException.unprocessable("PRODUCT_RETIRED", "Product " + product.getCode() + " is retired.", Map.of("productId", product.getId()));
        checkIntervalAndCurrency(p.getAudience(), p.getBillingInterval(), p.getCurrency());

        Instant now = clock.instant();
        Instant requested = r.effectiveFrom();
        Instant effectiveFrom = requested == null || requested.isBefore(now) ? now : requested;
        boolean immediate = !effectiveFrom.isAfter(now);

        if (!prices.findScheduled(p.getProductId(), p.getAudience(), p.getBillingInterval(), p.getCurrency()).isEmpty()) {
            throw CatalogException.conflict("PRICE_ACTIVE_EXISTS", "A price for this product, audience, interval and currency is already scheduled; retire it first.", keyExtra(p));
        }
        ProductPrice replaced = prices.findActive(p.getProductId(), p.getAudience(), p.getBillingInterval(), p.getCurrency()).orElse(null);
        PriceDTO replacedBefore = replaced == null ? null : PriceDTO.from(replaced, product.getCode());
        if (replaced != null) {
            replaced.setEffectiveUntil(effectiveFrom);
            if (immediate) {
                replaced.setActive(false);
                replaced.setRetiredAt(now);
            }
            prices.saveAndFlush(replaced);
            if (immediate) stripeSyncs.forEach(s -> s.onRetire(replaced));
        }

        int version = publishes.currentVersion() + 1;
        PriceDTO before = PriceDTO.from(p, product.getCode());
        p.setEffectiveFrom(effectiveFrom);
        p.setPublishedAt(now);
        p.setCatalogVersion(version);
        p.setActive(immediate);
        try {
            p = prices.saveAndFlush(p);
        } catch (DataIntegrityViolationException e) {
            throw CatalogException.conflict("PRICE_ACTIVE_EXISTS", "Another price for this product, audience, interval and currency is active.", keyExtra(p));
        }
        for (PriceStripeSync s : stripeSyncs) s.onPublish(p);
        p = prices.saveAndFlush(p);
        PriceDTO after = PriceDTO.from(p, product.getCode());

        CatalogPublish c = new CatalogPublish();
        c.setId(version);
        c.setPublishedAt(now);
        c.setPublishedBy(actor());
        c.setSummary(summary(product, p, replaced));
        c.setPriceIdsJson(write(List.of(p.getId())));
        c.setSnapshotHash(sha256(write(after)));
        try {
            publishes.saveAndFlush(c);
        } catch (DataIntegrityViolationException e) {
            throw CatalogException.conflict("CATALOG_VERSION_CONFLICT", "Another publish took catalog version " + version + "; try again.", Map.of("version", version));
        }

        changes.record(CatalogChangeRecorder.ENTITY_PRODUCT_PRICE, String.valueOf(p.getId()), before, after, reason);
        if (replaced != null) changes.record(CatalogChangeRecorder.ENTITY_PRODUCT_PRICE, String.valueOf(replaced.getId()), replacedBefore, PriceDTO.from(replaced, product.getCode()), "replaced by price " + p.getId() + ": " + reason);
        String override = r.overrideReason() == null || r.overrideReason().isBlank() ? "" : " override=" + r.overrideReason().trim();
        audit.record(
            AdminAuditService.CATALOG_PRICE_PUBLISH, AdminAuditService.TARGET_CATALOG, "price:" + p.getId(), reason,
            "risk=HIGH catalogVersion=" + version + " product=" + product.getCode() + " " + p.getAudience() + " " + p.getBillingInterval() + " " + p.getAmountMinor() + " " + p.getCurrency()
                + (immediate ? "" : " scheduledFor=" + effectiveFrom) + override
        );
        return after;
    }

    /** Retire a price (HIGH). Immediate by default; a future {@code effectiveUntil} keeps the row in force until then. */
    @Transactional
    public PriceDTO retire(Long id, RetirePriceRequest r) {
        String reason = requireReason(r == null ? null : r.reason(), "Retiring a price");
        ProductPrice p = load(id);
        if ("RETIRED".equals(p.status())) throw CatalogException.conflict("PRICE_STATE", "Price " + id + " is already retired.", Map.of("status", "RETIRED"));
        Product product = products.findById(p.getProductId()).orElse(null);
        String code = product == null ? null : product.getCode();
        PriceDTO before = PriceDTO.from(p, code);
        Instant now = clock.instant();
        Instant until = r.effectiveUntil() == null || r.effectiveUntil().isBefore(now) ? now : r.effectiveUntil();

        if (Boolean.TRUE.equals(p.getActive())) {
            List<String> needing = livePlans.planKeysNeedingPrice(p.getProductId(), p.getBillingInterval());
            boolean successorScheduled = !prices.findScheduled(p.getProductId(), p.getAudience(), p.getBillingInterval(), p.getCurrency()).isEmpty();
            if (!needing.isEmpty() && !successorScheduled) {
                Map<String, Object> extra = new LinkedHashMap<>(keyExtra(p));
                extra.put("planKeys", needing);
                throw CatalogException.conflict("LAST_ACTIVE_PRICE_IN_LIVE_PLAN", "Price " + id + " is the only active " + p.getBillingInterval() + " price of a product the published plan(s) " + String.join(", ", needing) + " sell.", extra);
            }
        }
        boolean immediate = !until.isAfter(now);
        if (Boolean.TRUE.equals(p.getActive()) && !immediate) {
            p.setEffectiveUntil(until); // stays in force; activateDue retires it at the date
        } else {
            p.setActive(false);
            p.setRetiredAt(now);
            p.setEffectiveUntil(immediate ? now : until);
        }
        p = prices.saveAndFlush(p);
        if (p.getRetiredAt() != null) stripeSyncs.forEach(s -> s.onRetire(prices.findById(id).orElseThrow()));
        PriceDTO after = PriceDTO.from(p, code);
        changes.record(CatalogChangeRecorder.ENTITY_PRODUCT_PRICE, String.valueOf(id), before, after, reason);
        audit.record(AdminAuditService.CATALOG_PRICE_RETIRE, AdminAuditService.TARGET_CATALOG, "price:" + id, reason, "risk=HIGH product=" + code + " " + p.getAudience() + " " + p.getBillingInterval() + " until=" + p.getEffectiveUntil());
        return after;
    }

    /**
     * Make the clock catch up with the catalog: scheduled rows whose effective date has come replace their predecessor and go live; rows whose
     * {@code effective_until} has passed stop being active. Idempotent; called by {@code CatalogActivationJob} and by tests. Returns how many rows changed.
     */
    @Transactional
    public int activateDue(Instant now) {
        int changed = 0;
        for (ProductPrice old : prices.findActiveExpired(now)) {
            old.setActive(false);
            old.setRetiredAt(now);
            prices.saveAndFlush(old);
            stripeSyncs.forEach(s -> s.onRetire(old));
            changed++;
        }
        for (ProductPrice due : prices.findScheduledDue(now)) {
            due.setActive(true);
            try {
                prices.saveAndFlush(due);
                changed++;
            } catch (DataIntegrityViolationException e) {
                // a predecessor without an effective_until is still active: leave the row scheduled and report it in the audit trail
                audit.record(AdminAuditService.CATALOG_PRICE_PUBLISH, AdminAuditService.TARGET_CATALOG, "price:" + due.getId(), null, "risk=HIGH activation blocked by an active price for the same key");
            }
        }
        return changed;
    }

    // ---- internals -----------------------------------------------------------------

    private void checkIntervalAndCurrency(String audience, String interval, String currency) {
        if (!INTERVALS.contains(interval)) throw CatalogException.unprocessable("INVALID_VALUE", "interval must be one of " + List.of("MONTH", "QUARTER", "YEAR", "ONE_TIME") + ".", Map.of("field", "interval"));
        if ("ORG".equals(audience) && "QUARTER".equals(interval)) {
            throw CatalogException.unprocessable("ORG_QUARTER_REFUSED", "An organization is never billed quarterly (E17).", Map.of("interval", interval, "audience", audience));
        }
        if ("YEAR".equals(interval) && !settings.annualEnabled()) {
            throw CatalogException.unprocessable("INTERVAL_NOT_ENABLED", "Yearly billing is switched off (billing.annual.enabled).", Map.of("interval", interval));
        }
        if (!"ONE_TIME".equals(interval) && !settings.intervals(audience).contains(interval)) {
            throw CatalogException.unprocessable("INTERVAL_NOT_OFFERED", "The " + interval + " interval is not offered to " + audience + " (billing.intervals).", Map.of("interval", interval, "audience", audience));
        }
        if (currency == null || !settings.currencies().contains(currency)) {
            throw CatalogException.unprocessable("CURRENCY_NOT_OFFERED", "Currency " + currency + " is not offered (billing.currencies).", Map.of("currency", String.valueOf(currency)));
        }
    }

    private static boolean soldTo(Product product, String audience) {
        String soldTo = product.getSoldTo();
        return soldTo == null || "BOTH".equals(soldTo) || soldTo.equals(audience);
    }

    private ProductPrice load(Long id) {
        return prices.findById(id).orElseThrow(() -> CatalogException.notFound("price", String.valueOf(id)));
    }

    private String codeOf(Long productId) {
        return products.findById(productId).map(Product::getCode).orElse(null);
    }

    private static String requireReason(String reason, String what) {
        if (reason == null || reason.trim().length() < CatalogException.REASON_MIN_LENGTH) {
            throw CatalogException.unprocessable("REASON_REQUIRED", what + " needs a reason of at least " + CatalogException.REASON_MIN_LENGTH + " characters.", Map.of("minLength", CatalogException.REASON_MIN_LENGTH));
        }
        return reason.trim();
    }

    private static Map<String, Object> keyExtra(ProductPrice p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("productId", p.getProductId());
        m.put("audience", p.getAudience());
        m.put("interval", p.getBillingInterval());
        m.put("currency", p.getCurrency());
        return m;
    }

    private static String summary(Product product, ProductPrice p, ProductPrice replaced) {
        String s = "Published " + product.getCode() + " " + p.getAudience() + " " + p.getBillingInterval() + " " + p.getAmountMinor() + " " + p.getCurrency() + " (price " + p.getId() + ")";
        return replaced == null ? s : s + ", replacing price " + replaced.getId() + " at " + replaced.getAmountMinor();
    }

    private static String upper(String s) {
        return s == null ? "" : s.trim().toUpperCase(Locale.ROOT);
    }

    private static String actor() {
        String login = SecurityUtils.getCurrentUserLogin().orElse("system");
        return login.length() > 50 ? login.substring(0, 50) : login;
    }

    private List<Long> ids(String json) {
        List<Long> out = new ArrayList<>();
        if (json == null) return out;
        try {
            mapper.readTree(json).forEach(n -> out.add(n.asLong()));
        } catch (JsonProcessingException e) {
            // a malformed ledger row reads as empty
        }
        return out;
    }

    private String write(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
