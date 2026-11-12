package com.dossier.api.service.ent.licenses;

import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.LicenseChange;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.billing.OrgBillingAccount;
import com.dossier.api.domain.ent.billing.OrgContractPrice;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.domain.ent.billing.SubscriptionChange;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseChangeRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.billing.OrgBillingAccountRepository;
import com.dossier.api.repository.ent.billing.OrgContractPriceRepository;
import com.dossier.api.repository.ent.billing.SubscriptionChangeRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.sub.ProductPriceRepository;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.ent.consultants.ConsultantAccess;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Consultant licences without money (LICENCES-BUILD.md L3; ORG-BILLING-BUILD.md step 1b): an Org Admin gives a consultant a licence, chooses its add-ons,
 * suspends, reactivates or ends it. Nothing is billed. Every change writes {@code license_change} rows, one {@code LICENSE_CHANGE} audit row and one
 * {@code subscription_change} line of the organization's subscription history.
 *
 * <p>Prices: the organization's contract price, else the catalog's active ORG monthly price, else "not set" (never $0).
 *
 * <p>When the organization has a billing period ({@code org_billing_account}), an add-on that is taken away stays until the period ends (C9: removals at
 * period end): its {@code license_feature.ends_at} is the period end and a PENDING {@code license_change} can be undone until then. Without a billing period,
 * which is every real organization until Stripe is connected, it stops at once. Giving the add-on back before it ends cancels the removal.
 *
 * <p>Changes of add-ons go through a quote first ({@link LicenseQuoteService}); suspend, reactivate and end are one-click. Permissions: reads need
 * {@code licenses.view}, writes {@code licenses.manage} (both ORG scope); everything else is a 404. Rows are keyed by consultant.
 */
@Service
@Transactional
public class OrgLicenseService {

    public static final String VIEW = "licenses.view";
    public static final String MANAGE = "licenses.manage";
    public static final String AUDIT_ACTION = "LICENSE_CHANGE";
    static final String BASE_PRODUCT_CODE = "ORG_BASE_LICENSE";
    static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US);

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

    /** {@code endingFeatures}: the add-ons that are taken away at the end of the billing period (they still work until then). */
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
        String suspendReason,
        List<String> endingFeatures
    ) {}

    public record Change(String kind, String featureKey, String summary, Instant at, Long actorMemberId) {}

    /** A removal waiting for the end of the billing period; {@code changeId} undoes it ({@code DELETE /licenses/changes/{changeId}}). */
    public record Scheduled(Long changeId, String featureKey, String name, Instant effectiveAt) {}

    public record Detail(Row row, List<Change> history, List<Scheduled> scheduled) {}

    /** The organization's current billing period: [start, end) as instants, and its last day. */
    record Period(Instant start, Instant end, LocalDate lastDay) {}

    private final ConsultantProfileRepository consultants;
    private final ConsultantLicenseRepository licenses;
    private final LicenseFeatureRepository features;
    private final LicenseChangeRepository changes;
    private final ProductRepository products;
    private final FeatureDefinitionRepository definitions;
    private final OrgContractPriceRepository contractPrices;
    private final ProductPriceRepository catalogPrices;
    private final OrgBillingAccountRepository billingAccounts;
    private final SubscriptionChangeRepository subscriptionChanges;
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
        ProductPriceRepository catalogPrices,
        OrgBillingAccountRepository billingAccounts,
        SubscriptionChangeRepository subscriptionChanges,
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
        this.catalogPrices = catalogPrices;
        this.billingAccounts = billingAccounts;
        this.subscriptionChanges = subscriptionChanges;
        this.access = access;
        this.audit = audit;
    }

    /** Tests pin the time. */
    void setClock(Clock clock) {
        this.clock = clock;
    }

    Instant now() {
        return Instant.now(clock).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
    }

    // ------------------------------------------------------------------------------------------ reads

    /** Every active consultant of the organization with their licence (or none), by name. */
    @Transactional(readOnly = true)
    public List<Row> list(OrgMembership me) {
        access.require(me, VIEW);
        return rowsFor(me.orgId());
    }

    /**
     * The same rows as {@link #list}, with no permission check: for the billing pages (ORG-BILLING-BUILD.md step 1a), whose own reader requires
     * {@code billing.view} first. Never expose it on a route by itself.
     */
    @Transactional(readOnly = true)
    public List<Row> rowsFor(Long orgId) {
        Instant now = now();
        Prices prices = prices(orgId);
        List<Row> out = new ArrayList<>();
        for (ConsultantProfile c : consultants.findByOrgIdAndStatusOrderByDisplayNameAsc(orgId, "ACTIVE")) out.add(row(c, current(orgId, c.getId()), prices, now));
        return out;
    }

    /** One consultant's licence, its history (newest first) and the removals waiting for the end of the period. */
    @Transactional(readOnly = true)
    public Detail get(OrgMembership me, Long consultantId) {
        access.require(me, VIEW);
        return detail(me.orgId(), consultant(me.orgId(), consultantId));
    }

    /** The base licence and the add-ons an organization can give, with the price it would pay (contract, else catalog) or null. */
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
        return give(me, consultantId, featureKeys, null);
    }

    /** {@link #give}, recording the quote it was confirmed from. */
    public Detail give(OrgMembership me, Long consultantId, Set<String> featureKeys, Long quoteId) {
        write(me);
        ConsultantProfile c = consultant(me.orgId(), consultantId);
        if (current(me.orgId(), c.getId()).filter(l -> !"ENDED".equals(l.getStatus())).isPresent()) throw conflict("ALREADY_LICENSED", "This consultant already has a licence.");
        Map<String, Product> addOns = addOnProducts();
        requireKnown(featureKeys, addOns);
        Product base = baseProduct();
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
        change(me, l, batch, quoteId, "CREATE", null, "gave a licence", nz(prices.of(base.getId())), now);
        for (String key : ordered(featureKeys)) addFeature(me, l, addOns.get(key), prices, batch, quoteId, now);
        String what = "gave a licence" + (featureKeys.isEmpty() ? "" : " with " + String.join(", ", ordered(featureKeys)));
        audit.record(me, AUDIT_ACTION, "CONSULTANT", null, String.valueOf(c.getId()), what + quoteNote(quoteId));
        history(me, "ADDED", "Gave " + c.getDisplayName() + " a licence", 1, now);
        return detail(me.orgId(), c);
    }

    /** Make the licence carry exactly these add-ons. A change that changes nothing writes nothing. */
    public Detail setFeatures(OrgMembership me, Long consultantId, Set<String> featureKeys) {
        return setFeatures(me, consultantId, featureKeys, null);
    }

    /**
     * {@link #setFeatures}, recording the quote it was confirmed from. New add-ons start now. A missing one stops at the end of the billing period when
     * there is one (a PENDING removal, see the class comment), otherwise now. An add-on whose removal is pending and that is asked for again is kept.
     */
    public Detail setFeatures(OrgMembership me, Long consultantId, Set<String> featureKeys, Long quoteId) {
        write(me);
        ConsultantProfile c = consultant(me.orgId(), consultantId);
        ConsultantLicense l = liveOrSuspended(me.orgId(), c.getId());
        Map<String, Product> addOns = addOnProducts();
        requireKnown(featureKeys, addOns);
        Instant now = now();
        Prices prices = prices(me.orgId());
        Optional<Period> period = period(me.orgId(), now);
        Map<String, LicenseFeature> live = liveFeatures(l, now);
        String batch = UUID.randomUUID().toString();
        List<String> parts = new ArrayList<>();
        for (String key : ordered(featureKeys)) {
            LicenseFeature f = live.get(key);
            if (f == null) {
                addFeature(me, l, addOns.get(key), prices, batch, quoteId, now);
                parts.add("added " + nameOf(key, addOns));
            } else if (f.getEndsAt() != null) {
                keep(me, l, f, batch, quoteId, addOns, now);
                parts.add("kept " + nameOf(key, addOns));
            }
        }
        for (LicenseFeature f : live.values()) {
            if (featureKeys.contains(f.getFeatureKey()) || f.getEndsAt() != null) continue;
            long delta = -nz(f.getUnitAmountMinor()) * qty(f);
            String name = nameOf(f.getFeatureKey(), addOns);
            if (period.isPresent()) {
                f.setEndsAt(period.get().end());
                features.save(f);
                LicenseChange ch = newChange(l, batch, "REMOVE_FEATURE", f.getFeatureKey(), "removes " + name + " on " + DAY.format(period.get().lastDay().plusDays(1)), delta, period.get().end(), me.memberId());
                ch.setStatus("PENDING");
                ch.setAppliedAt(null);
                ch.setQuoteId(quoteId);
                changes.save(ch);
                parts.add("removes " + name + " when the period ends");
            } else {
                f.setLive(false);
                f.setEndsAt(now);
                features.save(f);
                change(me, l, batch, quoteId, "REMOVE_FEATURE", f.getFeatureKey(), "removed " + name, delta, now);
                parts.add("removed " + name);
            }
        }
        if (!parts.isEmpty()) {
            l.setUpdatedAt(now);
            licenses.save(l);
            String what = String.join("; ", parts);
            audit.record(me, AUDIT_ACTION, "CONSULTANT", null, String.valueOf(c.getId()), what + quoteNote(quoteId));
            history(me, "CHANGED", c.getDisplayName() + ": " + what, 0, now);
        }
        return detail(me.orgId(), c);
    }

    /** Undo a removal that waits for the end of the period: the add-on stays. 409 {@code NOT_PENDING} once it is undone or has happened. */
    public Detail keepFeature(OrgMembership me, Long changeId) {
        write(me);
        if (changeId == null) throw new OrgNotFoundException();
        LicenseChange ch = changes.findByOrgIdAndId(me.orgId(), changeId).orElseThrow(OrgNotFoundException::new);
        ConsultantLicense l = licenses.findByOrgIdAndId(me.orgId(), ch.getLicenseId()).orElseThrow(OrgNotFoundException::new);
        ConsultantProfile c = consultant(me.orgId(), l.getConsultantId());
        Instant now = now();
        if (!"PENDING".equals(ch.getStatus()) || !"REMOVE_FEATURE".equals(ch.getKind()) || !ch.getEffectiveAt().isAfter(now) || "ENDED".equals(l.getStatus())) {
            throw conflict("NOT_PENDING", "This removal is no longer waiting. Reload to see the latest.");
        }
        LicenseFeature f = liveFeatures(l, now).get(ch.getFeatureKey());
        Map<String, Product> addOns = addOnProducts();
        if (f != null) keep(me, l, f, UUID.randomUUID().toString(), null, addOns, now);
        else {
            ch.setStatus("CANCELLED");
            changes.save(ch);
        }
        String what = "kept " + nameOf(ch.getFeatureKey(), addOns);
        audit.record(me, AUDIT_ACTION, "CONSULTANT", null, String.valueOf(c.getId()), what);
        history(me, "CHANGED", c.getDisplayName() + ": " + what, 0, now);
        return detail(me.orgId(), c);
    }

    /** Stop the licence now, keeping its add-ons for a reactivation. A reason is required. */
    public Detail suspend(OrgMembership me, Long consultantId, String reason) {
        write(me);
        String why = reason(reason);
        ConsultantProfile c = consultant(me.orgId(), consultantId);
        ConsultantLicense l = liveOrSuspended(me.orgId(), c.getId());
        if ("SUSPENDED".equals(l.getStatus())) return detail(me.orgId(), c);
        Instant now = now();
        l.setStatus("SUSPENDED");
        l.setSuspendedAt(now);
        l.setSuspendReason(why);
        l.setUpdatedAt(now);
        licenses.save(l);
        change(me, l, UUID.randomUUID().toString(), null, "SUSPEND", null, "suspended: " + why, 0L, now);
        audit.record(me, AUDIT_ACTION, "CONSULTANT", null, String.valueOf(c.getId()), "suspended the licence: " + why);
        return detail(me.orgId(), c);
    }

    /** Turn a suspended licence back on, with the add-ons it had. */
    public Detail reactivate(OrgMembership me, Long consultantId) {
        write(me);
        ConsultantProfile c = consultant(me.orgId(), consultantId);
        ConsultantLicense l = liveOrSuspended(me.orgId(), c.getId());
        if (!"SUSPENDED".equals(l.getStatus())) return detail(me.orgId(), c);
        Instant now = now();
        l.setStatus("ACTIVE");
        l.setSuspendedAt(null);
        l.setSuspendReason(null);
        l.setUpdatedAt(now);
        licenses.save(l);
        change(me, l, UUID.randomUUID().toString(), null, "REACTIVATE", null, "reactivated", 0L, now);
        audit.record(me, AUDIT_ACTION, "CONSULTANT", null, String.valueOf(c.getId()), "reactivated the licence");
        return detail(me.orgId(), c);
    }

    /** End the licence now, with its add-ons. A reason is required; giving a new licence later starts a new row (history stays). */
    public Detail end(OrgMembership me, Long consultantId, String reason) {
        write(me);
        String why = reason(reason);
        ConsultantProfile c = consultant(me.orgId(), consultantId);
        ConsultantLicense l = liveOrSuspended(me.orgId(), c.getId());
        Instant now = now();
        endNow(l, "REMOVED", why, now, me.memberId());
        audit.record(me, AUDIT_ACTION, "CONSULTANT", null, String.valueOf(c.getId()), "ended the licence: " + why);
        history(me, "REMOVED", "Ended " + c.getDisplayName() + "'s licence", -1, now);
        return detail(me.orgId(), c);
    }

    /**
     * End a consultant's licence because their seat ended (LICENCES-BUILD.md L5): called by offboarding with the organization's own actor, never from a
     * page. Does nothing when there is no licence. Returns whether one was ended.
     */
    public boolean endForSeat(Long orgId, Long consultantId, String endReason, Long actorMemberId) {
        Optional<ConsultantLicense> l = current(orgId, consultantId).filter(x -> !"ENDED".equals(x.getStatus()));
        if (l.isEmpty()) return false;
        endNow(l.get(), endReason, endReason.toLowerCase(Locale.ROOT).replace('_', ' '), now(), actorMemberId);
        return true;
    }

    // ------------------------------------------------------------------------------------------ helpers (the quote service uses the package ones)

    private Detail detail(Long orgId, ConsultantProfile c) {
        Optional<ConsultantLicense> l = current(orgId, c.getId());
        Instant now = now();
        List<Change> history = new ArrayList<>();
        for (ConsultantLicense any : licenses.findByOrgIdAndConsultantIdOrderByStartsAtDesc(orgId, c.getId())) {
            for (LicenseChange ch : changes.findByOrgIdAndLicenseIdOrderByCreatedAtDesc(orgId, any.getId())) {
                if ("CANCELLED".equals(ch.getStatus())) continue;
                history.add(new Change(ch.getKind(), ch.getFeatureKey(), ch.getSummary(), "PENDING".equals(ch.getStatus()) ? ch.getCreatedAt() : ch.getEffectiveAt(), ch.getActorMemberId()));
            }
        }
        history.sort(Comparator.comparing(Change::at, Comparator.nullsLast(Comparator.reverseOrder())));
        List<Scheduled> scheduled = new ArrayList<>();
        if (l.isPresent() && !"ENDED".equals(l.get().getStatus())) {
            Map<String, Product> addOns = addOnProducts();
            for (LicenseChange ch : changes.findByOrgIdAndLicenseIdOrderByCreatedAtDesc(orgId, l.get().getId())) {
                if (!"PENDING".equals(ch.getStatus()) || !ch.getEffectiveAt().isAfter(now)) continue;
                scheduled.add(new Scheduled(ch.getId(), ch.getFeatureKey(), nameOf(ch.getFeatureKey(), addOns), ch.getEffectiveAt()));
            }
            scheduled.sort(Comparator.comparing(Scheduled::effectiveAt));
        }
        return new Detail(row(c, l, prices(orgId), now), history, scheduled);
    }

    /** Cancel the pending removal of {@code f}: it has no end date again, and its PENDING change is CANCELLED. */
    private void keep(OrgMembership me, ConsultantLicense l, LicenseFeature f, String batch, Long quoteId, Map<String, Product> addOns, Instant now) {
        f.setEndsAt(null);
        features.save(f);
        for (LicenseChange ch : changes.findByOrgIdAndLicenseIdOrderByCreatedAtDesc(l.getOrgId(), l.getId())) {
            if (!"PENDING".equals(ch.getStatus()) || !f.getFeatureKey().equals(ch.getFeatureKey())) continue;
            ch.setStatus("CANCELLED");
            changes.save(ch);
        }
        change(me, l, batch, quoteId, "KEEP_FEATURE", f.getFeatureKey(), "kept " + nameOf(f.getFeatureKey(), addOns), 0L, now);
    }

    private void endNow(ConsultantLicense l, String endReason, String why, Instant now, Long actor) {
        for (LicenseFeature f : features.findByOrgIdAndLicenseIdOrderByIdAsc(l.getOrgId(), l.getId())) {
            if (!Boolean.TRUE.equals(f.getLive())) continue;
            f.setLive(false);
            if (f.getEndsAt() == null || f.getEndsAt().isAfter(now)) f.setEndsAt(now);
            features.save(f);
        }
        for (LicenseChange pending : changes.findByOrgIdAndLicenseIdOrderByCreatedAtDesc(l.getOrgId(), l.getId())) {
            if (!"PENDING".equals(pending.getStatus())) continue;
            pending.setStatus("CANCELLED"); // the whole licence ends now: nothing waits for the period end any more
            changes.save(pending);
        }
        l.setStatus("ENDED");
        l.setEndsAt(now);
        l.setEndReason(endReason);
        l.setUpdatedAt(now);
        licenses.save(l);
        LicenseChange ch = newChange(l, UUID.randomUUID().toString(), "END", null, "ended: " + why, 0L, now, actor);
        changes.save(ch);
    }

    private void addFeature(OrgMembership me, ConsultantLicense l, Product p, Prices prices, String batch, Long quoteId, Instant now) {
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
        change(me, l, batch, quoteId, "ADD_FEATURE", p.getFeatureKey(), "added " + p.getName(), nz(prices.of(p.getId())), now);
    }

    private void change(OrgMembership me, ConsultantLicense l, String batch, Long quoteId, String kind, String featureKey, String summary, long delta, Instant now) {
        LicenseChange ch = newChange(l, batch, kind, featureKey, summary, delta, now, me.memberId());
        ch.setQuoteId(quoteId);
        changes.save(ch);
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

    /** One line of the organization's subscription history (the Subscription page's "changes"), with the live licence count after it. */
    private void history(OrgMembership me, String kind, String summary, int delta, Instant now) {
        SubscriptionChange s = new SubscriptionChange();
        s.setOrgId(me.orgId());
        s.setKind(kind);
        s.setSummary(summary.length() > 200 ? summary.substring(0, 197) + "..." : summary);
        s.setLicensesDelta(delta);
        s.setLicensesTotalAfter((int) licenses.countLive(me.orgId()));
        s.setActorMemberId(me.memberId());
        s.setOccurredAt(now);
        subscriptionChanges.save(s);
    }

    private static String quoteNote(Long quoteId) {
        return quoteId == null ? "" : " (quote " + quoteId + ")";
    }

    private Row row(ConsultantProfile c, Optional<ConsultantLicense> license, Prices prices, Instant now) {
        if (license.isEmpty()) return new Row(c.getId(), c.getDisplayName(), c.getEmail(), c.getMemberId() != null, Status.NONE, List.of(), null, false, null, null, null, List.of());
        ConsultantLicense l = license.get();
        List<String> keys = new ArrayList<>();
        List<String> ending = new ArrayList<>();
        long monthly = nz(l.getBaseAmountMinor());
        boolean priceSet = l.getContractPriceId() != null || nz(l.getBaseAmountMinor()) > 0;
        boolean ended = "ENDED".equals(l.getStatus());
        for (LicenseFeature f : features.findByOrgIdAndLicenseIdOrderByIdAsc(l.getOrgId(), l.getId())) {
            boolean keep = "SUSPENDED".equals(l.getStatus()) ? Boolean.TRUE.equals(f.getLive()) && (f.getEndsAt() == null || f.getEndsAt().isAfter(now)) : OrgLicenseGate.live(f, now);
            if (ended || !keep) continue;
            keys.add(f.getFeatureKey());
            if (f.getEndsAt() != null) ending.add(f.getFeatureKey());
            monthly += nz(f.getUnitAmountMinor()) * qty(f);
            priceSet = priceSet || f.getContractPriceId() != null || nz(f.getUnitAmountMinor()) > 0;
        }
        Status status = switch (l.getStatus()) {
            case "ACTIVE" -> Status.ACTIVE;
            case "SUSPENDED" -> Status.SUSPENDED;
            case "CANCEL_AT_PERIOD_END" -> Status.ENDING;
            case "ENDED" -> Status.ENDED;
            default -> Status.NONE;
        };
        return new Row(c.getId(), c.getDisplayName(), c.getEmail(), c.getMemberId() != null, status, keys, priceSet && !ended ? monthly : null, priceSet, l.getStartsAt(), l.getEndsAt(), l.getSuspendReason(), ending);
    }

    /** The add-ons a licence carries now, by key (an add-on whose removal is pending is still here, with its {@code ends_at}). */
    Map<String, LicenseFeature> liveFeatures(ConsultantLicense l, Instant now) {
        Map<String, LicenseFeature> live = new LinkedHashMap<>();
        for (LicenseFeature f : features.findByOrgIdAndLicenseIdOrderByIdAsc(l.getOrgId(), l.getId())) if (OrgLicenseGate.live(f, now)) live.put(f.getFeatureKey(), f);
        return live;
    }

    /** The consultant's newest licence: the live or suspended one when there is one, else the newest (an ENDED one shows as ended). */
    Optional<ConsultantLicense> current(Long orgId, Long consultantId) {
        List<ConsultantLicense> all = licenses.findByOrgIdAndConsultantIdOrderByStartsAtDesc(orgId, consultantId);
        for (ConsultantLicense l : all) if (!"ENDED".equals(l.getStatus())) return Optional.of(l);
        return all.stream().findFirst();
    }

    private ConsultantLicense liveOrSuspended(Long orgId, Long consultantId) {
        return current(orgId, consultantId).filter(l -> !"ENDED".equals(l.getStatus())).orElseThrow(() -> conflict("NO_LICENSE", "This consultant has no licence."));
    }

    ConsultantProfile consultant(Long orgId, Long consultantId) {
        if (consultantId == null) throw new OrgNotFoundException();
        ConsultantProfile c = consultants.findByOrgIdAndId(orgId, consultantId).orElseThrow(OrgNotFoundException::new);
        if (!"ACTIVE".equals(c.getStatus())) throw new OrgNotFoundException();
        return c;
    }

    void write(OrgMembership me) {
        access.require(me, MANAGE);
        access.requireWritable(me, MANAGE);
    }

    Product baseProduct() {
        return products.findByCode(BASE_PRODUCT_CODE).orElseThrow(() -> new IllegalStateException("catalog product " + BASE_PRODUCT_CODE + " missing"));
    }

    /** The add-ons an organization can give: FEATURE products sold to organizations, by key. */
    Map<String, Product> addOnProducts() {
        Map<String, Product> out = new LinkedHashMap<>();
        for (Product p : products.findByKindOrderBySortOrderAsc("FEATURE")) {
            if (p.getFeatureKey() == null || Boolean.FALSE.equals(p.getActive())) continue;
            if (!"ORG".equals(p.getSoldTo()) && !"BOTH".equals(p.getSoldTo())) continue;
            out.putIfAbsent(p.getFeatureKey(), p);
        }
        return out;
    }

    /** The organization's billing period, when it has a billing account with one that has not ended (none until billing is set up). */
    Optional<Period> period(Long orgId, Instant now) {
        Optional<OrgBillingAccount> a = billingAccounts.findFirstByOrgId(orgId);
        if (a.isEmpty() || a.get().getCurrentPeriodStart() == null || a.get().getCurrentPeriodEnd() == null) return Optional.empty();
        LocalDate first = a.get().getCurrentPeriodStart();
        LocalDate last = a.get().getCurrentPeriodEnd();
        Instant start = first.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant end = last.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        if (!end.isAfter(start) || !end.isAfter(now)) return Optional.empty();
        return Optional.of(new Period(start, end, last));
    }

    static void requireKnown(Set<String> keys, Map<String, Product> addOns) {
        for (String k : keys) {
            if (!addOns.containsKey(k)) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Unknown add-on: " + k);
        }
    }

    static List<String> ordered(Set<String> keys) {
        return new ArrayList<>(new LinkedHashSet<>(keys.stream().sorted().toList()));
    }

    static String nameOf(String key, Map<String, Product> addOns) {
        Product p = addOns.get(key);
        return p == null ? key : p.getName();
    }

    static long qty(LicenseFeature f) {
        return Math.max(1, f.getQuantity() == null ? 1 : f.getQuantity());
    }

    private static String reason(String reason) {
        String r = reason == null ? "" : reason.trim();
        if (r.length() < 3) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Say why (at least 3 characters).");
        com.dossier.api.service.privacy.SensitiveContent.check("reason", "reason", r); // free text: never an SSN, bank or ID number (CLAUDE.md)
        return r.length() > 200 ? r.substring(0, 200) : r;
    }

    static ResponseStatusException conflict(String code, String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, code + ": " + message);
    }

    static long nz(Long v) {
        return v == null ? 0L : v;
    }

    /**
     * What the organization pays for a product, per month: its current contract price (version_to null), else the catalog's active ORG monthly price in
     * the contract's currency (USD when there is no contract), else null, which means "price not set".
     */
    Prices prices(Long orgId) {
        Map<Long, OrgContractPrice> byProduct = new HashMap<>();
        for (OrgContractPrice p : contractPrices.findByOrgId(orgId)) {
            if (p.getVersionTo() != null || p.getOverrideAmountMinor() == null) continue;
            OrgContractPrice seen = byProduct.get(p.getProductId());
            if (seen == null || p.getId() > seen.getId()) byProduct.put(p.getProductId(), p);
        }
        String currency = byProduct.values().stream().map(OrgContractPrice::getCurrency).filter(x -> x != null && !x.isBlank()).findFirst().orElse("USD");
        Map<Long, Optional<Long>> catalog = new HashMap<>();
        return new Prices(byProduct, currency, pid -> catalog.computeIfAbsent(pid, k -> catalogPrices.findActive(k, "ORG", "MONTH", currency).map(ProductPrice::getAmountMinor)).orElse(null));
    }

    record Prices(Map<Long, OrgContractPrice> byProduct, String currency, java.util.function.Function<Long, Long> catalog) {
        Long of(Long productId) {
            OrgContractPrice p = byProduct.get(productId);
            return p != null ? p.getOverrideAmountMinor() : catalog.apply(productId);
        }

        Long idOf(Long productId) {
            OrgContractPrice p = byProduct.get(productId);
            return p == null ? null : p.getId();
        }
    }
}
