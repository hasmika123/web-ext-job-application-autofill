package com.dossier.api.service.ent.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.billing.OrgBillingAccount;
import com.dossier.api.domain.ent.billing.OrgInvoice;
import com.dossier.api.domain.ent.billing.OrgInvoiceLine;
import com.dossier.api.repository.ent.billing.OrgBillingAccountRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceLineRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceRepository;
import com.dossier.api.service.billing.StripeWebhookEvent;
import com.dossier.api.service.org.OrgAuditService;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** ORG-BILLING-BUILD.md step 3a: Stripe's invoice events keep the organization's invoice mirror and account status. */
class OrgInvoiceWebhookHandlerTest {

    static final Long ORG = 7L;

    OrgBillingAccountCustomerLookup customers = mock(OrgBillingAccountCustomerLookup.class);
    OrgBillingAccountRepository accounts = mock(OrgBillingAccountRepository.class);
    OrgInvoiceRepository invoices = mock(OrgInvoiceRepository.class);
    OrgInvoiceLineRepository lines = mock(OrgInvoiceLineRepository.class);
    OrgAuditService audit = mock(OrgAuditService.class);
    OrgInvoiceWebhookHandler handler = new OrgInvoiceWebhookHandler(customers, accounts, invoices, lines, audit);

    OrgBillingAccount account = new OrgBillingAccount();
    OrgInvoice inv = new OrgInvoice();

    @BeforeEach
    void ready() {
        account.setOrgId(ORG);
        account.setStripeCustomerId("cus_org_1");
        account.setStatus("PAST_DUE");
        account.setSetupFeeStatus("INVOICED");
        inv.setId(500L);
        inv.setOrgId(ORG);
        inv.setInvoiceNumber("KIWI-0001");
        inv.setStatus("OPEN");
        inv.setAmountMinor(52_450L);
        inv.setPeriodStart(LocalDate.of(2026, 12, 1));
        inv.setPeriodEnd(LocalDate.of(2026, 12, 31));
        inv.setStripeInvoiceId("in_1");
        when(customers.orgOf("cus_org_1")).thenReturn(ORG);
        when(accounts.findFirstByOrgId(ORG)).thenReturn(Optional.of(account));
        when(invoices.findByOrgIdAndStripeInvoiceId(ORG, "in_1")).thenReturn(Optional.of(inv));
        when(invoices.findByOrgIdAndSourceAndStatus(ORG, "STRIPE", "OPEN")).thenReturn(List.of(inv));
        OrgInvoiceLine fee = new OrgInvoiceLine();
        fee.setLineKind("SETUP_FEE");
        when(lines.findByOrgIdAndInvoiceIdOrderBySortOrderAsc(ORG, 500L)).thenReturn(List.of(fee));
    }

    private static StripeWebhookEvent event(String type, String customer, Long orgId, long paid) {
        StripeWebhookEvent.InvoiceInfo info = new StripeWebhookEvent.InvoiceInfo("in_1", "KIWI-0001", "paid", "usd", 52_450L, paid, null, null, null, Instant.parse("2026-12-05T10:00:00Z"), "https://pay.test/in_1", null, List.of());
        return new StripeWebhookEvent("evt_1", type, Instant.parse("2026-12-05T10:00:01Z"), "invoice", customer, null, null, null, null, null, null, paid, "usd", "kiwiply", null, "org", orgId, null, List.of(), info, null, null, null);
    }

    @Test
    void aPaidInvoiceIsPaidThePeriodIsPaidThroughTheFeeIsPaidAndTheAccountIsActiveAgain() {
        handler.apply(event("invoice.paid", "cus_org_1", ORG, 52_450L));
        assertThat(inv.getStatus()).isEqualTo("PAID");
        assertThat(inv.getAmountPaidMinor()).isEqualTo(52_450L);
        assertThat(inv.getPaidAt()).isEqualTo(Instant.parse("2026-12-05T10:00:00Z"));
        assertThat(account.getPaidThroughOn()).isEqualTo(LocalDate.of(2026, 12, 31));
        assertThat(account.getSetupFeeStatus()).isEqualTo("PAID");
        assertThat(account.getStatus()).isEqualTo("ACTIVE");
        verify(audit).record(eq(ORG), eq("stripe"), isNull(), eq(OrgAuditService.BILLING_INVOICE_PAID), eq(OrgAuditService.TARGET_ORG), isNull(), eq("7"), anyString(), isNull());
    }

    @Test
    void aFailedPaymentMakesTheAccountPastDueAndALateEventNeverReopensAPaidInvoice() {
        account.setStatus("ACTIVE");
        handler.apply(event("invoice.payment_failed", "cus_org_1", ORG, 0L));
        assertThat(account.getStatus()).isEqualTo("PAST_DUE");
        inv.setStatus("PAID");
        account.setStatus("ACTIVE");
        handler.apply(event("invoice.overdue", "cus_org_1", ORG, 0L));
        assertThat(inv.getStatus()).isEqualTo("PAID");
        assertThat(account.getStatus()).isEqualTo("ACTIVE");
    }

    @Test
    void anEventForAnotherCustomerOrNamingAnotherOrganizationChangesNothing() {
        handler.apply(event("invoice.paid", "cus_someone_else", ORG, 52_450L));
        when(customers.orgOf("cus_org_2")).thenReturn(8L);
        handler.apply(event("invoice.paid", "cus_org_2", ORG, 52_450L));
        assertThat(inv.getStatus()).isEqualTo("OPEN");
        verify(invoices, never()).save(any());
    }
}
