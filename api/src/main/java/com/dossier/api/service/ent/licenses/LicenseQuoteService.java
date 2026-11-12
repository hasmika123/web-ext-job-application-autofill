package com.dossier.api.service.ent.licenses;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.billing.LicenseQuote;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.ent.billing.LicenseQuoteRepository;
import com.dossier.api.service.ent.consultants.ConsultantAccess;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.pricing.PricingEngine;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Licence changes priced before they happen (docs/enterprise-v2/ORG-BILLING-BUILD.md step 1b, ADR-019): the Licenses page asks for a quote of "this
 * consultant with exactly these add-ons", shows what it costs, and confirms it. Nothing is billed yet: the quote is the price the organization WILL pay once
 * billing is connected, and confirming changes the licence through the {@link LicenseChangeApplier} (local until Stripe).
 *
 * <ul>
 *   <li>Prices: contract, else catalog, else "not set" ({@link OrgLicenseService#prices}); the web only shows what this answers and never adds money.
 *   <li>Additions start now; with a billing period, the rest of the period is prorated ({@link PricingEngine#prorate}). Removals take effect at the end of
 *       the billing period when there is one (C9), at once otherwise. Re-adding an add-on whose removal is pending keeps it (no charge).
 *   <li>A quote lives {@code enterprise.quote.ttl_minutes} (15). Confirming re-prices the same request: 410 {@code QUOTE_EXPIRED} after that, 409
 *       {@code QUOTE_STALE} when the licence, a price or the period moved since, 409 {@code QUOTE_USED} the second time.
 * </ul>
 *
 * <p>Permissions: {@code licenses.manage} (ORG scope) for everything; anything else is the generic 404.
 */
@Service
@Transactional
public class LicenseQuoteService {

    public static final int MAX_FEATURES = 50;

    /** One line of a quote. {@code op}: CREATE (the base licence), ADD_FEATURE, REMOVE_FEATURE or KEEP_FEATURE (cancel a pending removal). */
    public record Line(String op, String featureKey, String name, Long monthlyMinor, Long dueNowMinor, Instant effectiveAt) {}

    /**
     * The quote's money: the monthly recurring before and after, their difference, and what the rest of this billing period costs now (null without a
     * billing period). Every amount is null when a price is not set ({@code priceSet} false). {@code periodLastDay}: the last day of the billing period.
     */
    public record Totals(Long currentMonthlyMinor, Long proposedMonthlyMinor, Long deltaMinor, Long dueNowMinor, boolean priceSet, LocalDate periodLastDay) {}

    public record Quote(
        Long id,
        Long consultantId,
        String consultantName,
        String status,
        String currency,
        List<Line> lines,
        Totals totals,
        boolean billingConnected,
        Instant expiresAt
    ) {}

    /** The request a quote prices: the consultant and the exact add-ons their licence should carry afterwards. */
    public record Request(Long consultantId, List<String> features) {
        Set<String> keys() {
            return features == null ? Set.of() : new LinkedHashSet<>(features);
        }
    }

    private record Plan(boolean hasLicence, ConsultantProfile consultant, String currency, List<Line> lines, Totals totals, String hash) {}

    private record Stored(List<String> features) {}

    private final OrgLicenseService licenses;
    private final LicenseChangeApplier applier;
    private final LicenseQuoteRepository quotes;
    private final ConsultantAccess access;
    private final SettingsService settings;
    private final ObjectMapper json;
    private Clock clock = Clock.systemUTC();

    public LicenseQuoteService(
        OrgLicenseService licenses,
        LicenseChangeApplier applier,
        LicenseQuoteRepository quotes,
        ConsultantAccess access,
        SettingsService settings,
        ObjectMapper json
    ) {
        this.licenses = licenses;
        this.applier = applier;
        this.quotes = quotes;
        this.access = access;
        this.settings = settings;
        this.json = json;
    }

    /** Tests pin the time (the licence service keeps its own clock). */
    void setClock(Clock clock) {
        this.clock = clock;
    }

    private Instant now() {
        return Instant.now(clock).truncatedTo(ChronoUnit.MICROS);
    }

    /** Price a change and keep the quote for {@code enterprise.quote.ttl_minutes}. 422 {@code NO_CHANGE} when the licence already is what is asked. */
    public Quote quote(OrgMembership me, Request request) {
        licenses.write(me);
        if (request == null || request.consultantId() == null) throw new OrgNotFoundException();
        Set<String> target = target(request);
        Instant now = now();
        Plan plan = plan(me.orgId(), request.consultantId(), target, now);
        if (plan.lines().isEmpty()) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "NO_CHANGE: Nothing changes. Turn an add-on on or off first.");
        LicenseQuote q = new LicenseQuote();
        q.setOrgId(me.orgId());
        q.setConsultantId(plan.consultant().getId());
        q.setStatus("OPEN");
        q.setRequestJson(write(new Stored(OrgLicenseService.ordered(target))));
        q.setLinesJson(write(plan.lines()));
        q.setTotalsJson(write(plan.totals()));
        q.setInputsHash(plan.hash());
        q.setCurrency(plan.currency());
        q.setCreatedByMemberId(me.memberId());
        q.setCreatedAt(now);
        q.setExpiresAt(now.plus(Duration.ofMinutes(Math.max(1, settings.getInt(EnterpriseSettingKeys.QUOTE_TTL_MINUTES)))));
        q = quotes.saveAndFlush(q);
        return dto(q, plan.consultant(), now);
    }

    /** One quote as it was priced, with its status (OPEN, CONFIRMED, or EXPIRED once its time has passed). */
    @Transactional(readOnly = true)
    public Quote get(OrgMembership me, Long quoteId) {
        access.require(me, OrgLicenseService.MANAGE);
        LicenseQuote q = find(me, quoteId);
        return dto(q, licenses.consultant(me.orgId(), q.getConsultantId()), now());
    }

    /** Carry out a quote: re-price it, refuse it when expired, used or stale, then change the licence through the applier. */
    public OrgLicenseService.Detail confirm(OrgMembership me, Long quoteId) {
        licenses.write(me);
        LicenseQuote q = find(me, quoteId);
        Instant now = now();
        if ("CONFIRMED".equals(q.getStatus())) throw OrgLicenseService.conflict("QUOTE_USED", "This change was already confirmed. Reload to see the licence.");
        if (!now.isBefore(q.getExpiresAt())) throw new ResponseStatusException(HttpStatus.GONE, "QUOTE_EXPIRED: This price is no longer valid. Review the change again.");
        Set<String> target = new LinkedHashSet<>(read(q.getRequestJson(), Stored.class).features());
        Plan plan = plan(me.orgId(), q.getConsultantId(), target, now);
        if (!plan.hash().equals(q.getInputsHash())) throw OrgLicenseService.conflict("QUOTE_STALE", "The licence or a price changed since this quote. Review the change again.");
        OrgLicenseService.Detail done = applier.apply(me, q.getConsultantId(), plan.hasLicence(), target, q.getId());
        q.setStatus("CONFIRMED");
        q.setConfirmedAt(now);
        quotes.save(q);
        return done;
    }

    /**
     * The direct routes (give a licence, set its add-ons) priced and confirmed in one step, so every add-on change goes through a quote and the applier.
     * {@code expectLicence}: true for "set add-ons" (409 {@code NO_LICENSE} without one), false for "give" (409 {@code ALREADY_LICENSED} with one). A
     * request that changes nothing writes nothing and answers the licence as it is.
     */
    public OrgLicenseService.Detail applyNow(OrgMembership me, Long consultantId, Set<String> features, boolean expectLicence) {
        licenses.write(me);
        ConsultantProfile c = licenses.consultant(me.orgId(), consultantId);
        boolean has = licenses.current(me.orgId(), c.getId()).filter(l -> !"ENDED".equals(l.getStatus())).isPresent();
        if (expectLicence && !has) throw OrgLicenseService.conflict("NO_LICENSE", "This consultant has no licence.");
        if (!expectLicence && has) throw OrgLicenseService.conflict("ALREADY_LICENSED", "This consultant already has a licence.");
        Instant now = now();
        Plan plan = plan(me.orgId(), c.getId(), target(new Request(c.getId(), List.copyOf(features))), now);
        if (plan.lines().isEmpty()) return licenses.get(me, c.getId());
        Quote q = quote(me, new Request(c.getId(), List.copyOf(features)));
        return confirm(me, q.id());
    }

    // ------------------------------------------------------------------------------------------ pricing

    private Plan plan(Long orgId, Long consultantId, Set<String> target, Instant now) {
        ConsultantProfile c = licenses.consultant(orgId, consultantId);
        Map<String, Product> addOns = licenses.addOnProducts();
        OrgLicenseService.requireKnown(target, addOns);
        OrgLicenseService.Prices prices = licenses.prices(orgId);
        Optional<OrgLicenseService.Period> period = licenses.period(orgId, now);
        Optional<ConsultantLicense> current = licenses.current(orgId, c.getId()).filter(l -> !"ENDED".equals(l.getStatus()));
        StringBuilder h = new StringBuilder().append(orgId).append('|').append(c.getId()).append('|').append(prices.currency()).append('|')
            .append(period.map(p -> p.start() + ".." + p.end()).orElse("no-period")).append('|').append(String.join(",", OrgLicenseService.ordered(target)));
        List<Line> lines = new ArrayList<>();
        boolean known = true;
        long currentMonthly = 0;
        long proposed = 0;
        long dueNow = 0;
        if (current.isEmpty()) {
            Product base = licenses.baseProduct();
            Long unit = prices.of(base.getId());
            known = unit != null;
            proposed += OrgLicenseService.nz(unit);
            dueNow += due(unit, period, now);
            lines.add(new Line("CREATE", null, "Base licence", unit, period.isPresent() ? due(unit, period, now) : null, now));
            h.append("|new");
            for (String key : OrgLicenseService.ordered(target)) {
                Product p = addOns.get(key);
                Long u = prices.of(p.getId());
                known = known && u != null;
                proposed += OrgLicenseService.nz(u);
                dueNow += due(u, period, now);
                lines.add(new Line("ADD_FEATURE", key, p.getName(), u, period.isPresent() ? due(u, period, now) : null, now));
                h.append("|+").append(key).append(':').append(u);
            }
        } else {
            ConsultantLicense l = current.get();
            Map<String, LicenseFeature> live = licenses.liveFeatures(l, now);
            long base = OrgLicenseService.nz(l.getBaseAmountMinor());
            boolean licencePriced = l.getContractPriceId() != null || base > 0;
            currentMonthly = base;
            proposed = base;
            h.append("|licence:").append(l.getId()).append(':').append(l.getStatus()).append(':').append(base);
            for (LicenseFeature f : live.values()) {
                long amount = OrgLicenseService.nz(f.getUnitAmountMinor()) * OrgLicenseService.qty(f);
                currentMonthly += amount;
                licencePriced = licencePriced || f.getContractPriceId() != null || amount > 0;
                h.append("|has:").append(f.getFeatureKey()).append(':').append(amount).append(':').append(f.getEndsAt());
            }
            known = licencePriced;
            for (String key : OrgLicenseService.ordered(target)) {
                LicenseFeature f = live.get(key);
                if (f == null) {
                    Product p = addOns.get(key);
                    Long u = prices.of(p.getId());
                    known = known && u != null;
                    proposed += OrgLicenseService.nz(u);
                    dueNow += due(u, period, now);
                    lines.add(new Line("ADD_FEATURE", key, p.getName(), u, period.isPresent() ? due(u, period, now) : null, now));
                    h.append("|+").append(key).append(':').append(u);
                } else {
                    long amount = OrgLicenseService.nz(f.getUnitAmountMinor()) * OrgLicenseService.qty(f);
                    proposed += amount;
                    if (f.getEndsAt() != null) {
                        lines.add(new Line("KEEP_FEATURE", key, OrgLicenseService.nameOf(key, addOns), amount, period.isPresent() ? 0L : null, now));
                        h.append("|keep:").append(key);
                    }
                }
            }
            for (LicenseFeature f : live.values()) {
                if (target.contains(f.getFeatureKey()) || f.getEndsAt() != null) continue;
                long amount = OrgLicenseService.nz(f.getUnitAmountMinor()) * OrgLicenseService.qty(f);
                Instant when = period.map(OrgLicenseService.Period::end).orElse(now);
                lines.add(new Line("REMOVE_FEATURE", f.getFeatureKey(), OrgLicenseService.nameOf(f.getFeatureKey(), addOns), amount, period.isPresent() ? 0L : null, when));
                h.append("|-").append(f.getFeatureKey()).append('@').append(period.isPresent() ? "period-end" : "now");
            }
        }
        LocalDate lastDay = period.map(OrgLicenseService.Period::lastDay).orElse(null);
        Totals totals = known
            ? new Totals(currentMonthly, proposed, proposed - currentMonthly, period.isPresent() ? dueNow : null, true, lastDay)
            : new Totals(null, null, null, null, false, lastDay);
        return new Plan(current.isPresent(), c, prices.currency(), lines, totals, sha256(h.toString()));
    }

    private static long due(Long unit, Optional<OrgLicenseService.Period> period, Instant now) {
        if (unit == null || period.isEmpty()) return 0L;
        return PricingEngine.prorate(unit, 1, period.get().start(), period.get().end(), now);
    }

    // ------------------------------------------------------------------------------------------ helpers

    private Set<String> target(Request request) {
        Set<String> keys = request.keys();
        if (keys.size() > MAX_FEATURES) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Too many add-ons in one change.");
        for (String k : keys) if (k == null || k.isBlank()) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Unknown add-on: " + k);
        return keys;
    }

    private LicenseQuote find(OrgMembership me, Long quoteId) {
        if (quoteId == null) throw new OrgNotFoundException();
        return quotes.findByOrgIdAndId(me.orgId(), quoteId).orElseThrow(OrgNotFoundException::new);
    }

    private Quote dto(LicenseQuote q, ConsultantProfile c, Instant now) {
        String status = "OPEN".equals(q.getStatus()) && !now.isBefore(q.getExpiresAt()) ? "EXPIRED" : q.getStatus();
        List<Line> lines = read(q.getLinesJson(), new TypeReference<List<Line>>() {});
        Totals totals = read(q.getTotalsJson(), Totals.class);
        return new Quote(q.getId(), q.getConsultantId(), c.getDisplayName(), status, q.getCurrency(), lines, totals, false, q.getExpiresAt());
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("cannot store a licence quote", e);
        }
    }

    private <T> T read(String text, Class<T> type) {
        try {
            return json.readValue(text, type);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("cannot read a licence quote", e);
        }
    }

    private <T> T read(String text, TypeReference<T> type) {
        try {
            return json.readValue(text, type);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("cannot read a licence quote", e);
        }
    }

    private static String sha256(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
