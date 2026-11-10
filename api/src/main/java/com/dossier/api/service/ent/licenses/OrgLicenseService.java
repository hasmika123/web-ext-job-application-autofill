package com.dossier.api.service.ent.licenses;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.LicenseChange;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.billing.OrgContractPrice;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseChangeRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.billing.OrgContractPriceRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.ent.consultants.ConsultantAccess;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Consultant licences without money (LICENCES-BUILD.md L3; user decision 2026-11-10): an Org Admin gives a consultant a licence, chooses its add-ons,
 * suspends, reactivates or ends it, and the change works at once. Nothing is billed. A price is shown only where the organization has a contract price;
 * otherwise it is "not set". Every change writes an APPLIED {@code license_change} row and one {@code LICENSE_CHANGE} audit row.
 *
 * <p>Price quotes, confirmation and Stripe come later on top of this writer (DD-14); they change what a change costs, not what it grants.
 *
 * <p>Permissions: reads need {@code licenses.view}, writes {@code licenses.manage} (both ORG scope); everything else is a 404 (the isolation promise).
 * Rows are keyed by consultant, so the page never needs a licence id it has not seen.
 */
@Service
@Transactional
public class OrgLicenseService {

    public static final String VIEW = "licenses.view";
    public static final String MANAGE = "licenses.manage";
    public static final String AUDIT_ACTION = "LICENSE_CHANGE";
    static final String BASE_PRODUCT_CODE = "ORG_BASE_LICENSE";

    /** The status a row shows. NONE = the consultant has no licence. */
    public enum Status {
        NONE,
        ACTIVE,
        SUSPENDED,
        ENDING,
        ENDED,
    }

    public record AddOn(String key, String name, String description, Long priceMinor, boolean usesAi) {}

    public record Catalog(String currency, Long basePriceMinor, List<AddOn> addOns, boolean billingConnected) {}

    public record Row(
        Long consultantId,
        String name,
        String email,
        boolean signInLinked,
        Status status,
        List<String> features,
        Long monthlyMinor,
        boolean priceSet,
        Instant since,
        Instant endsAt,
        String suspendReason
    ) {}

    public record Change(String kind, String featureKey, String summary, Instant at, Long actorMemberId) {}

    public record Detail(Row row, List<Change> history) {}

    private final ConsultantProfileRepository consultants;
    private final ConsultantLicenseRepository licenses;
    private final LicenseFeatureRepository features;
    private final LicenseChangeRepository changes;
    private final ProductRepository products;
    private final FeatureDefinitionRepository definitions;
    private final OrgContractPriceRepository contractPrices;
    private final ConsultantAccess access;
    private final OrgAuditService audit;
    private Clock clock = Clock.systemUTC();

    public OrgLicenseService(
        ConsultantProfileRepository consultants,
        ConsultantLicenseRepository licenses,
        LicenseFeatureRepository features,
        LicenseChangeRepository changes,
        ProductRepository products,
        FeatureDefinitionRepository definitions,
        OrgContractPriceRepository contractPrices,
        ConsultantAccess access,
        OrgAuditService audit
    ) {
        this.consultants = consultants;
        this.licenses = licenses;
        this.features = features;
        this.changes = changes;
        this.products = products;
        this.definitions = definitions;
        this.contractPrices = contractPrices;
        this.access = access;
        this.audit = audit;
    }

    /** Tests pin the time. */
    void setClock(Clock clock) {
        this.clock = clock;
    }

    private Instant now() {
        return Instant.now(clock).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
    }

    // ------------------------------------------------------------------------------------------ reads

    /** Every active consultant of the organization with their licence (or none), by name. */
    @Transactional(readOnly = true)
    public List<Row> list(OrgMembership me) {
        access.require(me, VIEW);
        Instant now = now();
        Prices prices = prices(me.orgId());
        List<Row> out = new ArrayList<>();
        for (ConsultantProfile c : consultants.findByOrgIdAndStatusOrderByDisplayNameAsc(me.orgId(), "ACTIVE")) out.add(row(c, current(me.orgId(), c.getId()), prices, now));
        return out;
    }

    /** One consultant's licence and its history, newest first. */
    @Transactional(readOnly = true)
    public Detail get(OrgMembership me, Long consultantId) {
        access.require(me, VIEW);
        ConsultantProfile c = consultant(me.orgId(), consultantId);
        Optional<ConsultantLicense> l = current(me.orgId(), c.getId());
        List<Change> history = new ArrayList<>();
        for (ConsultantLicense any : licenses.findByOrgIdAndConsultantIdOrderByStartsAtDesc(me.orgId(), c.getId())) {
            for (LicenseChange ch : changes.findByOrgIdAndLicenseIdOrderByCreatedAtDesc(me.orgId(), any.getId())) {
                history.add(new Change(ch.getKind(), ch.getFeatureKey(), ch.getSummary(), ch.getEffectiveAt(), ch.getActorMemberId()));
            }
        }
        history.sort(Comparator.comparing(Change::at, Comparator.nullsLast(Comparator.reverseOrder())));
        return new Detail(row(c, l, prices(me.orgId()), now()), history);
    }

    /** The base licence and the add-ons an organization can give, with its contract price where one exists. */
    @Transactional(readOnly = true)
    public Catalog catalog(OrgMembership me) {
        access.require(me, VIEW);
        Prices prices = prices(me.orgId());
        List<AddOn> addOns = new ArrayList<>();
        for (Product p : addOnProducts().values()) {
            FeatureDefinition d = definitions.findByFeatureKey(p.getFeatureKey()).orElse(null);
            boolean usesAi = d != null && (Boolean.TRUE.equals(d.getConsumesAi()) || (d.getAiBudgetCents() != null && d.getAiBudgetCents() > 0));
            addOns.add(new AddOn(p.getFeatureKey(), p.getName(), p.getDescription(), prices.of(p.getId()), usesAi));
        }
        Long base = products.findByCode(BASE_PRODUCT_CODE).map(p -> prices.of(p.getId())).orElse(null);
        return new Catalog(prices.currency(), base, addOns, false);
    }

    // ------------------------------------------------------------------------------------------ writes

    /** Give a consultant a licence with these add-ons. 409 {@code ALREADY_LICENSED} when they hold one that is not ended. */
    public Detail give(OrgMembership me, Long consultantId, Set<String> featureKeys) {
        write(me);
        ConsultantProfile c = consultant(me.orgId(), consultantId);
        if (current(me.orgId(), c.getId()).filter(l -> !"ENDED".equals(l.getStatus())).isPresent()) throw conflict("ALREADY_LICENSED", "This consultant already has a licence.");
        Map<String, Product> addOns = addOnProducts();
        requireKnown(featureKeys, addOns);
        Product base = products.findByCode(BASE_PRODUCT_CODE).orElseThrow(() -> new IllegalStateException("catalog product " + BASE_PRODUCT_CODE + " missing"));
        Instant now = now();
        Prices prices = prices(me.orgId());
        ConsultantLicense l = new ConsultantLicense();
        l.setOrgId(me.orgId());
        l.setConsultantId(c.getId());
        l.setMemberId(c.getMemberId());
        l.setStatus("ACTIVE");
        l.setBaseProductId(base.getId());
        l.setContractPriceId(prices.idOf(base.getId()));
        l.setBaseAmountMinor(nz(prices.of(base.getId())));
        l.setCurrency(prices.currency());
        l.setStartsAt(now);
        l.setCreatedByMemberId(me.memberId());
        l.setCreatedAt(now);
        l.setUpdatedAt(now);
        l = licenses.saveAndFlush(l);
        String batch = UUID.randomUUID().toString();
        change(me, l, batch, "CREATE", null, "gave a licence", nz(prices.of(base.getId())), now);
        for (String key : ordered(featureKeys)) addFeature(me, l, addOns.get(key), prices, batch, now);
        audit.record(me, AUDIT_ACTION, "CONSULTANT", null, String.valueOf(c.getId()), "gave a licence" + (featureKeys.isEmpty() ? "" : " with " + String.join(", ", ordered(featureKeys))));
        return get(me, c.getId());
    }

    /** Make the licence carry exactly these add-ons: new ones start now, missing ones stop now. A change that changes nothing writes nothing. */
    public Detail setFeatures(OrgMembership me, Long consultantId, Set<String> featureKeys) {
        write(me);
        ConsultantProfile c = consultant(me.orgId(), consultantId);
        ConsultantLicense l = liveOrSuspended(me.orgId(), c.getId());
        Map<String, Product> addOns = addOnProducts();
        requireKnown(featureKeys, addOns);
        Instant now = now();
        Prices prices = prices(me.orgId());
        Map<String, LicenseFeature> live = new LinkedHashMap<>();
        for (LicenseFeature f : features.findByOrgIdAndLicenseIdOrderByIdAsc(me.orgId(), l.getId())) if (OrgLicenseGate.live(f, now)) live.put(f.getFeatureKey(), f);
        String batch = UUID.randomUUID().toString();
        List<String> added = new ArrayList<>();
        List<String> removed = new ArrayList<>();
        for (String key : ordered(featureKeys)) {
            if (live.containsKey(key)) continue;
            addFeature(me, l, addOns.get(key), prices, batch, now);
            added.add(key);
        }
        for (LicenseFeature f : live.values()) {
            if (featureKeys.contains(f.getFeatureKey())) continue;
            f.setLive(false);
            f.setEndsAt(now);
            features.save(f);
            change(me, l, batch, "REMOVE_FEATURE", f.getFeatureKey(), "removed " + nameOf(f.getFeatureKey(), addOns), -nz(f.getUnitAmountMinor()) * Math.max(1, f.getQuantity() == null ? 1 : f.getQuantity()), now);
            removed.add(f.getFeatureKey());
        }
        if (!added.isEmpty() || !removed.isEmpty()) {
            l.setUpdatedAt(now);
            licenses.save(l);
            List<String> parts = new ArrayList<>();
            if (!added.isEmpty()) parts.add("added " + String.join(", ", added));
            if (!removed.isEmpty()) parts.add("removed " + String.join(", ", removed));
            audit.record(me, AUDIT_ACTION, "CONSULTANT", null, String.valueOf(c.getId()), String.join("; ", parts));
        }
        return get(me, c.getId());
    }

    /** Stop the licence now, keeping its add-ons for a reactivation. A reason is required. */
    public Detail suspend(OrgMembership me, Long consultantId, String reason) {
        write(me);
        String why = reason(reason);
        ConsultantProfile c = consultant(me.orgId(), consultantId);
        ConsultantLicense l = liveOrSuspended(me.orgId(), c.getId());
        if ("SUSPENDED".equals(l.getStatus())) return get(me, c.getId());
        Instant now = now();
        l.setStatus("SUSPENDED");
        l.setSuspendedAt(now);
        l.setSuspendReason(why);
        l.setUpdatedAt(now);
        licenses.save(l);
        change(me, l, UUID.randomUUID().toString(), "SUSPEND", null, "suspended: " + why, 0L, now);
        audit.record(me, AUDIT_ACTION, "CONSULTANT", null, String.valueOf(c.getId()), "suspended the licence: " + why);
        return get(me, c.getId());
    }

    /** Turn a suspended licence back on, with the add-ons it had. */
    public Detail reactivate(OrgMembership me, Long consultantId) {
        write(me);
        ConsultantProfile c = consultant(me.orgId(), consultantId);
        ConsultantLicense l = liveOrSuspended(me.orgId(), c.getId());
        if (!"SUSPENDED".equals(l.getStatus())) return get(me, c.getId());
        Instant now = now();
        l.setStatus("ACTIVE");
        l.setSuspendedAt(null);
        l.setSuspendReason(null);
        l.setUpdatedAt(now);
        licenses.save(l);
        change(me, l, UUID.randomUUID().toString(), "REACTIVATE", null, "reactivated", 0L, now);
        audit.record(me, AUDIT_ACTION, "CONSULTANT", null, String.valueOf(c.getId()), "reactivated the licence");
        return get(me, c.getId());
    }

    /** End the licence now, with its add-ons. A reason is required; giving a new licence later starts a new row (history stays). */
    public Detail end(OrgMembership me, Long consultantId, String reason) {
        write(me);
        String why = reason(reason);
        ConsultantProfile c = consultant(me.orgId(), consultantId);
        ConsultantLicense l = liveOrSuspended(me.orgId(), c.getId());
        endNow(me, l, "REMOVED", why, now());
        audit.record(me, AUDIT_ACTION, "CONSULTANT", null, String.valueOf(c.getId()), "ended the licence: " + why);
        return get(me, c.getId());
    }

    /**
     * End a consultant's licence because their seat ended (LICENCES-BUILD.md L5): called by offboarding with the organization's own actor, never from a
     * page. Does nothing when there is no licence. Returns whether one was ended.
     */
    public boolean endForSeat(Long orgId, Long consultantId, String endReason, Long actorMemberId) {
        Optional<ConsultantLicense> l = current(orgId, consultantId).filter(x -> !"ENDED".equals(x.getStatus()));
        if (l.isEmpty()) return false;
        endNow(null, l.get(), endReason, endReason.toLowerCase(java.util.Locale.ROOT).replace('_', ' '), now(), actorMemberId);
        return true;
    }

    // ------------------------------------------------------------------------------------------ helpers

    private void endNow(OrgMembership me, ConsultantLicense l, String endReason, String why, Instant now) {
        endNow(me, l, endReason, why, now, me == null ? null : me.memberId());
    }

    private void endNow(OrgMembership me, ConsultantLicense l, String endReason, String why, Instant now, Long actor) {
        for (LicenseFeature f : features.findByOrgIdAndLicenseIdOrderByIdAsc(l.getOrgId(), l.getId())) {
            if (!Boolean.TRUE.equals(f.getLive())) continue;
            f.setLive(false);
            if (f.getEndsAt() == null || f.getEndsAt().isAfter(now)) f.setEndsAt(now);
            features.save(f);
        }
        l.setStatus("ENDED");
        l.setEndsAt(now);
        l.setEndReason(endReason);
        l.setUpdatedAt(now);
        licenses.save(l);
        LicenseChange ch = newChange(l, UUID.randomUUID().toString(), "END", null, "ended: " + why, 0L, now, actor);
        changes.save(ch);
    }

    private void addFeature(OrgMembership me, ConsultantLicense l, Product p, Prices prices, String batch, Instant now) {
        LicenseFeature f = new LicenseFeature();
        f.setOrgId(l.getOrgId());
        f.setLicenseId(l.getId());
        f.setFeatureKey(p.getFeatureKey());
        f.setProductId(p.getId());
        f.setContractPriceId(prices.idOf(p.getId()));
        f.setUnitAmountMinor(nz(prices.of(p.getId())));
        f.setQuantity(1);
        f.setStartsAt(now);
        f.setLive(true);
        f.setAddedByMemberId(me.memberId());
        f.setCreatedAt(now);
        features.save(f);
        change(me, l, batch, "ADD_FEATURE", p.getFeatureKey(), "added " + p.getName(), nz(prices.of(p.getId())), now);
    }

    private void change(OrgMembership me, ConsultantLicense l, String batch, String kind, String featureKey, String summary, long delta, Instant now) {
        changes.save(newChange(l, batch, kind, featureKey, summary, delta, now, me.memberId()));
    }

    private static LicenseChange newChange(ConsultantLicense l, String batch, String kind, String featureKey, String summary, long delta, Instant now, Long actor) {
        LicenseChange ch = new LicenseChange();
        ch.setOrgId(l.getOrgId());
        ch.setLicenseId(l.getId());
        ch.setBatchId(batch);
        ch.setKind(kind);
        ch.setFeatureKey(featureKey);
        ch.setSummary(summary.length() > 200 ? summary.substring(0, 200) : summary);
        ch.setAmountDeltaMinor(delta);
        ch.setEffectiveAt(now);
        ch.setStatus("APPLIED");
        ch.setActorMemberId(actor);
        ch.setCreatedAt(now);
        ch.setAppliedAt(now);
        return ch;
    }

    private Row row(ConsultantProfile c, Optional<ConsultantLicense> license, Prices prices, Instant now) {
        if (license.isEmpty()) return new Row(c.getId(), c.getDisplayName(), c.getEmail(), c.getMemberId() != null, Status.NONE, List.of(), null, false, null, null, null);
        ConsultantLicense l = license.get();
        List<String> keys = new ArrayList<>();
        long monthly = nz(l.getBaseAmountMinor());
        boolean priceSet = l.getContractPriceId() != null;
        boolean ended = "ENDED".equals(l.getStatus());
        for (LicenseFeature f : features.findByOrgIdAndLicenseIdOrderByIdAsc(l.getOrgId(), l.getId())) {
            boolean keep = "SUSPENDED".equals(l.getStatus()) ? Boolean.TRUE.equals(f.getLive()) : OrgLicenseGate.live(f, now);
            if (ended || !keep) continue;
            keys.add(f.getFeatureKey());
            monthly += nz(f.getUnitAmountMinor()) * Math.max(1, f.getQuantity() == null ? 1 : f.getQuantity());
            priceSet = priceSet || f.getContractPriceId() != null;
        }
        Status status = switch (l.getStatus()) {
            case "ACTIVE" -> Status.ACTIVE;
            case "SUSPENDED" -> Status.SUSPENDED;
            case "CANCEL_AT_PERIOD_END" -> Status.ENDING;
            case "ENDED" -> Status.ENDED;
            default -> Status.NONE;
        };
        return new Row(c.getId(), c.getDisplayName(), c.getEmail(), c.getMemberId() != null, status, keys, priceSet && !ended ? monthly : null, priceSet, l.getStartsAt(), l.getEndsAt(), l.getSuspendReason());
    }

    /** The consultant's newest licence: the live or suspended one when there is one, else the newest (an ENDED one shows as ended). */
    private Optional<ConsultantLicense> current(Long orgId, Long consultantId) {
        List<ConsultantLicense> all = licenses.findByOrgIdAndConsultantIdOrderByStartsAtDesc(orgId, consultantId);
        for (ConsultantLicense l : all) if (!"ENDED".equals(l.getStatus())) return Optional.of(l);
        return all.stream().findFirst();
    }

    private ConsultantLicense liveOrSuspended(Long orgId, Long consultantId) {
        return current(orgId, consultantId).filter(l -> !"ENDED".equals(l.getStatus())).orElseThrow(() -> conflict("NO_LICENSE", "This consultant has no licence."));
    }

    private ConsultantProfile consultant(Long orgId, Long consultantId) {
        if (consultantId == null) throw new OrgNotFoundException();
        ConsultantProfile c = consultants.findByOrgIdAndId(orgId, consultantId).orElseThrow(OrgNotFoundException::new);
        if (!"ACTIVE".equals(c.getStatus())) throw new OrgNotFoundException();
        return c;
    }

    private void write(OrgMembership me) {
        access.require(me, MANAGE);
        access.requireWritable(me, MANAGE);
    }

    /** The add-ons an organization can give: FEATURE products sold to organizations, by key. */
    private Map<String, Product> addOnProducts() {
        Map<String, Product> out = new LinkedHashMap<>();
        for (Product p : products.findByKindOrderBySortOrderAsc("FEATURE")) {
            if (p.getFeatureKey() == null || Boolean.FALSE.equals(p.getActive())) continue;
            if (!"ORG".equals(p.getSoldTo()) && !"BOTH".equals(p.getSoldTo())) continue;
            out.putIfAbsent(p.getFeatureKey(), p);
        }
        return out;
    }

    private static void requireKnown(Set<String> keys, Map<String, Product> addOns) {
        for (String k : keys) {
            if (!addOns.containsKey(k)) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Unknown add-on: " + k);
        }
    }

    private static List<String> ordered(Set<String> keys) {
        return new ArrayList<>(new LinkedHashSet<>(keys.stream().sorted().toList()));
    }

    private static String nameOf(String key, Map<String, Product> addOns) {
        Product p = addOns.get(key);
        return p == null ? key : p.getName();
    }

    private static String reason(String reason) {
        String r = reason == null ? "" : reason.trim();
        if (r.length() < 3) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Say why (at least 3 characters).");
        return r.length() > 200 ? r.substring(0, 200) : r;
    }

    private static ResponseStatusException conflict(String code, String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, code + ": " + message);
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }

    /** The organization's current contract prices (version_to null), by product; empty when it has none, which means "price not set". */
    private Prices prices(Long orgId) {
        Map<Long, OrgContractPrice> byProduct = new HashMap<>();
        for (OrgContractPrice p : contractPrices.findByOrgId(orgId)) {
            if (p.getVersionTo() != null || p.getOverrideAmountMinor() == null) continue;
            OrgContractPrice seen = byProduct.get(p.getProductId());
            if (seen == null || p.getId() > seen.getId()) byProduct.put(p.getProductId(), p);
        }
        String currency = byProduct.values().stream().map(OrgContractPrice::getCurrency).filter(x -> x != null && !x.isBlank()).findFirst().orElse("USD");
        return new Prices(byProduct, currency);
    }

    private record Prices(Map<Long, OrgContractPrice> byProduct, String currency) {
        Long of(Long productId) {
            OrgContractPrice p = byProduct.get(productId);
            return p == null ? null : p.getOverrideAmountMinor();
        }

        Long idOf(Long productId) {
            OrgContractPrice p = byProduct.get(productId);
            return p == null ? null : p.getId();
        }
    }
}
