package com.dossier.api.service.ent.billing;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.LicenseChange;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.billing.OrgBillingAccount;
import com.dossier.api.domain.ent.billing.OrgInvoice;
import com.dossier.api.domain.ent.billing.OrgInvoiceLine;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseChangeRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.billing.OrgBillingAccountRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceLineRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The end of an organization's billing period (docs/enterprise-v2/ORG-BILLING-BUILD.md step 2, the local rollover moved here from 1b). For every
 * billing account whose period has ended, in one transaction per organization:
 * <ol>
 *   <li><b>Removals whose date has come</b> are finished: the PENDING {@code license_change} becomes APPLIED, and its add-on goes off for good. It already
 *       stopped working at {@code ends_at}; this only closes the record.</li>
 *   <li><b>While billing is local</b> (no Stripe customer), an <b>Estimate</b> invoice ({@code source = LOCAL}) is written for the closed period. It holds
 *       the monthly amounts recorded on the licences that were live at its end, so the Invoices page has a history. No money moves. When nothing is
 *       priced, no invoice is written (never a $0 invoice).</li>
 *   <li>The period moves on, one calendar month at a time, until it holds today. A missed run catches up.</li>
 * </ol>
 * Once Stripe bills the organization (its account has a Stripe customer), step 3a applies instead: {@link OrgInvoiceComposer} sends the invoice for the
 * period that starts, in advance, with what the closed one still owes (no estimate is written). While {@code enterprise.billing.stripe_enabled} is off
 * such an organization is left as it is, so no period passes unbilled; it is invoiced on the first run after Stripe is on again.
 *
 * <p>Every run also marks overdue organizations: a Stripe-billed account with an open invoice past its due date is PAST_DUE until it is paid, then
 * ACTIVE again (nothing is switched off; that is a dunning decision still to be made).
 */
@Service
public class OrgBillingPeriodService {

    private static final Logger LOG = LoggerFactory.getLogger(OrgBillingPeriodService.class);
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.US);
    static final int DAYS_TO_PAY = 15;

    public record RunResult(int organizations, int invoices, int removals, int failed) {
        int total() {
            return organizations + failed;
        }
    }

    private record One(int invoices, int removals) {}

    private final JdbcTemplate jdbc;
    private final OrgBillingAccountRepository accounts;
    private final LicenseChangeRepository changes;
    private final LicenseFeatureRepository features;
    private final ConsultantLicenseRepository licenses;
    private final OrgInvoiceRepository invoices;
    private final OrgInvoiceLineRepository lines;
    private final ProductRepository products;
    private final OrganizationRepository organizations;
    private final OrgInvoiceComposer composer;
    private final OrgBillingStartService starts;
    private final TransactionTemplate tx;

    public OrgBillingPeriodService(
        JdbcTemplate jdbc,
        OrgBillingAccountRepository accounts,
        LicenseChangeRepository changes,
        LicenseFeatureRepository features,
        ConsultantLicenseRepository licenses,
        OrgInvoiceRepository invoices,
        OrgInvoiceLineRepository lines,
        ProductRepository products,
        OrganizationRepository organizations,
        OrgInvoiceComposer composer,
        OrgBillingStartService starts,
        PlatformTransactionManager txManager
    ) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.changes = changes;
        this.features = features;
        this.licenses = licenses;
        this.invoices = invoices;
        this.lines = lines;
        this.products = products;
        this.organizations = organizations;
        this.composer = composer;
        this.starts = starts;
        this.tx = new TransactionTemplate(txManager);
    }

    /** Roll every account whose period ended before today (UTC). One organization's failure is logged and does not stop the others. */
    public RunResult runDue(Instant now) {
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        List<Long> due = jdbc.queryForList("select org_id from org_billing_account where current_period_end is not null and current_period_end < ? order by org_id", Long.class, today);
        int orgs = 0;
        int invoiceCount = 0;
        int removals = 0;
        int failed = 0;
        for (Long orgId : due) {
            try {
                One r = tx.execute(s -> rollOne(orgId, now));
                if (r == null) continue;
                orgs++;
                invoiceCount += r.invoices();
                removals += r.removals();
            } catch (RuntimeException e) {
                failed++;
                LOG.warn("Billing period rollover failed for organization {}", orgId, e);
            }
        }
        overdue(now);
        return new RunResult(orgs, invoiceCount, removals, failed);
    }

    /** PAST_DUE while a Stripe-billed organization has an open invoice past its due date; ACTIVE again once none is. */
    void overdue(Instant now) {
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        for (Long orgId : jdbc.queryForList("select org_id from org_billing_account where stripe_customer_id is not null order by org_id", Long.class)) {
            try {
                tx.executeWithoutResult(s -> {
                    OrgBillingAccount a = accounts.findFirstByOrgId(orgId).orElse(null);
                    if (a == null) return;
                    boolean late = invoices.findByOrgIdAndSourceAndStatus(orgId, "STRIPE", "OPEN").stream().anyMatch(i -> i.getDueDate() != null && i.getDueDate().isBefore(today));
                    String want = late ? "PAST_DUE" : "ACTIVE";
                    if (("ACTIVE".equals(a.getStatus()) || "PAST_DUE".equals(a.getStatus())) && !want.equals(a.getStatus())) {
                        a.setStatus(want);
                        a.setUpdatedAt(now);
                        accounts.save(a);
                    }
                });
            } catch (RuntimeException e) {
                LOG.warn("Overdue check failed for organization {}", orgId, e);
            }
        }
    }

    /** One organization, inside the caller's transaction. Null when it has no account (anymore). */
    One rollOne(Long orgId, Instant now) {
        OrgBillingAccount a = accounts.findFirstByOrgId(orgId).orElse(null);
        if (a == null || a.getCurrentPeriodEnd() == null || a.getCurrentPeriodStart() == null) return null;
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        int removals = finishRemovals(orgId, now);
        int written = 0;
        boolean local = a.getStripeCustomerId() == null || a.getStripeCustomerId().isBlank();
        if (!local && !starts.stripeReady()) {
            LOG.warn("Organization {} is billed by Stripe but Stripe is off: its period is kept open until Stripe is on again", orgId);
            return new One(0, removals);
        }
        while (a.getCurrentPeriodEnd().isBefore(today)) {
            LocalDate start = a.getCurrentPeriodStart();
            LocalDate end = a.getCurrentPeriodEnd();
            if (local ? estimate(a, start, end) : composer.invoiceInAdvance(a, start, end, now)) written++;
            LocalDate next = end.plusDays(1);
            a.setCurrentPeriodStart(next);
            a.setCurrentPeriodEnd(next.withDayOfMonth(next.lengthOfMonth()));
            a.setNextInvoiceOn(a.getCurrentPeriodEnd().plusDays(1));
        }
        a.setUpdatedAt(now);
        accounts.save(a);
        return new One(written, removals);
    }

    private int finishRemovals(Long orgId, Instant now) {
        int n = 0;
        for (LicenseChange ch : changes.findByOrgIdAndStatus(orgId, "PENDING")) {
            if (ch.getEffectiveAt().isAfter(now)) continue;
            ch.setStatus("APPLIED");
            ch.setAppliedAt(now);
            changes.save(ch);
            if (ch.getFeatureKey() != null) {
                for (LicenseFeature f : features.findByOrgIdAndLicenseIdOrderByIdAsc(orgId, ch.getLicenseId())) {
                    if (!ch.getFeatureKey().equals(f.getFeatureKey()) || !Boolean.TRUE.equals(f.getLive()) || f.getEndsAt() == null || f.getEndsAt().isAfter(now)) continue;
                    f.setLive(false);
                    features.save(f);
                }
            }
            n++;
        }
        return n;
    }

    /** The estimate of a closed period from the licences live at its end. Returns whether one was written. */
    boolean estimate(OrgBillingAccount a, LocalDate start, LocalDate end) {
        Long orgId = a.getOrgId();
        Instant endsAt = end.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant lastMoment = endsAt.minusSeconds(1);
        Map<String, Product> addOns = new LinkedHashMap<>();
        for (Product p : products.findByKindOrderBySortOrderAsc("FEATURE")) if (p.getFeatureKey() != null) addOns.putIfAbsent(p.getFeatureKey(), p);
        // (kind, key, unit) -> quantity, in a stable order: the base licence first, then add-ons by catalog order
        Map<String, long[]> groups = new LinkedHashMap<>();
        Map<String, String[]> labels = new LinkedHashMap<>();
        for (ConsultantLicense l : licenses.findByOrgIdAndStatusIn(orgId, List.of("ACTIVE", "SUSPENDED", "CANCEL_AT_PERIOD_END", "ENDED"))) {
            if (l.getStartsAt() == null || !l.getStartsAt().isBefore(endsAt)) continue;
            if (l.getEndsAt() != null && !l.getEndsAt().isAfter(lastMoment)) continue;
            long base = l.getBaseAmountMinor() == null ? 0L : l.getBaseAmountMinor();
            if (base > 0) add(groups, labels, "BASE_LICENSE|base|" + base, base, 1, "BASE_LICENSE", null, "Base licence");
            for (LicenseFeature f : features.findByOrgIdAndLicenseIdOrderByIdAsc(orgId, l.getId())) {
                if (f.getStartsAt() != null && !f.getStartsAt().isBefore(endsAt)) continue;
                if (f.getEndsAt() != null && !f.getEndsAt().isAfter(lastMoment)) continue;
                long unit = f.getUnitAmountMinor() == null ? 0L : f.getUnitAmountMinor();
                if (unit <= 0) continue;
                int qty = Math.max(1, f.getQuantity() == null ? 1 : f.getQuantity());
                Product p = addOns.get(f.getFeatureKey());
                add(groups, labels, "FEATURE|" + f.getFeatureKey() + "|" + unit, unit, qty, "FEATURE", f.getFeatureKey(), p == null ? f.getFeatureKey() : p.getName());
            }
        }
        long total = 0;
        for (long[] g : groups.values()) total += g[0] * g[1];
        if (total <= 0) return false;
        OrgInvoice inv = new OrgInvoice();
        inv.setOrgId(orgId);
        inv.setInvoiceNumber(number(orgId));
        inv.setKind("RECURRING");
        inv.setPeriodStart(start);
        inv.setPeriodEnd(end);
        inv.setIssueDate(end.plusDays(1));
        inv.setDueDate(end.plusDays(1 + DAYS_TO_PAY));
        inv.setStatus("OPEN");
        inv.setDescription(MONTH.format(start) + " (estimate)");
        inv.setAmountMinor(total);
        inv.setAmountPaidMinor(0L);
        inv.setCurrency(a.getCurrency() == null ? "USD" : a.getCurrency());
        inv.setSource("LOCAL");
        inv = invoices.saveAndFlush(inv);
        int order = 0;
        for (Map.Entry<String, long[]> e : groups.entrySet()) {
            String[] label = labels.get(e.getKey());
            OrgInvoiceLine line = new OrgInvoiceLine();
            line.setOrgId(orgId);
            line.setInvoiceId(inv.getId());
            line.setLineKind(label[0]);
            line.setFeatureKey(label[1]);
            line.setDescription(label[2]);
            line.setQuantity((int) e.getValue()[1]);
            line.setUnitAmountMinor(e.getValue()[0]);
            line.setAmountMinor(e.getValue()[0] * e.getValue()[1]);
            line.setSortOrder(order++);
            lines.save(line);
        }
        return true;
    }

    private static void add(Map<String, long[]> groups, Map<String, String[]> labels, String key, long unit, int qty, String kind, String featureKey, String description) {
        long[] g = groups.computeIfAbsent(key, k -> new long[] { unit, 0 });
        g[1] += qty;
        labels.putIfAbsent(key, new String[] { kind, featureKey, description });
    }

    /** "ACME-E0003": the organization's slug (12 characters at most), E for estimate, and its next invoice count (Stripe's own numbers never start with it). */
    private String number(Long orgId) {
        String slug = organizations.findByOrgId(orgId).map(o -> o.getSlug()).orElse("ORG" + orgId);
        String prefix = slug.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        if (prefix.isEmpty()) prefix = "ORG" + orgId;
        if (prefix.length() > 12) prefix = prefix.substring(0, 12);
        return prefix + "-E" + String.format(Locale.ROOT, "%04d", invoices.countByOrgId(orgId) + 1);
    }
}
