package com.dossier.api.service.ent.billing;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.billing.OrgBillingAccount;
import com.dossier.api.domain.ent.billing.OrgInvoice;
import com.dossier.api.domain.ent.billing.OrgInvoiceLine;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceLineRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceRepository;
import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.pricing.PricingEngine;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Builds an organization's Stripe invoice when a billing period closes (docs/enterprise-v2/ORG-BILLING-BUILD.md step 3a). Both choices are the user's
 * (2026-11-12): <b>Kiwiply builds the invoice</b> at the licences' exact prices, and it bills <b>in advance</b>. When period P closes and N starts, the
 * invoice carries:
 * <ol>
 *   <li><b>N in advance:</b> every licence and add-on live when N starts, at the monthly amount recorded on it (the contract or catalog price it was
 *       given at). A suspended licence is billed too, since it gets no credit (C2).</li>
 *   <li><b>The rest of P:</b> whatever was live during P but not already billed in advance for it, prorated by {@link PricingEngine#prorate} over the
 *       calendar month from when it started, or from the start of billing. That covers what was added during P, and the whole first, partial period. A
 *       removal or an end gives no credit (no refunds).</li>
 *   <li><b>The setup fee</b>, once, on the first invoice: the pending Stripe item made when billing started. If the fee was still unpriced then and has a
 *       published price now, the item is made here.</li>
 * </ol>
 * Stripe does the rest: each line becomes an invoice item and one invoice is created, finalized and sent. It uses {@code send_invoice}, is paid within
 * 15 days, and the customer pays by card or bank transfer on Stripe's page. Every call has an idempotency key from the organization and N's first day,
 * so a retry within Stripe's 24 hours returns the same objects. The job runs hourly so a failed run retries well inside that window. Kiwiply then writes
 * the {@code org_invoice} mirror ({@code source = STRIPE}); the webhooks keep its status.
 */
@Service
public class OrgInvoiceComposer {

    static final int DAYS_TO_PAY = 15;
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.US);
    private static final DateTimeFormatter SHORT = DateTimeFormatter.ofPattern("MMM d", Locale.US);

    /** One invoice line: kind BASE_LICENSE | FEATURE | PRORATION | SETUP_FEE, with its Stripe service period. */
    record Line(String kind, String featureKey, String description, int quantity, long unitMinor, long amountMinor, Instant from, Instant to) {}

    private final ConsultantLicenseRepository licenses;
    private final LicenseFeatureRepository features;
    private final OrgInvoiceRepository invoices;
    private final OrgInvoiceLineRepository invoiceLines;
    private final ProductRepository products;
    private final OrgBillingStartService starts;
    private final StripeGateway stripe;

    public OrgInvoiceComposer(
        ConsultantLicenseRepository licenses,
        LicenseFeatureRepository features,
        OrgInvoiceRepository invoices,
        OrgInvoiceLineRepository invoiceLines,
        ProductRepository products,
        OrgBillingStartService starts,
        StripeGateway stripe
    ) {
        this.licenses = licenses;
        this.features = features;
        this.invoices = invoices;
        this.invoiceLines = invoiceLines;
        this.products = products;
        this.starts = starts;
        this.stripe = stripe;
    }

    /**
     * Invoice period N = [{@code nextStart}, end of that month] in advance, with what P = [{@code pStart}, {@code pEnd}] still owes. Returns whether an
     * invoice was sent. Nothing to bill (nothing priced, no fee) sends none. Stripe failures propagate, so the caller's transaction rolls back and the next
     * run retries with the same keys.
     */
    boolean invoiceInAdvance(OrgBillingAccount a, LocalDate pStart, LocalDate pEnd, Instant now) {
        Long orgId = a.getOrgId();
        LocalDate nStart = pEnd.plusDays(1);
        LocalDate nEnd = nStart.withDayOfMonth(nStart.lengthOfMonth());
        if (invoices.existsByOrgIdAndPeriodStartAndSourceAndKind(orgId, nStart, "STRIPE", "RECURRING")) return false; // already sent (a retry after the commit)
        List<Line> lines = lines(orgId, pStart, pEnd, nStart, nEnd);

        String feeStatus = a.getSetupFeeStatus();
        Long feeAmount = a.getSetupFeeAmountMinor();
        if ("OWED".equals(feeStatus)) {
            Long price = starts.setupFeePrice();
            if (price != null) {
                stripe.createInvoiceItem(a.getStripeCustomerId(), price, currency(a), "Organization setup fee", null, Map.of("kind", "org_setup", "org_id", String.valueOf(orgId)), IdempotencyKey.of("orgsetup", orgId));
                feeStatus = "ADDED";
                feeAmount = price;
            }
        }
        boolean feeOnThis = "ADDED".equals(feeStatus) && feeAmount != null && feeAmount > 0;
        long total = lines.stream().mapToLong(Line::amountMinor).sum();
        if (total <= 0 && !feeOnThis) return false;

        int i = 0;
        for (Line l : lines) {
            stripe.createInvoiceItem(
                a.getStripeCustomerId(),
                l.amountMinor(),
                currency(a),
                l.description(),
                new StripeGateway.Period(l.from(), l.to()),
                Map.of("kind", "org_licence", "org_id", String.valueOf(orgId)),
                IdempotencyKey.of("orginv", orgId, nStart, i++)
            );
        }
        String description = "Kiwiply licences, " + MONTH.format(nStart);
        StripeGateway.InvoiceSummary sent = stripe.createOrgInvoice(
            a.getStripeCustomerId(),
            DAYS_TO_PAY,
            description,
            Map.of("kiwiply_scope", "org", "org_id", String.valueOf(orgId), "period_start", nStart.toString()),
            IdempotencyKey.of("orginv", orgId, nStart)
        );

        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        OrgInvoice inv = new OrgInvoice();
        inv.setOrgId(orgId);
        inv.setInvoiceNumber(number(sent, orgId, nStart));
        inv.setKind("RECURRING");
        inv.setPeriodStart(nStart);
        inv.setPeriodEnd(nEnd);
        inv.setIssueDate(today);
        inv.setDueDate(sent.dueAt() == null ? today.plusDays(DAYS_TO_PAY) : LocalDate.ofInstant(sent.dueAt(), ZoneOffset.UTC));
        inv.setStatus(status(sent.status()));
        inv.setDescription(description);
        inv.setAmountMinor(sent.amountDueMinor() > 0 ? sent.amountDueMinor() : total + (feeOnThis ? feeAmount : 0L));
        inv.setAmountPaidMinor(sent.amountPaidMinor());
        inv.setCurrency(currency(a));
        inv.setSource("STRIPE");
        inv.setStripeInvoiceId(sent.id());
        inv.setHostedUrl(sent.hostedUrl() == null || sent.hostedUrl().length() > 500 ? null : sent.hostedUrl());
        inv = invoices.saveAndFlush(inv);
        int order = 0;
        for (Line l : lines) mirror(inv, l, order++);
        if (feeOnThis) mirror(inv, new Line("SETUP_FEE", null, "Organization setup fee", 1, feeAmount, feeAmount, null, null), order);

        if (feeOnThis) {
            a.setSetupFeeStatus("INVOICED");
            a.setSetupFeeAmountMinor(feeAmount);
            a.setSetupFeeNote("On invoice " + inv.getInvoiceNumber() + ".");
        }
        return true;
    }

    /** The lines of the invoice for N, with what P still owes (see the class comment). Package-private for the tests. */
    List<Line> lines(Long orgId, LocalDate pStart, LocalDate pEnd, LocalDate nStart, LocalDate nEnd) {
        Instant pStartI = at(pStart);
        Instant pEndI = at(pEnd.plusDays(1));
        Instant monthStartI = at(pEnd.withDayOfMonth(1));
        Instant nStartI = at(nStart);
        Instant nEndI = at(nEnd.plusDays(1));
        boolean pBilledInAdvance = invoices.existsByOrgIdAndPeriodStartAndSourceAndKind(orgId, pStart, "STRIPE", "RECURRING");
        Map<String, Product> addOns = new LinkedHashMap<>();
        for (Product p : products.findByKindOrderBySortOrderAsc("FEATURE")) if (p.getFeatureKey() != null) addOns.putIfAbsent(p.getFeatureKey(), p);

        Map<String, long[]> advance = new LinkedHashMap<>(); // kind|key|unit -> {unit, qty}
        Map<String, String[]> advanceLabel = new LinkedHashMap<>();
        Map<String, long[]> catchUp = new LinkedHashMap<>(); // kind|key -> {amount, earliest start epoch}
        Map<String, String[]> catchUpLabel = new LinkedHashMap<>();
        for (ConsultantLicense l : licenses.findByOrgIdAndStatusIn(orgId, List.of("ACTIVE", "SUSPENDED", "CANCEL_AT_PERIOD_END", "ENDED"))) {
            long base = l.getBaseAmountMinor() == null ? 0L : l.getBaseAmountMinor();
            if (base > 0) {
                if (liveAt(l.getStartsAt(), l.getEndsAt(), nStartI) && !"ENDED".equals(l.getStatus())) group(advance, advanceLabel, "BASE_LICENSE|base|" + base, base, 1, "BASE_LICENSE", null, "Base licence");
                owed(catchUp, catchUpLabel, "BASE_LICENSE|base", base, l.getStartsAt(), l.getEndsAt(), pStartI, pEndI, monthStartI, pBilledInAdvance, "BASE_LICENSE", null, "Base licence");
            }
            for (LicenseFeature f : features.findByOrgIdAndLicenseIdOrderByIdAsc(orgId, l.getId())) {
                long unit = f.getUnitAmountMinor() == null ? 0L : f.getUnitAmountMinor();
                if (unit <= 0) continue;
                int qty = Math.max(1, f.getQuantity() == null ? 1 : f.getQuantity());
                Product p = addOns.get(f.getFeatureKey());
                String name = p == null ? f.getFeatureKey() : p.getName();
                if (Boolean.TRUE.equals(f.getLive()) && !"ENDED".equals(l.getStatus()) && liveAt(f.getStartsAt(), f.getEndsAt(), nStartI)) {
                    group(advance, advanceLabel, "FEATURE|" + f.getFeatureKey() + "|" + unit, unit, qty, "FEATURE", f.getFeatureKey(), name);
                }
                owed(catchUp, catchUpLabel, "FEATURE|" + f.getFeatureKey(), unit * qty, f.getStartsAt(), f.getEndsAt(), pStartI, pEndI, monthStartI, pBilledInAdvance, "FEATURE", f.getFeatureKey(), name);
            }
        }
        List<Line> out = new ArrayList<>();
        String month = MONTH.format(nStart);
        for (Map.Entry<String, long[]> e : advance.entrySet()) {
            String[] lb = advanceLabel.get(e.getKey());
            long unit = e.getValue()[0];
            int qty = (int) e.getValue()[1];
            out.add(new Line(lb[0], lb[1], lb[2] + " × " + qty + ", " + month, qty, unit, unit * qty, nStartI, nEndI));
        }
        for (Map.Entry<String, long[]> e : catchUp.entrySet()) {
            if (e.getValue()[0] <= 0) continue;
            String[] lb = catchUpLabel.get(e.getKey());
            Instant from = Instant.ofEpochSecond(e.getValue()[1]);
            String range = SHORT.format(LocalDate.ofInstant(from, ZoneOffset.UTC)) + " to " + SHORT.format(pEnd);
            out.add(new Line("PRORATION", lb[1], "Prorated: " + lb[2] + " (" + range + ")", 1, e.getValue()[0], e.getValue()[0], from, pEndI));
        }
        return out;
    }

    /** What P still owes for one line not billed in advance for it: prorated over the calendar month from when it started (or from P's start). */
    private static void owed(
        Map<String, long[]> catchUp,
        Map<String, String[]> labels,
        String key,
        long monthly,
        Instant start,
        Instant end,
        Instant pStartI,
        Instant pEndI,
        Instant monthStartI,
        boolean pBilledInAdvance,
        String kind,
        String featureKey,
        String name
    ) {
        if (monthly <= 0 || start == null || !start.isBefore(pEndI)) return;
        if (end != null && !end.isAfter(pStartI)) return;
        if (pBilledInAdvance && !start.isAfter(pStartI)) return; // already on P's invoice in advance
        Instant from = start.isAfter(pStartI) ? start : pStartI;
        long amount = PricingEngine.prorate(monthly, 1, monthStartI, pEndI, from);
        if (amount <= 0) return;
        long[] g = catchUp.computeIfAbsent(key, k -> new long[] { 0, from.getEpochSecond() });
        g[0] += amount;
        g[1] = Math.min(g[1], from.getEpochSecond());
        labels.putIfAbsent(key, new String[] { kind, featureKey, name });
    }

    private static void group(Map<String, long[]> groups, Map<String, String[]> labels, String key, long unit, int qty, String kind, String featureKey, String name) {
        long[] g = groups.computeIfAbsent(key, k -> new long[] { unit, 0 });
        g[1] += qty;
        labels.putIfAbsent(key, new String[] { kind, featureKey, name });
    }

    private void mirror(OrgInvoice inv, Line l, int order) {
        OrgInvoiceLine line = new OrgInvoiceLine();
        line.setOrgId(inv.getOrgId());
        line.setInvoiceId(inv.getId());
        line.setLineKind(l.kind());
        line.setFeatureKey(l.featureKey());
        line.setDescription(l.description().length() > 200 ? l.description().substring(0, 200) : l.description());
        line.setQuantity(l.quantity());
        line.setUnitAmountMinor(l.unitMinor());
        line.setAmountMinor(l.amountMinor());
        line.setSortOrder(order);
        invoiceLines.save(line);
    }

    private static boolean liveAt(Instant start, Instant end, Instant at) {
        return start != null && !start.isAfter(at) && (end == null || end.isAfter(at));
    }

    private static Instant at(LocalDate d) {
        return d.atStartOfDay(ZoneOffset.UTC).toInstant();
    }

    private static String currency(OrgBillingAccount a) {
        return a.getCurrency() == null || a.getCurrency().isBlank() ? "USD" : a.getCurrency();
    }

    /** Stripe's own invoice number (it fits the 20-character column); a stable fallback when Stripe gave none. */
    private static String number(StripeGateway.InvoiceSummary sent, Long orgId, LocalDate nStart) {
        String n = sent.number();
        if (n == null || n.isBlank()) n = "ORG" + orgId + "-" + nStart.toString().replace("-", "").substring(0, 6);
        return n.length() > 20 ? n.substring(0, 20) : n;
    }

    /** Stripe's invoice status in the mirror's words. */
    static String status(String stripeStatus) {
        if (stripeStatus == null) return "OPEN";
        return switch (stripeStatus) {
            case "paid" -> "PAID";
            case "void" -> "VOID";
            case "uncollectible" -> "WRITTEN_OFF"; // the status column holds 12 characters
            case "draft" -> "DRAFT";
            default -> "OPEN";
        };
    }
}
