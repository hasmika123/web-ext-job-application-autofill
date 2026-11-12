package com.dossier.api.service.ent.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** ORG-BILLING-BUILD.md step 3a: the invoice for the month that starts, in advance, with what the closed month still owes, and the setup fee once. */
class OrgInvoiceComposerTest {

    static final Long ORG = 7L;
    static final LocalDate NOV_12 = LocalDate.of(2026, 11, 12);
    static final LocalDate NOV_1 = LocalDate.of(2026, 11, 1);
    static final LocalDate NOV_30 = LocalDate.of(2026, 11, 30);
    static final LocalDate DEC_1 = LocalDate.of(2026, 12, 1);
    static final LocalDate DEC_31 = LocalDate.of(2026, 12, 31);

    ConsultantLicenseRepository licenses = mock(ConsultantLicenseRepository.class);
    LicenseFeatureRepository features = mock(LicenseFeatureRepository.class);
    OrgInvoiceRepository invoices = mock(OrgInvoiceRepository.class);
    OrgInvoiceLineRepository lines = mock(OrgInvoiceLineRepository.class);
    ProductRepository products = mock(ProductRepository.class);
    OrgBillingStartService starts = mock(OrgBillingStartService.class);
    StripeGateway stripe = mock(StripeGateway.class);
    OrgInvoiceComposer composer = new OrgInvoiceComposer(licenses, features, invoices, lines, products, starts, stripe);

    List<ConsultantLicense> licenceRows = new ArrayList<>();
    List<LicenseFeature> featureRows = new ArrayList<>();
    List<OrgInvoiceLine> mirrored = new ArrayList<>();

    @BeforeEach
    void ready() {
        Product inbox = new Product();
        inbox.setId(2L);
        inbox.setFeatureKey("inbox.monitoring");
        inbox.setName("Inbox monitoring");
        when(products.findByKindOrderBySortOrderAsc("FEATURE")).thenReturn(List.of(inbox));
        when(licenses.findByOrgIdAndStatusIn(eq(ORG), any())).thenAnswer(inv -> licenceRows);
        when(features.findByOrgIdAndLicenseIdOrderByIdAsc(eq(ORG), anyLong())).thenAnswer(inv -> featureRows.stream().filter(f -> f.getLicenseId().equals(inv.getArgument(1))).toList());
        when(invoices.saveAndFlush(any())).thenAnswer(inv -> {
            OrgInvoice i = inv.getArgument(0);
            i.setId(500L);
            return i;
        });
        when(lines.save(any())).thenAnswer(inv -> {
            mirrored.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
    }

    private ConsultantLicense licence(long id, String status, long base, Instant starts, Instant ends) {
        ConsultantLicense l = new ConsultantLicense();
        l.setId(id);
        l.setOrgId(ORG);
        l.setStatus(status);
        l.setBaseAmountMinor(base);
        l.setStartsAt(starts);
        l.setEndsAt(ends);
        licenceRows.add(l);
        return l;
    }

    private void feature(long licenceId, long unit, Instant starts, Instant ends) {
        LicenseFeature f = new LicenseFeature();
        f.setId(licenceId * 10);
        f.setOrgId(ORG);
        f.setLicenseId(licenceId);
        f.setFeatureKey("inbox.monitoring");
        f.setUnitAmountMinor(unit);
        f.setQuantity(1);
        f.setLive(true);
        f.setStartsAt(starts);
        f.setEndsAt(ends);
        featureRows.add(f);
    }

    private static Instant at(String iso) {
        return Instant.parse(iso);
    }

    @Test
    void theFirstPartialMonthIsProratedFromTheStartOfBillingAndDecemberIsBilledInAdvance() {
        licence(1, "ACTIVE", 1_500L, at("2026-10-01T00:00:00Z"), null);
        feature(1, 900L, at("2026-10-01T00:00:00Z"), null);
        // November 12 to 30 of a 30-day month: 19/30
        List<OrgInvoiceComposer.Line> out = composer.lines(ORG, NOV_12, NOV_30, DEC_1, DEC_31);
        assertThat(out).extracting(OrgInvoiceComposer.Line::kind).containsExactly("BASE_LICENSE", "FEATURE", "PRORATION", "PRORATION");
        assertThat(out.get(0).amountMinor()).isEqualTo(1_500L);
        assertThat(out.get(0).description()).isEqualTo("Base licence × 1, December 2026");
        assertThat(out.get(1).amountMinor()).isEqualTo(900L);
        assertThat(out.get(2).amountMinor()).isEqualTo(950L);
        assertThat(out.get(2).description()).isEqualTo("Prorated: Base licence (Nov 12 to Nov 30)");
        assertThat(out.get(3).amountMinor()).isEqualTo(570L);
    }

    @Test
    void afterAMonthBilledInAdvanceOnlyWhatWasAddedDuringItIsProrated() {
        when(invoices.existsByOrgIdAndPeriodStartAndSourceAndKind(ORG, NOV_1, "STRIPE", "RECURRING")).thenReturn(true);
        licence(1, "ACTIVE", 1_500L, at("2026-10-01T00:00:00Z"), null);
        feature(1, 900L, at("2026-11-16T00:00:00Z"), null); // added on the 16th: 15 of 30 days
        licence(2, "ENDED", 1_500L, at("2026-10-01T00:00:00Z"), at("2026-11-20T00:00:00Z")); // ended: no credit, not in December
        List<OrgInvoiceComposer.Line> out = composer.lines(ORG, NOV_1, NOV_30, DEC_1, DEC_31);
        assertThat(out).extracting(OrgInvoiceComposer.Line::kind).containsExactly("BASE_LICENSE", "FEATURE", "PRORATION");
        assertThat(out.get(0).quantity()).isEqualTo(1);
        assertThat(out.get(2).amountMinor()).isEqualTo(450L);
        assertThat(out.get(2).description()).isEqualTo("Prorated: Inbox monitoring (Nov 16 to Nov 30)");
    }

    @Test
    void anOrganizationWithNothingPricedGetsNoInvoice() {
        licence(1, "ACTIVE", 0L, at("2026-10-01T00:00:00Z"), null);
        OrgBillingAccount a = account("WAIVED");
        assertThat(composer.invoiceInAdvance(a, NOV_1, NOV_30, at("2026-12-01T00:40:00Z"))).isFalse();
        verify(stripe, never()).createOrgInvoice(any(), anyInt(), any(), any(), any());
    }

    @Test
    void theInvoiceIsSentWithItsKeysMirroredAndCarriesTheSetupFeeOnce() {
        licence(1, "ACTIVE", 1_500L, at("2026-10-01T00:00:00Z"), null);
        OrgBillingAccount a = account("ADDED");
        a.setSetupFeeAmountMinor(50_000L);
        Instant due = at("2026-12-16T00:40:00Z");
        when(stripe.createOrgInvoice(eq("cus_org_1"), eq(15), anyString(), any(), any()))
            .thenReturn(new StripeGateway.InvoiceSummary("in_1", "KIWI-0001", "open", "usd", 51_500L + 950L, 0L, null, null, due, null, "https://pay.test/in_1", null, null, List.of()));
        assertThat(composer.invoiceInAdvance(a, NOV_12, NOV_30, at("2026-12-01T00:40:00Z"))).isTrue();
        verify(stripe).createInvoiceItem(eq("cus_org_1"), eq(1_500L), eq("USD"), eq("Base licence × 1, December 2026"), any(), any(), eq(IdempotencyKey.of("orginv", ORG, DEC_1, 0)));
        verify(stripe).createOrgInvoice(eq("cus_org_1"), eq(15), eq("Kiwiply licences, December 2026"), any(), eq(IdempotencyKey.of("orginv", ORG, DEC_1)));
        assertThat(a.getSetupFeeStatus()).isEqualTo("INVOICED");
        assertThat(mirrored).extracting(OrgInvoiceLine::getLineKind).containsExactly("BASE_LICENSE", "PRORATION", "SETUP_FEE");
        assertThat(mirrored.get(2).getAmountMinor()).isEqualTo(50_000L);
    }

    @Test
    void aMonthAlreadyInvoicedIsNotSentTwice() {
        when(invoices.existsByOrgIdAndPeriodStartAndSourceAndKind(ORG, DEC_1, "STRIPE", "RECURRING")).thenReturn(true);
        licence(1, "ACTIVE", 1_500L, at("2026-10-01T00:00:00Z"), null);
        assertThat(composer.invoiceInAdvance(account("WAIVED"), NOV_1, NOV_30, at("2026-12-01T01:40:00Z"))).isFalse();
        verify(stripe, never()).createInvoiceItem(any(), anyLong(), any(), any(), any(), any(), any());
    }

    private static int anyInt() {
        return org.mockito.ArgumentMatchers.anyInt();
    }

    private static OrgBillingAccount account(String fee) {
        OrgBillingAccount a = new OrgBillingAccount();
        a.setOrgId(ORG);
        a.setStripeCustomerId("cus_org_1");
        a.setSetupFeeStatus(fee);
        return a;
    }
}
