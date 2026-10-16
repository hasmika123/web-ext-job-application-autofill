package com.dossier.api.service.billing.personal;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.catalog.Plan;
import com.dossier.api.domain.catalog.PlanComponent;
import com.dossier.api.domain.catalog.PlanVersion;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.domain.sub.SubscriptionQuote;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.sub.CatalogPublishRepository;
import com.dossier.api.repository.sub.PlanComponentRepository;
import com.dossier.api.repository.sub.PlanRepository;
import com.dossier.api.repository.sub.PlanVersionRepository;
import com.dossier.api.repository.sub.SubscriptionQuoteRepository;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.billing.BillingScopeRouter;
import com.dossier.api.service.dto.PlanQuoteDTO;
import com.dossier.api.service.dto.PlanQuoteDTO.Addition;
import com.dossier.api.service.dto.PlanQuoteDTO.Basket;
import com.dossier.api.service.dto.PlanQuoteDTO.Confirmation;
import com.dossier.api.service.dto.PlanQuoteDTO.PlanRef;
import com.dossier.api.service.dto.PlanQuoteDTO.QuoteLine;
import com.dossier.api.service.dto.PlanQuoteDTO.Removal;
import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import com.dossier.api.service.pricing.CatalogPort;
import com.dossier.api.service.pricing.ChangeImpact;
import com.dossier.api.service.pricing.DependencyRules;
import com.dossier.api.service.pricing.IntervalPolicy;
import com.dossier.api.service.pricing.IntervalSummary;
import com.dossier.api.service.pricing.PriceRow;
import com.dossier.api.service.pricing.PricingEngine;
import com.dossier.api.service.pricing.PricingException;
import com.dossier.api.service.pricing.PricingInputs;
import com.dossier.api.service.pricing.PricingInputs.LineGroup;
import com.dossier.api.service.pricing.PricingInputs.LineRequest;
import com.dossier.api.service.pricing.PricingResult;
import com.dossier.api.service.pricing.PricingResult.LineResult;
import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.ZoneOffset;
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
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The personal QuoteService (docs/subscriptions/09-apis.md section 3.1, 03 sections 3, 4 and 6; story K3.3). It prices a basket with {@link PricingEngine},
 * stores it as a {@code subscription_quote} (TTL from {@code billing.quote.ttl_minutes}) and later answers "is this exactly what the person saw?" with an
 * inputs hash, so checkout and confirm apply the quote's numbers or refuse as stale. It never calls Stripe and never writes the subscription mirror: quotes
 * work with billing disabled.
 *
 * <p>Three kinds: CHECKOUT (a signed-in person without a live subscription), CHANGE (add, remove or resize add-ons of the live subscription; the plan and the
 * interval cannot change here, K5.6) and ANONYMOUS (the pricing page; no account, never checked out). The price source is the {@link CatalogPort}; the real
 * adapter is a bean of the plans stream, so this class asks for it lazily and answers 503 {@code CATALOG_UNAVAILABLE} until it exists.
 */
@Service
public class PersonalQuoteService {

    private static final Logger LOG = LoggerFactory.getLogger(PersonalQuoteService.class);

    public static final String KIND_CHECKOUT = "CHECKOUT";
    public static final String KIND_CHANGE = "CHANGE";
    public static final String KIND_ANONYMOUS = "ANONYMOUS";
    public static final String STATUS_OPEN = "OPEN";
    public static final String STATUS_APPLIED = "APPLIED";
    public static final String STATUS_EXPIRED = "EXPIRED";
    static final String BASE_LINE = "base";

    private final PlanRepository plans;
    private final PlanVersionRepository versions;
    private final PlanComponentRepository components;
    private final ProductRepository products;
    private final FeatureDefinitionRepository features;
    private final SubscriptionRepository subscriptions;
    private final SubscriptionQuoteRepository quotes;
    private final CatalogPublishRepository catalogVersions;
    private final UserRepository users;
    private final PersonalBasket basket;
    private final BillingScopeRouter router;
    private final ObjectProvider<CatalogPort> catalog;
    private final SettingsService settings;
    private final com.dossier.api.service.catalog.CatalogSettings catalogSettings;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public PersonalQuoteService(
        PlanRepository plans,
        PlanVersionRepository versions,
        PlanComponentRepository components,
        ProductRepository products,
        FeatureDefinitionRepository features,
        SubscriptionRepository subscriptions,
        SubscriptionQuoteRepository quotes,
        CatalogPublishRepository catalogVersions,
        UserRepository users,
        PersonalBasket basket,
        BillingScopeRouter router,
        ObjectProvider<CatalogPort> catalog,
        SettingsService settings,
        com.dossier.api.service.catalog.CatalogSettings catalogSettings,
        JdbcTemplate jdbc,
        ObjectMapper json
    ) {
        this.plans = plans;
        this.versions = versions;
        this.components = components;
        this.products = products;
        this.features = features;
        this.subscriptions = subscriptions;
        this.quotes = quotes;
        this.catalogVersions = catalogVersions;
        this.users = users;
        this.basket = basket;
        this.router = router;
        this.catalog = catalog;
        this.settings = settings;
        this.catalogSettings = catalogSettings;
        this.jdbc = jdbc;
        this.json = json;
    }

    // ---- public API -------------------------------------------------------------------------------------------------------------

    /** Price a basket and keep it. {@code login} is null only for an anonymous quote. */
    @Transactional(noRollbackFor = BillingException.class)
    public PlanQuoteDTO create(QuoteRequest req, String login) {
        Ctx ctx = resolve(req, login);
        Built built = build(ctx);
        Instant now = Instant.now();
        SubscriptionQuote q = new SubscriptionQuote();
        q.setUserId(ctx.user == null ? null : ctx.user.getId());
        q.setSubscriptionId(ctx.sub == null ? null : ctx.sub.getId());
        q.setKind(ctx.storedKind());
        q.setPlanVersionId(ctx.version.getId());
        q.setBillingInterval(ctx.interval.name());
        q.setCurrency(ctx.currency);
        q.setCatalogVersion(built.dto.catalogVersion());
        q.setPromoCode(null);
        q.setInputsHash(built.hash);
        PlanQuoteDTO dto = built.dto;
        q.setLinesJson(write(new Stored(dto, built.meta)));
        q.setCurrentRecurringMinor(dto.current().recurringMinor());
        q.setProposedRecurringMinor(dto.proposed().recurringMinor());
        q.setDeltaMinor(dto.deltaMinor());
        q.setMonthlyEquivalentMinor(dto.proposed().monthlyEquivalentMinor() == null ? dto.proposed().recurringMinor() : dto.proposed().monthlyEquivalentMinor());
        q.setSavingsMinor(dto.proposed().savingsMinor() == null ? 0 : dto.proposed().savingsMinor());
        q.setProrationEstimateMinor(dto.prorationEstimateMinor());
        q.setNextInvoiceEstimateMinor(dto.nextInvoiceEstimateMinor());
        q.setTaxEstimateMinor(null);
        q.setTaxSource(dto.taxSource());
        q.setEffectiveAt("now".equals(dto.effectiveAt()) ? now : Instant.parse(dto.effectiveAt()));
        q.setPeriodEndAt(built.periodEnd);
        q.setExpiresAt(now.plus(settings.getInt(BillingSettingKeys.QUOTE_TTL_MINUTES), ChronoUnit.MINUTES));
        q.setStatus(STATUS_OPEN);
        q.setWarningsJson(write(dto.warnings()));
        q.setCreatedAt(now);
        q = quotes.saveAndFlush(q);
        return present(q, parse(q));
    }

    /** The caller's own quote; 404 for anyone else's (and for anonymous quotes, which are never stored for later reads), 410 once expired. */
    @Transactional(noRollbackFor = BillingException.class)
    public PlanQuoteDTO get(Long id, String login) {
        SubscriptionQuote q = owned(id, login);
        return present(q, parse(q));
    }

    /** The quote row for the caller, expiry applied; used by checkout and confirm. */
    @Transactional(noRollbackFor = BillingException.class)
    public SubscriptionQuote owned(Long id, String login) {
        User user = personalUser(login);
        SubscriptionQuote q = quotes.findById(id).orElseThrow(PersonalQuoteService::notFound);
        if (q.getUserId() == null || !q.getUserId().equals(user.getId())) throw notFound();
        expireIfDue(q);
        if (STATUS_EXPIRED.equals(q.getStatus())) throw new BillingException(410, "QUOTE_EXPIRED", "This quote has expired. Get a new one.");
        return q;
    }

    /**
     * Whether the quote is still exactly what the person was shown. Recomputes the same basket against today's prices and subscription; a different
     * hash is 409 {@code QUOTE_STALE {reason}} (PRICE_CHANGED, SUBSCRIPTION_CHANGED or PLAN_CHANGED).
     */
    @Transactional(readOnly = true, noRollbackFor = BillingException.class)
    public void requireFresh(SubscriptionQuote q) {
        Stored stored = parse(q);
        User user = q.getUserId() == null ? null : users.findById(q.getUserId()).orElse(null);
        Ctx ctx;
        try {
            ctx = fromStored(q, stored, user);
        } catch (BillingException e) {
            throw stale(e.getCode().equals("PLAN_SUNSET") ? "PLAN_CHANGED" : "SUBSCRIPTION_CHANGED");
        }
        Built fresh;
        try {
            fresh = build(ctx);
        } catch (BillingException e) {
            throw stale("PRICE_CHANGED");
        }
        if (fresh.hash.equals(q.getInputsHash())) return;
        String reason = !fresh.meta.stateHash().equals(stored.meta().stateHash()) ? "SUBSCRIPTION_CHANGED" : "PRICE_CHANGED";
        throw stale(reason);
    }

    /** The DTO of a stored quote with its current status. */
    public PlanQuoteDTO toDto(SubscriptionQuote q) {
        return present(q, parse(q));
    }

    /** The stored request of a quote: the add-on target and the plan, for confirm. */
    public Stored stored(SubscriptionQuote q) {
        return parse(q);
    }

    /** Housekeeping hook for the expiry sweep. */
    @Transactional(noRollbackFor = BillingException.class)
    public int expireOpenQuotes() {
        return quotes.expireOpenBefore(Instant.now());
    }

    // ---- stored shape --------------------------------------------------------------------------------------------------------------

    /** What {@code lines_json} holds: the DTO as shown and the request meta needed to recompute it. */
    public record Stored(PlanQuoteDTO dto, Meta meta) {}

    public record Meta(
        String planKey,
        String interval,
        Map<String, Integer> addons,
        List<String> confirmedDeps,
        String stateHash,
        String priceHash,
        Map<String, Integer> current,
        /** K5.6: UPGRADE_PLAN, DOWNGRADE_PLAN or CHANGE_INTERVAL for a plan or interval switch; null for an add-on change. */
        String switchKind,
        String fromPlanKey,
        Long fromVersionId,
        String fromInterval
    ) {}

    // ---- resolution ------------------------------------------------------------------------------------------------------------------

    /** Everything a build needs, resolved from the request and the database. */
    private static final class Ctx {

        User user;
        Subscription sub;
        boolean anonymous;
        String kind;
        Plan plan;
        PlanVersion version;
        BillingInterval interval;
        String currency;
        Map<String, Integer> addons = new LinkedHashMap<>();
        Set<String> confirmed = new LinkedHashSet<>();
        Instant now = Instant.now();
        /** K5.6: set when the quote switches plan and/or interval; {@code plan}, {@code version} and {@code interval} are then the TARGET. */
        boolean switching;
        boolean planChanges;
        Plan fromPlan;
        PlanVersion fromVersion;
        BillingInterval fromInterval;
        SwitchRules.Kind switchKind;

        String storedKind() {
            return anonymous ? KIND_ANONYMOUS : kind;
        }
    }

    private Ctx resolve(QuoteRequest req, String login) {
        Ctx ctx = new Ctx();
        ctx.anonymous = Boolean.TRUE.equals(req.anonymous());
        ctx.kind = req.kind() == null || req.kind().isBlank() ? KIND_CHECKOUT : req.kind().trim().toUpperCase(Locale.ROOT);
        if (!KIND_CHECKOUT.equals(ctx.kind) && !KIND_CHANGE.equals(ctx.kind)) {
            throw new BillingException(400, "INVALID_KIND", "kind must be CHECKOUT or CHANGE");
        }
        if (ctx.anonymous && KIND_CHANGE.equals(ctx.kind)) {
            throw new BillingException(400, "INVALID_KIND", "An anonymous quote can only price a new subscription");
        }
        if (req.promoCode() != null && !req.promoCode().isBlank()) {
            // No promo_code mirror exists yet (decision pending): refuse rather than silently ignore a code the person expects to be applied.
            throw new BillingException(422, "PROMO_INVALID", "That promo code isn't valid");
        }
        if (!ctx.anonymous) {
            ctx.user = personalUser(login);
            ctx.sub = subscriptions.findOneByUserId(ctx.user.getId()).orElse(null);
        }
        ctx.currency = settings.getString(BillingSettingKeys.DEFAULT_CURRENCY);
        if (KIND_CHANGE.equals(ctx.kind)) {
            resolveChange(ctx, req);
        } else {
            resolveCheckout(ctx, req);
        }
        ctx.confirmed.addAll(req.confirmedCommercialDeps());
        for (QuoteRequest.AddonRequest a : req.addons()) {
            if (a == null || a.featureKey() == null || a.featureKey().isBlank()) {
                throw new BillingException(400, "INVALID_ADDON", "Every add-on names a featureKey");
            }
            int qty = a.quantity() == null ? 1 : a.quantity();
            if (qty < 0) throw new BillingException(400, "INVALID_ADDON", "An add-on quantity cannot be negative");
            ctx.addons.merge(a.featureKey().trim(), qty, Integer::sum);
        }
        ctx.addons.values().removeIf(q -> q == 0);
        return ctx;
    }

    private void resolveCheckout(Ctx ctx, QuoteRequest req) {
        if (req.planKey() == null || req.planKey().isBlank()) {
            throw new BillingException(422, "PLAN_NOT_SELLABLE", "Choose a plan", Map.of("planKey", ""));
        }
        Plan plan = plans.findByPlanKey(req.planKey().trim().toUpperCase(Locale.ROOT)).orElseThrow(() -> notSellable(req.planKey()));
        if ("SUNSET".equals(plan.getStatus()) || "RETIRED".equals(plan.getStatus())) {
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("successor", plan.getSuccessorPlanId() == null ? null : plans.findById(plan.getSuccessorPlanId()).map(Plan::getPlanKey).orElse(null));
            throw new BillingException(410, "PLAN_SUNSET", "This plan is no longer sold", extra);
        }
        if (!"INDIVIDUAL".equals(plan.getAudience()) || !"PUBLISHED".equals(plan.getStatus()) || !Boolean.TRUE.equals(plan.getPublicPlan())) {
            throw notSellable(plan.getPlanKey());
        }
        PlanVersion version = versions.findLive(plan.getId()).orElseThrow(() -> notSellable(plan.getPlanKey()));
        if (version.getEffectiveFrom() != null && version.getEffectiveFrom().isAfter(ctx.now)) throw notSellable(plan.getPlanKey());
        if (version.getBaseProductId() == null) throw notSellable(plan.getPlanKey());
        if (ctx.sub != null && EntitlementService.isProFor(ctx.sub.getStatus(), ctx.sub.getCurrentPeriodEnd(), ctx.now)) {
            throw new BillingException(409, BillingException.CODE_ALREADY_SUBSCRIBED, "You're already subscribed");
        }
        ctx.plan = plan;
        ctx.version = version;
        List<String> offered = intervalsOf(version);
        BillingInterval interval = req.interval() == null || req.interval().isBlank() ? parseInterval(offered.isEmpty() ? null : offered.get(0)) : parseInterval(req.interval());
        if (interval == null || !offered.contains(interval.name())) {
            throw new BillingException(422, "INTERVAL_NOT_AVAILABLE", "That billing interval isn't offered for this plan", Map.of("interval", String.valueOf(req.interval())));
        }
        ctx.interval = interval;
    }

    private void resolveChange(Ctx ctx, QuoteRequest req) {
        Subscription sub = ctx.sub;
        if (sub == null || sub.getPlanVersionId() == null || !EntitlementService.isProFor(sub.getStatus(), sub.getCurrentPeriodEnd(), ctx.now)) {
            throw new BillingException(409, "NO_SUBSCRIPTION", "There is no active subscription to change");
        }
        PlanVersion version = versions.findById(sub.getPlanVersionId()).orElseThrow(() -> new BillingException(409, "NO_SUBSCRIPTION", "There is no active subscription to change"));
        Plan plan = plans.findById(version.getPlanId()).orElseThrow(() -> new BillingException(409, "NO_SUBSCRIPTION", "There is no active subscription to change"));
        BillingInterval interval = parseInterval(sub.getBillingInterval());
        if (interval == null || sub.getCurrentPeriodEnd() == null || version.getBaseProductId() == null) {
            throw new BillingException(409, "NO_SUBSCRIPTION", "This subscription cannot be changed online yet");
        }
        if (sub.getScheduledAt() != null && sub.getScheduledPlanVersionId() != null) {
            throw new BillingException(409, "SWITCH_PENDING", "A plan change is already scheduled. Undo it first, or wait until it takes effect.");
        }
        if (sub.isCancelAtPeriodEnd()) {
            // a cancellation wins over any change; the confirm step says CANCEL_PENDING too, this just fails early for a switch
            if (req.planKey() != null && !req.planKey().isBlank() || req.interval() != null && !req.interval().isBlank()) {
                throw new BillingException(409, "CANCEL_PENDING", "Resume your subscription before changing it");
            }
        }
        ctx.plan = plan;
        ctx.version = version;
        ctx.interval = interval;
        if (sub.getCurrency() != null && !sub.getCurrency().isBlank()) ctx.currency = sub.getCurrency();

        boolean planChanges = req.planKey() != null && !req.planKey().isBlank() && !req.planKey().trim().equalsIgnoreCase(plan.getPlanKey());
        BillingInterval target = interval;
        if (req.interval() != null && !req.interval().isBlank()) {
            target = parseInterval(req.interval());
            if (target == null) throw new BillingException(422, "INTERVAL_NOT_AVAILABLE", "That billing interval isn't offered", Map.of("interval", req.interval()));
        }
        if (!planChanges && target == interval) return; // an add-on change
        // K5.6: a plan and/or interval switch. The target is priced and offered like a checkout; the rules of timing live in SwitchRules.
        ctx.switching = true;
        ctx.planChanges = planChanges;
        ctx.fromPlan = plan;
        ctx.fromVersion = version;
        ctx.fromInterval = interval;
        Plan targetPlan = plan;
        PlanVersion targetVersion = version;
        if (planChanges) {
            targetPlan = plans.findByPlanKey(req.planKey().trim().toUpperCase(Locale.ROOT)).orElseThrow(() -> notSellable(req.planKey()));
            if ("SUNSET".equals(targetPlan.getStatus()) || "RETIRED".equals(targetPlan.getStatus())) {
                Map<String, Object> extra = new LinkedHashMap<>();
                extra.put("successor", targetPlan.getSuccessorPlanId() == null ? null : plans.findById(targetPlan.getSuccessorPlanId()).map(Plan::getPlanKey).orElse(null));
                throw new BillingException(410, "PLAN_SUNSET", "This plan is no longer sold", extra);
            }
            if (!"INDIVIDUAL".equals(targetPlan.getAudience()) || !"PUBLISHED".equals(targetPlan.getStatus()) || !Boolean.TRUE.equals(targetPlan.getPublicPlan())) {
                throw notSellable(targetPlan.getPlanKey());
            }
            Plan tp = targetPlan;
            targetVersion = versions.findLive(tp.getId()).orElseThrow(() -> notSellable(tp.getPlanKey()));
            if (targetVersion.getEffectiveFrom() != null && targetVersion.getEffectiveFrom().isAfter(ctx.now)) throw notSellable(targetPlan.getPlanKey());
            if (targetVersion.getBaseProductId() == null) throw notSellable(targetPlan.getPlanKey());
        }
        if (!intervalsOf(targetVersion).contains(target.name())) {
            throw new BillingException(422, "INTERVAL_NOT_AVAILABLE", "That billing interval isn't offered for this plan", Map.of("interval", target.name()));
        }
        SwitchRules.requireAllowed(interval, target, catalogSettings.annualEnabled(), settings.getString(BillingSettingKeys.ANNUAL_SWITCH_TO_MONTHLY));
        ctx.plan = targetPlan;
        ctx.version = targetVersion;
        ctx.interval = target;
    }

    /** Rebuild the context of a stored quote: the same plan version, interval, add-on target and confirmations. */
    private Ctx fromStored(SubscriptionQuote q, Stored stored, User user) {
        Ctx ctx = new Ctx();
        ctx.user = user;
        ctx.anonymous = q.getUserId() == null;
        ctx.kind = KIND_ANONYMOUS.equals(q.getKind()) ? KIND_CHECKOUT : q.getKind();
        ctx.version = versions.findById(q.getPlanVersionId()).orElseThrow(() -> new BillingException(409, "QUOTE_STALE", "stale", Map.of("reason", "PLAN_CHANGED")));
        ctx.plan = plans.findById(ctx.version.getPlanId()).orElseThrow(() -> new BillingException(409, "QUOTE_STALE", "stale", Map.of("reason", "PLAN_CHANGED")));
        ctx.interval = BillingInterval.valueOf(q.getBillingInterval());
        ctx.currency = q.getCurrency();
        ctx.addons = new LinkedHashMap<>(stored.meta().addons());
        ctx.confirmed = new LinkedHashSet<>(stored.meta().confirmedDeps());
        if (user != null) ctx.sub = subscriptions.findOneByUserId(user.getId()).orElse(null);
        if (KIND_CHECKOUT.equals(ctx.kind)) {
            // A checkout is stale when the plan moved on (a newer live version) or the person has since subscribed.
            Optional<PlanVersion> live = versions.findLive(ctx.plan.getId());
            if (live.isEmpty() || !live.get().getId().equals(ctx.version.getId())) {
                throw new BillingException(409, "PLAN_SUNSET", "plan changed");
            }
            if (ctx.sub != null && EntitlementService.isProFor(ctx.sub.getStatus(), ctx.sub.getCurrentPeriodEnd(), ctx.now)) {
                throw new BillingException(409, BillingException.CODE_ALREADY_SUBSCRIBED, "You're already subscribed");
            }
        } else if (stored.meta().switchKind() != null) {
            Meta m = stored.meta();
            if (ctx.sub == null || m.fromVersionId() == null || !m.fromVersionId().equals(ctx.sub.getPlanVersionId())) {
                throw new BillingException(409, "NO_SUBSCRIPTION", "subscription changed");
            }
            if (ctx.sub.getScheduledAt() != null && ctx.sub.getScheduledPlanVersionId() != null) {
                throw new BillingException(409, "SWITCH_PENDING", "subscription changed");
            }
            ctx.switching = true;
            ctx.fromVersion = versions.findById(m.fromVersionId()).orElseThrow(() -> new BillingException(409, "NO_SUBSCRIPTION", "subscription changed"));
            ctx.fromPlan = plans.findById(ctx.fromVersion.getPlanId()).orElseThrow(() -> new BillingException(409, "NO_SUBSCRIPTION", "subscription changed"));
            ctx.fromInterval = parseInterval(m.fromInterval());
            if (ctx.fromInterval == null || !ctx.fromInterval.name().equals(ctx.sub.getBillingInterval())) throw new BillingException(409, "NO_SUBSCRIPTION", "subscription changed");
            ctx.planChanges = !ctx.fromPlan.getId().equals(ctx.plan.getId());
            Optional<PlanVersion> live = versions.findLive(ctx.plan.getId());
            if (live.isEmpty() || !live.get().getId().equals(ctx.version.getId())) throw new BillingException(409, "PLAN_SUNSET", "plan changed");
        } else if (ctx.sub == null || !ctx.version.getId().equals(ctx.sub.getPlanVersionId())) {
            throw new BillingException(409, "NO_SUBSCRIPTION", "subscription changed");
        }
        return ctx;
    }

    // ---- build -----------------------------------------------------------------------------------------------------------------------

    private record Built(PlanQuoteDTO dto, String hash, Meta meta, Instant periodEnd) {}

    private Built build(Ctx ctx) {
        CatalogPort port = catalog.getIfAvailable();
        if (port == null) throw new BillingException(503, "CATALOG_UNAVAILABLE", "Prices are not available right now");
        PricingEngine engine = new PricingEngine(port);

        List<PlanComponent> comps = components.findByPlanVersionIdOrderBySortOrderAscIdAsc(ctx.version.getId());
        Map<String, PlanComponent> byFeature = comps.stream().collect(Collectors.toMap(PlanComponent::getFeatureKey, Function.identity(), (a, b) -> a, LinkedHashMap::new));
        Map<String, FeatureDefinition> defs = new LinkedHashMap<>();
        for (FeatureDefinition d : features.findAllByOrderBySortOrderAsc()) defs.put(d.getFeatureKey(), d);
        Product baseProduct = products.findById(ctx.version.getBaseProductId()).orElseThrow(() -> notSellable(ctx.plan.getPlanKey()));

        // Add-ons must be OPTIONAL components with a product.
        for (String key : ctx.addons.keySet()) {
            PlanComponent c = byFeature.get(key);
            if (c == null || !"OPTIONAL".equals(c.getRole()) || c.getProductId() == null) {
                throw new BillingException(422, "ADDON_NOT_IN_PLAN", "That add-on isn't part of this plan", Map.of("featureKey", key));
            }
        }

        // Dependencies: free technical ones are added, paid technical ones refused, commercial ones need the person's confirmation.
        DependencyRules.Outcome outcome = resolveDependencies(ctx, byFeature, port, defs, engineInputsAt(ctx));
        Map<String, Integer> finalAddons = new LinkedHashMap<>(ctx.addons);
        for (String auto : outcome.autoAdded()) addIfOptional(finalAddons, byFeature, auto);
        for (String conf : ctx.confirmed) if (outcome.finalFeatures().contains(conf)) addIfOptional(finalAddons, byFeature, conf);

        int maxTotal = settings.getInt(BillingSettingKeys.ADDON_MAX_TOTAL_QUANTITY);
        int total = finalAddons.values().stream().mapToInt(Integer::intValue).sum();
        if (total > maxTotal) throw new BillingException(422, "QUANTITY_LIMIT", "You can add at most " + maxTotal + " add-on units", Map.of("max", maxTotal));

        List<LineRequest> proposedLines = new ArrayList<>();
        proposedLines.add(new LineRequest(BASE_LINE, baseProduct.getCode(), 1, 0));
        for (Map.Entry<String, Integer> a : finalAddons.entrySet()) {
            proposedLines.add(addonLine(a.getKey(), a.getValue(), byFeature, defs));
        }

        IntervalPolicy policy = policy(KIND_CHANGE.equals(ctx.kind));
        PricingInputs proposedInputs = new PricingInputs(
            Audience.INDIVIDUAL, ctx.currency, ctx.interval, ctx.now, List.of(new LineGroup(PricingInputs.PLAN_GROUP, proposedLines)), null, null, null, 0, policy
        );
        PricingResult proposed;
        IntervalSummary summary;
        try {
            proposed = engine.price(proposedInputs);
            summary = engine.summarize(proposedInputs);
        } catch (PricingException e) {
            throw translate(e);
        }

        PricingResult current = null;
        ChangeImpact impact = null;
        Map<String, Integer> currentQty = new LinkedHashMap<>();
        Instant periodEnd = null;
        long baseProration = 0;
        List<PersonalBasket.Held> held = List.of();
        if (KIND_CHANGE.equals(ctx.kind)) {
            held = basket.held(ctx.sub.getId(), ctx.now);
            for (PersonalBasket.Held h : held) currentQty.put(h.featureKey(), h.effectiveQuantity());
            currentQty.values().removeIf(q -> q <= 0);
            for (PersonalBasket.Held h : held) {
                int want = finalAddons.getOrDefault(h.featureKey(), 0);
                if (!ctx.switching && h.hasScheduledChange() && want != h.effectiveQuantity()) {
                    throw new BillingException(409, "REMOVAL_PENDING", "Undo the scheduled change to this add-on first", Map.of("featureKey", h.featureKey()));
                }
            }
            // K5.6: what the subscriber holds today is priced with TODAY's plan version and interval; on a switch those differ from the target's
            BillingInterval fromInterval = ctx.switching ? ctx.fromInterval : ctx.interval;
            Map<String, PlanComponent> fromByFeature = byFeature;
            Product fromBase = baseProduct;
            if (ctx.switching) {
                fromByFeature = components.findByPlanVersionIdOrderBySortOrderAscIdAsc(ctx.fromVersion.getId()).stream().collect(Collectors.toMap(PlanComponent::getFeatureKey, Function.identity(), (a, b) -> a, LinkedHashMap::new));
                Plan fp = ctx.fromPlan;
                fromBase = products.findById(ctx.fromVersion.getBaseProductId()).orElseThrow(() -> notSellable(fp.getPlanKey()));
            }
            List<LineRequest> currentLines = new ArrayList<>();
            currentLines.add(new LineRequest(BASE_LINE, fromBase.getCode(), 1, 0));
            for (Map.Entry<String, Integer> a : currentQty.entrySet()) {
                if (!fromByFeature.containsKey(a.getKey())) throw new BillingException(409, "SUBSCRIPTION_CHANGED", "Your add-ons changed. Review the new numbers.");
                currentLines.add(addonLine(a.getKey(), a.getValue(), fromByFeature, defs));
            }
            try {
                current = engine.price(
                    new PricingInputs(Audience.INDIVIDUAL, ctx.currency, fromInterval, ctx.now, List.of(new LineGroup(PricingInputs.PLAN_GROUP, currentLines)), null, null, null, 0, policy)
                );
                periodEnd = ctx.sub.getCurrentPeriodEnd();
                Instant periodStart = ctx.sub.getCurrentPeriodStart() != null ? ctx.sub.getCurrentPeriodStart() : minusInterval(periodEnd, fromInterval);
                if (ctx.switching) {
                    long fromUnit = unitOf(current);
                    long toUnit = unitOf(proposed);
                    ctx.switchKind = SwitchRules.classify(ctx.planChanges, fromInterval, ctx.interval, fromUnit, toUnit);
                    if (ctx.switchKind.immediate()) {
                        // an upgrade now: add-ons that are new are prorated by the engine, the base by the switch rule (the same unit: the current period or term)
                        impact = engine.impact(current, proposed, periodStart, periodEnd, ctx.now);
                        baseProration = SwitchRules.upgradeProration(settings.getString(BillingSettingKeys.UPGRADE_PRORATION), toUnit, fromUnit, periodStart, periodEnd, ctx.now);
                    }
                } else {
                    impact = engine.impact(current, proposed, periodStart, periodEnd, ctx.now);
                }
            } catch (PricingException e) {
                throw translate(e);
            }
            if (!ctx.switching && finalAddons.equals(currentQty)) throw new BillingException(422, "NO_CHANGE", "Nothing would change");
        }

        PlanQuoteDTO dto = dto(ctx, comps, byFeature, defs, baseProduct, proposed, summary, current, impact, finalAddons, currentQty, outcome, periodEnd, baseProration);
        Meta meta = meta(ctx, finalAddons, currentQty, proposed, current, periodEnd);
        return new Built(dto, hash(meta), meta, periodEnd);
    }

    private static long unitOf(PricingResult r) {
        return r.group(PricingInputs.PLAN_GROUP).lines().stream().filter(l -> BASE_LINE.equals(l.lineKey())).mapToLong(LineResult::unitEffectiveMinor).findFirst().orElse(0);
    }

    private Instant engineInputsAt(Ctx ctx) {
        return ctx.now;
    }

    private void addIfOptional(Map<String, Integer> addons, Map<String, PlanComponent> byFeature, String featureKey) {
        PlanComponent c = byFeature.get(featureKey);
        if (c != null && "OPTIONAL".equals(c.getRole()) && c.getProductId() != null) addons.putIfAbsent(featureKey, 1);
    }

    private LineRequest addonLine(String featureKey, int qty, Map<String, PlanComponent> byFeature, Map<String, FeatureDefinition> defs) {
        PlanComponent c = byFeature.get(featureKey);
        Product p = products.findById(c.getProductId()).orElseThrow(() -> new BillingException(422, "ADDON_NOT_IN_PLAN", "That add-on isn't part of this plan", Map.of("featureKey", featureKey)));
        int max = c.getMaxQuantity() != null && c.getMaxQuantity() > 0 ? c.getMaxQuantity() : 0;
        FeatureDefinition d = defs.get(featureKey);
        if (max == 0 && d != null && d.getMaxQuantity() != null && d.getMaxQuantity() > 0) max = d.getMaxQuantity();
        return new LineRequest(featureKey, p.getCode(), qty, max);
    }

    private DependencyRules.Outcome resolveDependencies(Ctx ctx, Map<String, PlanComponent> byFeature, CatalogPort port, Map<String, FeatureDefinition> defs, Instant at) {
        Set<String> features = new LinkedHashSet<>();
        for (PlanComponent c : byFeature.values()) if ("BASE".equals(c.getRole()) || "INCLUDED".equals(c.getRole())) features.add(c.getFeatureKey());
        features.addAll(ctx.addons.keySet());
        features.addAll(ctx.confirmed.stream().filter(byFeature::containsKey).toList());
        List<DependencyRules.Dependency> graph = new ArrayList<>();
        if (!features.isEmpty()) {
            for (Map<String, Object> row : jdbc.queryForList("SELECT feature_key, requires_feature_key, kind FROM feature_dependency WHERE active = TRUE")) {
                String feature = (String) row.get("feature_key");
                String requires = (String) row.get("requires_feature_key");
                String kind = (String) row.get("kind");
                if (!"TECHNICAL".equals(kind) && !"COMMERCIAL".equals(kind)) continue;
                if (requires.startsWith("any:")) continue;
                boolean planHasIt = byFeature.containsKey(requires);
                if (!planHasIt && !features.contains(requires)) continue; // a service this plan does not offer: the dependency does not apply (B-03)
                PlanComponent rc = byFeature.get(requires);
                boolean optional = rc != null && "OPTIONAL".equals(rc.getRole()) && rc.getProductId() != null;
                long price = optional ? priceOf(rc, ctx, port, at) : 0;
                FeatureDefinition d = defs.get(requires);
                graph.add(new DependencyRules.Dependency(feature, requires, "COMMERCIAL".equals(kind) ? DependencyRules.Kind.COMMERCIAL : DependencyRules.Kind.TECHNICAL, optional && price > 0, price, d == null ? requires : d.getName()));
            }
        }
        try {
            return DependencyRules.resolve(features, graph, false, ctx.confirmed);
        } catch (PricingException e) {
            throw translate(e);
        }
    }

    private long priceOf(PlanComponent c, Ctx ctx, CatalogPort port, Instant at) {
        Product p = products.findById(c.getProductId()).orElse(null);
        if (p == null) return 0;
        return port.activePrice(p.getCode(), Audience.INDIVIDUAL, ctx.interval, ctx.currency, at).map(PriceRow::amountMinor).orElse(0L);
    }

    private PlanQuoteDTO dto(
        Ctx ctx,
        List<PlanComponent> comps,
        Map<String, PlanComponent> byFeature,
        Map<String, FeatureDefinition> defs,
        Product baseProduct,
        PricingResult proposed,
        IntervalSummary summary,
        PricingResult current,
        ChangeImpact impact,
        Map<String, Integer> finalAddons,
        Map<String, Integer> currentQty,
        DependencyRules.Outcome outcome,
        Instant periodEnd,
        long baseProration
    ) {
        Basket proposedBasket = new Basket(
            lines(proposed, ctx, defs),
            proposed.recurringMinor(),
            summary.monthlyEquivalentMinor(),
            summary.savingsMinor(),
            summary.savingsBp()
        );
        Basket currentBasket = current == null ? new Basket(List.of(), 0L, null, null, null) : new Basket(lines(current, ctx, defs), current.recurringMinor(), null, null, null);

        List<Addition> additions = new ArrayList<>();
        List<Removal> removals = new ArrayList<>();
        long proration = 0;
        if (current != null) {
            proration = (impact == null ? 0 : impact.prorationTotalMinor()) + baseProration;
            Map<String, ChangeImpact.ProrationLine> prorationByFeature = impact == null
                ? Map.of()
                : impact.prorationLines().stream().collect(Collectors.toMap(ChangeImpact.ProrationLine::lineKey, Function.identity(), (a, b) -> a));
            Set<String> keys = new LinkedHashSet<>(currentQty.keySet());
            keys.addAll(finalAddons.keySet());
            for (String key : keys) {
                int from = currentQty.getOrDefault(key, 0);
                int to = finalAddons.getOrDefault(key, 0);
                String name = nameOf(key, defs);
                if (to > from) {
                    ChangeImpact.ProrationLine pl = prorationByFeature.get(key);
                    long unit = proposed.group(PricingInputs.PLAN_GROUP).lines().stream().filter(l -> l.lineKey().equals(key)).mapToLong(LineResult::unitEffectiveMinor).findFirst().orElse(0);
                    additions.add(new Addition(key, name, from, to, unit, pl == null ? 0 : pl.prorationMinor()));
                } else if (to < from) {
                    removals.add(new Removal(key, from, to, periodEnd, "works until " + periodEnd.atZone(ZoneOffset.UTC).toLocalDate() + " · no refund"));
                }
            }
        }
        List<Confirmation> prompts = outcome.requiresConfirmation().stream().map(c -> new Confirmation(c.featureKey(), c.requires(), c.kind().name(), c.priceMinor(), c.name())).toList();
        boolean change = current != null;
        long delta = change ? proposed.recurringMinor() - current.recurringMinor() : proposed.recurringMinor();
        Long nextEstimate = change ? (impact == null ? proposed.recurringMinor() : impact.nextInvoiceEstimateMinor() + baseProration) : proposed.recurringMinor();
        boolean scheduledSwitch = ctx.switchKind != null && !ctx.switchKind.immediate();
        PlanQuoteDTO.IntervalChange intervalChange = ctx.switching && ctx.fromInterval != ctx.interval
            ? new PlanQuoteDTO.IntervalChange(ctx.fromInterval.name(), ctx.interval.name(), periodEnd.toString())
            : null;
        Instant nextAt = change ? periodEnd : ctx.now.atZone(ZoneOffset.UTC).plusMonths(ctx.interval.factor()).toInstant();
        List<String> warnings = new ArrayList<>();
        if (!prompts.isEmpty()) warnings.add("DEPENDENCY_CONFIRMATION_NEEDED");
        return new PlanQuoteDTO(
            null,
            ctx.anonymous ? KIND_ANONYMOUS : ctx.kind,
            STATUS_OPEN,
            null,
            null,
            ctx.currency,
            catalogVersions.currentVersion(),
            new PlanRef(ctx.plan.getPlanKey(), ctx.version.getVersion(), ctx.plan.getName()),
            ctx.interval.name(),
            intervalChange,
            currentBasket,
            proposedBasket,
            delta,
            List.copyOf(additions),
            List.copyOf(removals),
            prompts,
            outcome.autoAdded(),
            proration,
            nextEstimate,
            nextAt,
            scheduledSwitch ? periodEnd.toString() : "now",
            null,
            "NONE",
            PlanQuoteDTO.TAX_NOTE,
            null,
            null,
            List.copyOf(warnings),
            null
        );
    }

    private List<QuoteLine> lines(PricingResult r, Ctx ctx, Map<String, FeatureDefinition> defs) {
        List<QuoteLine> out = new ArrayList<>();
        for (LineResult l : r.group(PricingInputs.PLAN_GROUP).lines()) {
            boolean base = BASE_LINE.equals(l.lineKey());
            out.add(
                new QuoteLine(
                    base ? null : l.lineKey(),
                    base ? "BASE" : "ADDON",
                    base ? ctx.plan.getName() : nameOf(l.lineKey(), defs),
                    l.quantity(),
                    l.unitListMinor(),
                    l.unitEffectiveMinor(),
                    l.lineTotalMinor(),
                    l.productCode(),
                    l.priceId()
                )
            );
        }
        return List.copyOf(out);
    }

    private static String nameOf(String featureKey, Map<String, FeatureDefinition> defs) {
        FeatureDefinition d = defs.get(featureKey);
        return d == null || d.getName() == null ? featureKey : d.getName();
    }

    // ---- hashing ---------------------------------------------------------------------------------------------------------------------

    private Meta meta(Ctx ctx, Map<String, Integer> finalAddons, Map<String, Integer> currentQty, PricingResult proposed, PricingResult current, Instant periodEnd) {
        String state = ctx.storedKind() + "|" + (ctx.sub == null || !KIND_CHANGE.equals(ctx.kind) ? "-" : ctx.sub.getId()) + "|" + (periodEnd == null ? "-" : periodEnd.getEpochSecond()) + "|" + sorted(currentQty)
            + (ctx.switching ? "|sw:" + ctx.fromVersion.getId() + ":" + ctx.fromInterval + ":" + ctx.sub.getPlanVersionId() : "");
        StringBuilder price = new StringBuilder();
        price.append(ctx.version.getId()).append('|').append(ctx.interval).append('|').append(ctx.currency);
        for (LineResult l : sortedLines(proposed)) price.append('|').append(l.lineKey()).append(':').append(l.quantity()).append(':').append(l.priceId()).append(':').append(l.unitEffectiveMinor());
        if (current != null) {
            price.append("|cur");
            for (LineResult l : sortedLines(current)) price.append('|').append(l.lineKey()).append(':').append(l.quantity()).append(':').append(l.priceId()).append(':').append(l.unitEffectiveMinor());
        }
        return new Meta(
            ctx.plan.getPlanKey(),
            ctx.interval.name(),
            new LinkedHashMap<>(finalAddons),
            List.copyOf(ctx.confirmed),
            sha256(state),
            sha256(price.toString()),
            new LinkedHashMap<>(currentQty),
            ctx.switchKind == null ? null : ctx.switchKind.name(),
            ctx.switching ? ctx.fromPlan.getPlanKey() : null,
            ctx.switching ? ctx.fromVersion.getId() : null,
            ctx.switching ? ctx.fromInterval.name() : null
        );
    }

    private static String hash(Meta meta) {
        return sha256(meta.stateHash() + "|" + meta.priceHash());
    }

    private static List<LineResult> sortedLines(PricingResult r) {
        return r.group(PricingInputs.PLAN_GROUP).lines().stream().sorted(Comparator.comparing(LineResult::lineKey)).toList();
    }

    private static String sorted(Map<String, Integer> m) {
        return m.entrySet().stream().sorted(Map.Entry.comparingByKey()).map(e -> e.getKey() + "=" + e.getValue()).collect(Collectors.joining(","));
    }

    static String sha256(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    // ---- helpers ---------------------------------------------------------------------------------------------------------------------

    private IntervalPolicy policy(boolean existingTerm) {
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
        // An existing yearly term runs to its end even after annual is switched off (03 section 5).
        if (existingTerm) individual.add(BillingInterval.YEAR);
        return new IntervalPolicy(individual, org, existingTerm || catalogSettings.annualEnabled());
    }

    private List<String> intervalsOf(PlanVersion v) {
        try {
            return json.readValue(v.getIntervalsJson() == null ? "[]" : v.getIntervalsJson(), new TypeReference<List<String>>() {});
        } catch (JsonProcessingException e) {
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

    private static Instant minusInterval(Instant end, BillingInterval interval) {
        return end.atZone(ZoneOffset.UTC).minusMonths(interval.factor()).toInstant();
    }

    private User personalUser(String login) {
        if (login == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user");
        User user = users.findOneByLogin(login).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        return router.requirePersonal(user);
    }

    private void expireIfDue(SubscriptionQuote q) {
        if (STATUS_OPEN.equals(q.getStatus()) && q.getExpiresAt().isBefore(Instant.now())) {
            q.setStatus(STATUS_EXPIRED);
            quotes.save(q);
        }
    }

    private PlanQuoteDTO present(SubscriptionQuote q, Stored stored) {
        PlanQuoteDTO d = stored.dto();
        return new PlanQuoteDTO(
            q.getId(),
            d.kind(),
            q.getStatus(),
            q.getCreatedAt(),
            q.getExpiresAt(),
            d.currency(),
            d.catalogVersion(),
            d.plan(),
            d.interval(),
            d.intervalChange(),
            d.current(),
            d.proposed(),
            d.deltaMinor(),
            d.additions(),
            d.removals(),
            d.requiresConfirmation(),
            d.autoAdded(),
            d.prorationEstimateMinor(),
            d.nextInvoiceEstimateMinor(),
            d.nextInvoiceAt(),
            d.effectiveAt(),
            d.taxEstimateMinor(),
            d.taxSource(),
            d.taxNote(),
            d.aiBudgetPct(),
            d.promo(),
            d.warnings(),
            q.getInputsHash()
        );
    }

    private Stored parse(SubscriptionQuote q) {
        try {
            return json.readValue(q.getLinesJson(), Stored.class);
        } catch (JsonProcessingException e) {
            LOG.error("Quote {} has unreadable lines_json", q.getId(), e);
            throw new BillingException(500, "QUOTE_UNREADABLE", "This quote can't be read. Get a new one.");
        }
    }

    private String write(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    static BillingException translate(PricingException e) {
        String code = e.code();
        if ("INTERVAL_NOT_ALLOWED".equals(code)) code = "INTERVAL_NOT_AVAILABLE";
        String message = e.getMessage();
        int idx = message == null ? -1 : message.indexOf(": ");
        if (idx >= 0) message = message.substring(idx + 2);
        return new BillingException(422, code, message, new LinkedHashMap<>(e.details()));
    }

    private static BillingException notSellable(String planKey) {
        return new BillingException(422, "PLAN_NOT_SELLABLE", "That plan isn't available to buy", Map.of("planKey", String.valueOf(planKey)));
    }

    private static BillingException notFound() {
        return new BillingException(404, "NOT_FOUND", "Not found");
    }

    private static BillingException stale(String reason) {
        return new BillingException(409, "QUOTE_STALE", "Prices or your subscription changed since this quote. Review the new numbers.", Map.of("reason", reason));
    }
}
