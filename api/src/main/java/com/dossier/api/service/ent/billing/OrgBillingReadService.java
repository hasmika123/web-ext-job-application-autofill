package com.dossier.api.service.ent.billing;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.billing.OrgBillingAccount;
import com.dossier.api.domain.ent.billing.OrgContract;
import com.dossier.api.domain.ent.billing.OrgInvoice;
import com.dossier.api.domain.ent.billing.OrgInvoiceLine;
import com.dossier.api.domain.ent.billing.OrgPayment;
import com.dossier.api.domain.ent.billing.OrgPaymentMethod;
import com.dossier.api.domain.ent.billing.OrgSubscription;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.billing.OrgBillingAccountRepository;
import com.dossier.api.repository.ent.billing.OrgContractRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceLineRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceRepository;
import com.dossier.api.repository.ent.billing.OrgPaymentMethodRepository;
import com.dossier.api.repository.ent.billing.OrgPaymentRepository;
import com.dossier.api.repository.ent.billing.OrgSubscriptionItemRepository;
import com.dossier.api.repository.ent.billing.OrgSubscriptionRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.ent.consultants.ConsultantAccess;
import com.dossier.api.service.ent.licenses.OrgLicenseService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The organization billing pages, read-only (docs/enterprise-v2/ORG-BILLING-BUILD.md step 1a, OBL-01): Subscription Overview, and Billing &amp; Invoices.
 * Reads the mirror tables and the consultant licences; never calls Stripe and never writes. Every organization without a billing account (all of
 * them until Stripe is connected, step 2) reads as {@code SETUP}: licences can be given, nothing is billed. Rows with {@code source = LOCAL} are
 * estimates (no money moved). The {@code billing} module off, or {@code billing.view} missing, is the generic 404.
 */
@Service
public class OrgBillingReadService {

    public static final String VIEW = "billing.view";
    /** C3 (2026-11-11 default): Stripe Tax is off until the user registers for tax. */
    public static final String TAX_NOTE = "Taxes aren't calculated yet.";
    static final int PAGE_SIZE = 25;

    public record Tiles(int consultants, int licensed, int unlicensed) {}

    public record Ending(Long consultantId, String name, String what, Instant endsAt) {}

    public record ContractSummary(String name, String reference, String status, Instant startsAt, Instant endsAt, String billingInterval) {}

    public record Overdue(int invoices, long amountMinor, LocalDate oldestDueOn) {}

    public record Overview(
        String orgName,
        String status,
        boolean billingConnected,
        String currency,
        Tiles tiles,
        Long monthlyRecurringMinor,
        boolean priceSet,
        LocalDate nextInvoiceOn,
        Long nextInvoiceEstimateMinor,
        boolean estimate,
        List<Ending> ending,
        ContractSummary contract,
        Overdue overdue,
        String taxNote
    ) {}

    public record Account(
        String status,
        String currency,
        String collectionMethod,
        String billingCycle,
        LocalDate periodStart,
        LocalDate periodEnd,
        LocalDate nextInvoiceOn,
        LocalDate paidThroughOn,
        String source
    ) {}

    public record PaymentMethod(String kind, String brand, String last4, Integer expMonth, Integer expYear) {}

    public record Billing(String orgName, String status, boolean billingConnected, Account account, PaymentMethod paymentMethod, ContractSummary contract, String taxNote) {}

    public record InvoiceRow(
        Long id,
        String number,
        String kind,
        LocalDate periodStart,
        LocalDate periodEnd,
        LocalDate issueDate,
        LocalDate dueDate,
        String status,
        long amountMinor,
        long amountPaidMinor,
        String currency,
        boolean estimate,
        boolean overdue
    ) {}

    public record InvoicePage(List<InvoiceRow> rows, int page, int size, long total) {}

    public record Line(String kind, String description, String detail, int quantity, Long unitAmountMinor, long amountMinor) {}

    public record Payment(long amountMinor, String currency, String status, String kind, Instant occurredAt, String failureReason) {}

    public record InvoiceDetail(InvoiceRow invoice, String description, List<Line> lines, List<Payment> payments) {}

    private static final Set<String> INVOICE_STATUSES = Set.of("DRAFT", "OPEN", "PAID", "VOID", "UNCOLLECTIBLE");

    private final OrganizationRepository orgs;
    private final OrgBillingAccountRepository accounts;
    private final OrgSubscriptionRepository subscriptions;
    private final OrgSubscriptionItemRepository items;
    private final OrgInvoiceRepository invoices;
    private final OrgInvoiceLineRepository lines;
    private final OrgPaymentRepository payments;
    private final OrgPaymentMethodRepository methods;
    private final OrgContractRepository contracts;
    private final ConsultantLicenseRepository licenses;
    private final LicenseFeatureRepository features;
    private final OrgLicenseService licenseRows;
    private final TenantModules modules;
    private final ConsultantAccess access;
    private Clock clock = Clock.systemUTC();

    public OrgBillingReadService(
        OrganizationRepository orgs,
        OrgBillingAccountRepository accounts,
        OrgSubscriptionRepository subscriptions,
        OrgSubscriptionItemRepository items,
        OrgInvoiceRepository invoices,
        OrgInvoiceLineRepository lines,
        OrgPaymentRepository payments,
        OrgPaymentMethodRepository methods,
        OrgContractRepository contracts,
        ConsultantLicenseRepository licenses,
        LicenseFeatureRepository features,
        OrgLicenseService licenseRows,
        TenantModules modules,
        ConsultantAccess access
    ) {
        this.orgs = orgs;
        this.accounts = accounts;
        this.subscriptions = subscriptions;
        this.items = items;
        this.invoices = invoices;
        this.lines = lines;
        this.payments = payments;
        this.methods = methods;
        this.contracts = contracts;
        this.licenses = licenses;
        this.features = features;
        this.licenseRows = licenseRows;
        this.modules = modules;
        this.access = access;
    }

    /** Tests pin the time. */
    void setClock(Clock clock) {
        this.clock = clock;
    }

    /** The billing module on and the caller holds {@code key}; otherwise the generic 404. Shared with {@link OrgUsageReadService}. */
    void gate(OrgMembership me, String key) {
        if (me == null || !modules.isOn(TenantModule.BILLING, me.orgId())) throw new OrgNotFoundException();
        access.require(me, key);
    }

    // ---------------------------------------------------------------------------------------------- overview

    @Transactional(readOnly = true)
    public Overview overview(OrgMembership me) {
        gate(me, VIEW);
        Long orgId = me.orgId();
        Instant now = Instant.now(clock);
        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();

        List<OrgLicenseService.Row> rows = licenseRows.rowsFor(orgId);
        int licensed = 0;
        long recurring = 0;
        boolean priceSet = false;
        String currency = null;
        Map<Long, String> names = new HashMap<>();
        List<Ending> ending = new ArrayList<>();
        for (OrgLicenseService.Row r : rows) {
            names.put(r.consultantId(), r.name());
            boolean holds = r.status() == OrgLicenseService.Status.ACTIVE || r.status() == OrgLicenseService.Status.SUSPENDED || r.status() == OrgLicenseService.Status.ENDING;
            if (!holds) continue;
            licensed++;
            if (r.priceSet() && r.monthlyMinor() != null) {
                priceSet = true;
                recurring += r.monthlyMinor();
            }
            if (r.status() == OrgLicenseService.Status.ENDING && r.endsAt() != null) ending.add(new Ending(r.consultantId(), r.name(), "Licence", r.endsAt()));
        }
        ending.addAll(featuresEnding(orgId, names, now));
        ending.sort(Comparator.comparing(Ending::endsAt));

        Optional<OrgBillingAccount> account = accounts.findFirstByOrgId(orgId);
        Optional<OrgSubscription> sub = subscriptions.findFirstByOrgIdOrderByIdDesc(orgId);
        if (account.isPresent()) currency = account.get().getCurrency();
        Long nextEstimate = null;
        if (account.isPresent()) {
            nextEstimate = sub.map(s -> items.sumMonthlyMinor(orgId, s.getId())).filter(v -> v > 0).orElse(priceSet ? recurring : null);
        }
        List<OrgInvoice> late = invoices.findOverdue(orgId, today);
        Overdue overdue = late.isEmpty()
            ? null
            : new Overdue(late.size(), late.stream().mapToLong(i -> nz(i.getAmountMinor()) - nz(i.getAmountPaidMinor())).sum(), late.stream().map(OrgInvoice::getDueDate).filter(d -> d != null).min(LocalDate::compareTo).orElse(null));

        return new Overview(
            orgName(orgId),
            status(account),
            connected(account),
            currency == null ? "USD" : currency,
            new Tiles(rows.size(), licensed, rows.size() - licensed),
            priceSet ? recurring : null,
            priceSet,
            account.map(OrgBillingAccount::getNextInvoiceOn).orElse(null),
            nextEstimate,
            account.map(a -> "LOCAL".equals(a.getSource())).orElse(true),
            ending.size() > 20 ? ending.subList(0, 20) : ending,
            contract(orgId),
            overdue,
            TAX_NOTE
        );
    }

    /** Add-ons that stop at a set time (removed to the end of the period), with the consultant's name. */
    private List<Ending> featuresEnding(Long orgId, Map<Long, String> names, Instant now) {
        List<Ending> out = new ArrayList<>();
        Map<Long, ConsultantLicense> byId = new HashMap<>();
        for (LicenseFeature f : features.findByOrgIdAndLive(orgId, true)) {
            if (f.getEndsAt() == null || !f.getEndsAt().isAfter(now)) continue;
            ConsultantLicense l = byId.computeIfAbsent(f.getLicenseId(), id -> licenses.findByOrgIdAndId(orgId, id).orElse(null));
            if (l == null || "ENDED".equals(l.getStatus()) || !names.containsKey(l.getConsultantId())) continue;
            out.add(new Ending(l.getConsultantId(), names.get(l.getConsultantId()), f.getFeatureKey(), f.getEndsAt()));
        }
        return out;
    }

    // ---------------------------------------------------------------------------------------------- billing & invoices

    @Transactional(readOnly = true)
    public Billing billing(OrgMembership me) {
        gate(me, VIEW);
        Long orgId = me.orgId();
        Optional<OrgBillingAccount> account = accounts.findFirstByOrgId(orgId);
        Account a = account
            .map(x -> new Account(x.getStatus(), x.getCurrency(), x.getCollectionMethod(), x.getBillingCycle(), x.getCurrentPeriodStart(), x.getCurrentPeriodEnd(), x.getNextInvoiceOn(), x.getPaidThroughOn(), x.getSource()))
            .orElse(null);
        PaymentMethod pm = methods
            .findFirstByOrgIdAndDefaultMethodTrueAndStatus(orgId, "ACTIVE")
            .or(() -> methods.findByOrgIdAndStatusOrderByDefaultMethodDescIdAsc(orgId, "ACTIVE").stream().findFirst())
            .map(OrgBillingReadService::method)
            .orElse(null);
        return new Billing(orgName(orgId), status(account), connected(account), a, pm, contract(orgId), TAX_NOTE);
    }

    @Transactional(readOnly = true)
    public InvoicePage invoices(OrgMembership me, String status, int page) {
        gate(me, VIEW);
        Long orgId = me.orgId();
        int p = Math.max(0, page);
        LocalDate today = LocalDate.now(clock.withZone(ZoneOffset.UTC));
        String s = status == null || status.isBlank() ? null : status.trim().toUpperCase(java.util.Locale.ROOT);
        if (s != null && !INVOICE_STATUSES.contains(s)) s = null;
        Page<OrgInvoice> rows = s == null
            ? invoices.findByOrgIdOrderByIssueDateDescIdDesc(orgId, PageRequest.of(p, PAGE_SIZE))
            : invoices.findByOrgIdAndStatusOrderByIssueDateDescIdDesc(orgId, s, PageRequest.of(p, PAGE_SIZE));
        return new InvoicePage(rows.getContent().stream().map(i -> row(i, today)).toList(), p, PAGE_SIZE, rows.getTotalElements());
    }

    @Transactional(readOnly = true)
    public InvoiceDetail invoice(OrgMembership me, Long invoiceId) {
        gate(me, VIEW);
        Long orgId = me.orgId();
        if (invoiceId == null) throw new OrgNotFoundException();
        OrgInvoice i = invoices.findByOrgIdAndId(orgId, invoiceId).orElseThrow(OrgNotFoundException::new);
        LocalDate today = LocalDate.now(clock.withZone(ZoneOffset.UTC));
        List<Line> ls = new ArrayList<>();
        for (OrgInvoiceLine l : lines.findByOrgIdAndInvoiceIdOrderBySortOrderAsc(orgId, i.getId())) {
            ls.add(new Line(l.getLineKind(), l.getDescription(), l.getDetail(), l.getQuantity() == null ? 1 : l.getQuantity(), l.getUnitAmountMinor(), nz(l.getAmountMinor())));
        }
        List<Payment> ps = new ArrayList<>();
        for (OrgPayment p : payments.findByOrgIdAndInvoiceIdOrderByOccurredAtAsc(orgId, i.getId())) {
            ps.add(new Payment(nz(p.getAmountMinor()), p.getCurrency(), p.getStatus(), p.getKind(), p.getOccurredAt(), p.getFailureReason()));
        }
        return new InvoiceDetail(row(i, today), i.getDescription(), ls, ps);
    }

    // ---------------------------------------------------------------------------------------------- helpers

    /** {@code SETUP} until the organization has a billing account; then the account's own status (ACTIVE, PAST_DUE, SUSPENDED, ...). */
    static String status(Optional<OrgBillingAccount> account) {
        return account.map(OrgBillingAccount::getStatus).filter(s -> s != null && !s.isBlank()).orElse("SETUP");
    }

    /** Money really moves only through Stripe (step 2): a LOCAL account is a record of what would be billed. */
    static boolean connected(Optional<OrgBillingAccount> account) {
        return account.map(a -> "STRIPE".equals(a.getSource())).orElse(false);
    }

    private ContractSummary contract(Long orgId) {
        return contracts
            .findFirstByOrgIdAndStatus(orgId, "ACTIVE")
            .map((OrgContract c) -> new ContractSummary(c.getName(), c.getReference(), c.getStatus(), c.getStartsAt(), c.getEndsAt(), c.getBillingInterval()))
            .orElse(null);
    }

    private String orgName(Long orgId) {
        return orgs.findByOrgId(orgId).map(o -> o.getName()).orElse("");
    }

    private static PaymentMethod method(OrgPaymentMethod m) {
        return new PaymentMethod(m.getKind(), m.getBrand(), m.getLast4(), m.getExpMonth(), m.getExpYear());
    }

    private static InvoiceRow row(OrgInvoice i, LocalDate today) {
        boolean overdue = "OPEN".equals(i.getStatus()) && i.getDueDate() != null && i.getDueDate().isBefore(today);
        return new InvoiceRow(
            i.getId(),
            i.getInvoiceNumber(),
            i.getKind(),
            i.getPeriodStart(),
            i.getPeriodEnd(),
            i.getIssueDate(),
            i.getDueDate(),
            i.getStatus(),
            nz(i.getAmountMinor()),
            nz(i.getAmountPaidMinor()),
            i.getCurrency(),
            "LOCAL".equals(i.getSource()),
            overdue
        );
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
