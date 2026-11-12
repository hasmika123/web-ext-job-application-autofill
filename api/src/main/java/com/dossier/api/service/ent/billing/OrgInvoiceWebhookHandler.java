package com.dossier.api.service.ent.billing;

import com.dossier.api.domain.ent.billing.OrgBillingAccount;
import com.dossier.api.domain.ent.billing.OrgInvoice;
import com.dossier.api.repository.ent.billing.OrgBillingAccountRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceLineRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceRepository;
import com.dossier.api.service.billing.OrgBillingWebhookHandler;
import com.dossier.api.service.billing.StripeWebhookEvent;
import com.dossier.api.service.org.OrgAuditService;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Organization invoice events from Stripe (docs/enterprise-v2/26 s7, ORG-BILLING-BUILD.md step 3a). Called by the webhook service inside its apply
 * transaction, once per verified, non-duplicate organization event. It keeps the {@code org_invoice} mirror that {@link OrgInvoiceComposer} wrote:
 * <ul>
 *   <li>{@code invoice.paid}: the invoice is PAID with its amount and date; the account is paid through the invoice's period and is ACTIVE again when
 *       nothing else is overdue; a setup fee on it is PAID.</li>
 *   <li>{@code invoice.payment_failed} and {@code invoice.overdue}: the account is PAST_DUE. Nothing is switched off: that is a dunning decision still to
 *       be made.</li>
 *   <li>{@code invoice.voided} / {@code invoice.marked_uncollectible}: VOID / WRITTEN_OFF.</li>
 *   <li>Other {@code invoice.*} events refresh the number and the hosted page.</li>
 * </ul>
 * A paid, void or written-off mirror is never moved back by a late event. The event's customer must be the organization's own customer, so metadata
 * alone cannot point an event at another organization. An invoice Kiwiply did not compose (no mirror) is only logged.
 */
@Component
public class OrgInvoiceWebhookHandler implements OrgBillingWebhookHandler {

    private static final Logger LOG = LoggerFactory.getLogger(OrgInvoiceWebhookHandler.class);
    static final String ACTOR = "stripe";
    private static final Set<String> FINAL = Set.of("PAID", "VOID", "WRITTEN_OFF");

    private final OrgBillingAccountCustomerLookup customers;
    private final OrgBillingAccountRepository accounts;
    private final OrgInvoiceRepository invoices;
    private final OrgInvoiceLineRepository lines;
    private final OrgAuditService audit;

    public OrgInvoiceWebhookHandler(
        OrgBillingAccountCustomerLookup customers,
        OrgBillingAccountRepository accounts,
        OrgInvoiceRepository invoices,
        OrgInvoiceLineRepository lines,
        OrgAuditService audit
    ) {
        this.customers = customers;
        this.accounts = accounts;
        this.invoices = invoices;
        this.lines = lines;
        this.audit = audit;
    }

    @Override
    public void apply(StripeWebhookEvent event) {
        StripeWebhookEvent.InvoiceInfo info = event.invoice();
        if (info == null || info.id() == null || event.type() == null || !event.type().startsWith("invoice.")) return;
        Long orgId = customers.orgOf(event.customerId());
        if (orgId == null || (event.orgId() != null && !event.orgId().equals(orgId))) {
            LOG.warn("Stripe event {} ({}) names no organization customer of ours, or another organization: ignored", event.id(), event.type());
            return;
        }
        OrgBillingAccount account = accounts.findFirstByOrgId(orgId).orElse(null);
        Optional<OrgInvoice> found = invoices.findByOrgIdAndStripeInvoiceId(orgId, info.id());
        if (account == null || found.isEmpty()) {
            LOG.info("Stripe event {} ({}) is about an invoice Kiwiply did not compose: recorded, nothing to mirror", event.id(), event.type());
            return;
        }
        OrgInvoice inv = found.get();
        Instant at = event.created() == null ? Instant.now() : event.created();
        if (info.number() != null && !info.number().isBlank()) inv.setInvoiceNumber(info.number().length() > 20 ? info.number().substring(0, 20) : info.number());
        if (info.hostedUrl() != null && info.hostedUrl().length() <= 500) inv.setHostedUrl(info.hostedUrl());
        switch (event.type()) {
            case "invoice.paid" -> paid(account, inv, info, at);
            case "invoice.payment_failed", "invoice.overdue" -> late(account, inv, event.type(), at);
            case "invoice.voided" -> settle(inv, "VOID");
            case "invoice.marked_uncollectible" -> settle(inv, "WRITTEN_OFF");
            default -> {
                // finalized / sent / updated: the number and the page are refreshed above
            }
        }
        invoices.save(inv);
    }

    private void paid(OrgBillingAccount a, OrgInvoice inv, StripeWebhookEvent.InvoiceInfo info, Instant at) {
        inv.setStatus("PAID");
        inv.setAmountPaidMinor(info.amountPaid() > 0 ? info.amountPaid() : inv.getAmountMinor());
        inv.setPaidAt(info.paidAt() != null ? info.paidAt() : at);
        if (a.getPaidThroughOn() == null || inv.getPeriodEnd().isAfter(a.getPaidThroughOn())) a.setPaidThroughOn(inv.getPeriodEnd());
        boolean fee = lines.findByOrgIdAndInvoiceIdOrderBySortOrderAsc(inv.getOrgId(), inv.getId()).stream().anyMatch(l -> "SETUP_FEE".equals(l.getLineKind()));
        if (fee && !"WAIVED".equals(a.getSetupFeeStatus())) {
            a.setSetupFeeStatus("PAID");
            a.setSetupFeeNote("Paid with invoice " + inv.getInvoiceNumber() + ".");
        }
        if ("PAST_DUE".equals(a.getStatus()) && !stillLate(inv)) {
            a.setStatus("ACTIVE");
            a.setFeaturesPausedFrom(null); // paying lifts the pause at once (step 3b)
            a.setLastReminderAt(null);
        }
        a.setUpdatedAt(at);
        accounts.save(a);
        audit.record(inv.getOrgId(), ACTOR, null, OrgAuditService.BILLING_INVOICE_PAID, OrgAuditService.TARGET_ORG, null, String.valueOf(inv.getOrgId()), "invoice " + inv.getInvoiceNumber() + " paid", null);
    }

    private void late(OrgBillingAccount a, OrgInvoice inv, String type, Instant at) {
        if (FINAL.contains(inv.getStatus())) return;
        if (!"PAST_DUE".equals(a.getStatus())) {
            a.setStatus("PAST_DUE");
            a.setUpdatedAt(at);
            accounts.save(a);
        }
        audit.record(inv.getOrgId(), ACTOR, null, OrgAuditService.BILLING_PAYMENT_LATE, OrgAuditService.TARGET_ORG, null, String.valueOf(inv.getOrgId()),
            "invoice " + inv.getInvoiceNumber() + ("invoice.overdue".equals(type) ? " is overdue" : ": a payment failed"), null);
    }

    private static void settle(OrgInvoice inv, String status) {
        if (!"PAID".equals(inv.getStatus())) inv.setStatus(status);
    }

    /** Whether another of the organization's Stripe invoices is still open past its due date. */
    private boolean stillLate(OrgInvoice paid) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        return invoices.findByOrgIdAndSourceAndStatus(paid.getOrgId(), "STRIPE", "OPEN").stream()
            .anyMatch(i -> !i.getId().equals(paid.getId()) && i.getDueDate() != null && i.getDueDate().isBefore(today));
    }
}
