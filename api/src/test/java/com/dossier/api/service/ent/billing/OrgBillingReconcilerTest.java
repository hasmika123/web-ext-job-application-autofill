package com.dossier.api.service.ent.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.catalog.BillingDrift;
import com.dossier.api.domain.ent.billing.OrgInvoice;
import com.dossier.api.repository.ent.billing.OrgInvoiceRepository;
import com.dossier.api.repository.sub.BillingDriftRepository;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.privacy.JobLeaseService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/** ORG-BILLING-BUILD.md step 3b: the nightly comparison of open organization invoices with Stripe writes drift rows and never fixes anything itself. */
class OrgBillingReconcilerTest {

    static final Long ORG = 7L;

    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    OrgInvoiceRepository invoices = mock(OrgInvoiceRepository.class);
    BillingDriftRepository drifts = mock(BillingDriftRepository.class);
    StripeGateway stripe = mock(StripeGateway.class);
    OrgBillingStartService starts = mock(OrgBillingStartService.class);
    OrgBillingReconciler reconciler = new OrgBillingReconciler(jdbc, invoices, drifts, stripe, starts, mock(JobLeaseService.class), new ObjectMapper());

    List<BillingDrift> saved = new ArrayList<>();

    @BeforeEach
    void ready() {
        when(starts.stripeReady()).thenReturn(true);
        when(jdbc.queryForList(anyString(), eq(Long.class))).thenReturn(List.of(ORG));
        when(drifts.save(any())).thenAnswer(inv -> {
            saved.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
    }

    private static OrgInvoice mine(String stripeId) {
        OrgInvoice i = new OrgInvoice();
        i.setOrgId(ORG);
        i.setInvoiceNumber("KIWI-0001");
        i.setStatus("OPEN");
        i.setAmountPaidMinor(0L);
        i.setStripeInvoiceId(stripeId);
        return i;
    }

    private static StripeGateway.InvoiceSummary theirs(String status, long paid) {
        return new StripeGateway.InvoiceSummary("in_1", "KIWI-0001", status, "usd", 3_000L, paid, null, null, null, null, null, null, null, List.of());
    }

    @Test
    void aStatusStripeChangedWithoutUsHearingIsOneDriftRowNotARepairAndNotTwice() {
        when(invoices.findByOrgIdAndSourceAndStatus(ORG, "STRIPE", "OPEN")).thenReturn(List.of(mine("in_1")));
        when(stripe.retrieveInvoice("in_1")).thenReturn(theirs("paid", 3_000L));
        OrgBillingReconciler.Result r = reconciler.run();
        assertThat(r.checked()).isEqualTo(1);
        assertThat(r.flagged()).isEqualTo(1);
        assertThat(saved).singleElement().satisfies(d -> {
            assertThat(d.getKind()).isEqualTo("ORG");
            assertThat(d.getCode()).isEqualTo("INVOICE_STATUS");
            assertThat(d.getOrgId()).isEqualTo(ORG);
            assertThat(d.getActualJson()).contains("PAID");
        });
        verify(invoices, never()).save(any());

        when(drifts.findOpenOne(eq("ORG"), eq("INVOICE_STATUS"), anyString())).thenReturn(Optional.of(saved.get(0)));
        assertThat(reconciler.run().flagged()).as("an open row is not written again").isZero();
    }

    @Test
    void anInvoiceStripeNoLongerHasIsMissingAndAnOutageIsNotDrift() {
        when(invoices.findByOrgIdAndSourceAndStatus(ORG, "STRIPE", "OPEN")).thenReturn(List.of(mine("in_gone"), mine("in_down")));
        when(stripe.retrieveInvoice("in_gone")).thenThrow(new StripeGatewayException("No such invoice", StripeGatewayException.Kind.INVALID_REQUEST, null, null));
        when(stripe.retrieveInvoice("in_down")).thenThrow(new StripeGatewayException("timeout", StripeGatewayException.Kind.CONNECTION, null, null));
        OrgBillingReconciler.Result r = reconciler.run();
        assertThat(r.flagged()).isEqualTo(1);
        assertThat(r.failed()).isEqualTo(1);
        assertThat(saved).extracting(BillingDrift::getCode).containsExactly("INVOICE_MISSING");
    }

    @Test
    void anInvoiceThatMatchesIsQuietAndTheReconcilerIsIdleWhileStripeIsOff() {
        when(invoices.findByOrgIdAndSourceAndStatus(ORG, "STRIPE", "OPEN")).thenReturn(List.of(mine("in_1")));
        when(stripe.retrieveInvoice("in_1")).thenReturn(theirs("open", 0L));
        assertThat(reconciler.run().flagged()).isZero();
        when(starts.stripeReady()).thenReturn(false);
        assertThat(reconciler.run().checked()).isZero();
        assertThat(saved).isEmpty();
    }
}
