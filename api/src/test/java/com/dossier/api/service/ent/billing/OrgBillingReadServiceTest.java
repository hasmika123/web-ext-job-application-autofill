package com.dossier.api.service.ent.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.billing.OrgBillingAccount;
import com.dossier.api.domain.ent.billing.OrgInvoice;
import com.dossier.api.domain.ent.billing.OrgInvoiceLine;
import com.dossier.api.domain.ent.billing.OrgPaymentMethod;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
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
import com.dossier.api.service.ent.licenses.OrgLicenseService.Row;
import com.dossier.api.service.ent.licenses.OrgLicenseService.Status;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;

/** ORG-BILLING-BUILD.md step 1a: the billing pages read real rows, never invent money, and say SETUP until a billing account exists. */
class OrgBillingReadServiceTest {

    static final Long ORG = 7L;
    static final Instant NOW = Instant.parse("2026-11-11T10:00:00Z");

    OrganizationRepository orgs = mock(OrganizationRepository.class);
    OrgBillingAccountRepository accounts = mock(OrgBillingAccountRepository.class);
    OrgSubscriptionRepository subscriptions = mock(OrgSubscriptionRepository.class);
    OrgSubscriptionItemRepository items = mock(OrgSubscriptionItemRepository.class);
    OrgInvoiceRepository invoices = mock(OrgInvoiceRepository.class);
    OrgInvoiceLineRepository lines = mock(OrgInvoiceLineRepository.class);
    OrgPaymentRepository payments = mock(OrgPaymentRepository.class);
    OrgPaymentMethodRepository methods = mock(OrgPaymentMethodRepository.class);
    OrgContractRepository contracts = mock(OrgContractRepository.class);
    ConsultantLicenseRepository licenses = mock(ConsultantLicenseRepository.class);
    LicenseFeatureRepository features = mock(LicenseFeatureRepository.class);
    OrgLicenseService licenseRows = mock(OrgLicenseService.class);
    TenantModules modules = mock(TenantModules.class);
    ConsultantAccess access = mock(ConsultantAccess.class);
    OrgBillingReadService service = new OrgBillingReadService(orgs, accounts, subscriptions, items, invoices, lines, payments, methods, contracts, licenses, features, licenseRows, modules, access);
    OrgMembership me = new OrgMembership(ORG, 5L, 2L, "felix", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    @BeforeEach
    void world() {
        service.setClock(Clock.fixed(NOW, ZoneOffset.UTC));
        when(modules.isOn(TenantModule.BILLING, ORG)).thenReturn(true);
        when(orgs.findByOrgId(ORG)).thenReturn(Optional.empty());
        when(accounts.findFirstByOrgId(ORG)).thenReturn(Optional.empty());
        when(subscriptions.findFirstByOrgIdOrderByIdDesc(ORG)).thenReturn(Optional.empty());
        when(invoices.findOverdue(eq(ORG), any())).thenReturn(List.of());
        when(contracts.findFirstByOrgIdAndStatus(ORG, "ACTIVE")).thenReturn(Optional.empty());
        when(features.findByOrgIdAndLive(ORG, true)).thenReturn(List.of());
    }

    static Row row(long id, String name, Status status, Long monthly, boolean priceSet, Instant endsAt) {
        return new Row(id, name, name.toLowerCase() + "@x.test", true, status, List.of(), monthly, priceSet, NOW.minusSeconds(86_400), endsAt, null);
    }

    @Test
    void withoutABillingAccountItSaysSetupAndCountsTheLicencesWithoutInventingAPrice() {
        when(licenseRows.rowsFor(ORG)).thenReturn(List.of(row(1, "Ana", Status.ACTIVE, null, false, null), row(2, "Ben", Status.NONE, null, false, null), row(3, "Cy", Status.SUSPENDED, null, false, null)));
        OrgBillingReadService.Overview o = service.overview(me);
        assertThat(o.status()).isEqualTo("SETUP");
        assertThat(o.billingConnected()).isFalse();
        assertThat(o.tiles()).isEqualTo(new OrgBillingReadService.Tiles(3, 2, 1));
        assertThat(o.monthlyRecurringMinor()).as("no prices: no $0, just 'price not set'").isNull();
        assertThat(o.priceSet()).isFalse();
        assertThat(o.nextInvoiceOn()).isNull();
        assertThat(o.nextInvoiceEstimateMinor()).isNull();
        assertThat(o.estimate()).isTrue();
        assertThat(o.taxNote()).isEqualTo(OrgBillingReadService.TAX_NOTE);
    }

    @Test
    void theRecurringAmountIsTheSumOfThePricedLicencesAndEndingOnesAreListedByDate() {
        Instant soon = NOW.plusSeconds(5 * 86_400L);
        Instant later = NOW.plusSeconds(9 * 86_400L);
        when(licenseRows.rowsFor(ORG)).thenReturn(List.of(row(1, "Ana", Status.ACTIVE, 2_798L, true, null), row(2, "Ben", Status.ENDING, 1_499L, true, later), row(3, "Cy", Status.ENDED, null, true, null)));
        LicenseFeature f = new LicenseFeature();
        f.setLicenseId(40L);
        f.setFeatureKey("interview.prep");
        f.setLive(true);
        f.setEndsAt(soon);
        when(features.findByOrgIdAndLive(ORG, true)).thenReturn(List.of(f));
        ConsultantLicense l = new ConsultantLicense();
        l.setConsultantId(1L);
        l.setStatus("ACTIVE");
        when(licenses.findByOrgIdAndId(ORG, 40L)).thenReturn(Optional.of(l));

        OrgBillingReadService.Overview o = service.overview(me);
        assertThat(o.monthlyRecurringMinor()).isEqualTo(4_297L);
        assertThat(o.tiles().licensed()).isEqualTo(2);
        assertThat(o.ending()).extracting(OrgBillingReadService.Ending::name, OrgBillingReadService.Ending::what).containsExactly(
            org.assertj.core.groups.Tuple.tuple("Ana", "interview.prep"),
            org.assertj.core.groups.Tuple.tuple("Ben", "Licence")
        );
    }

    @Test
    void aBillingAccountGivesItsStatusNextInvoiceAndOverdueInvoices() {
        when(licenseRows.rowsFor(ORG)).thenReturn(List.of(row(1, "Ana", Status.ACTIVE, 1_499L, true, null)));
        OrgBillingAccount acct = new OrgBillingAccount();
        acct.setStatus("PAST_DUE");
        acct.setNextInvoiceOn(LocalDate.of(2026, 12, 1));
        when(accounts.findFirstByOrgId(ORG)).thenReturn(Optional.of(acct));
        OrgInvoice late = invoice(9L, "OPEN", LocalDate.of(2026, 11, 1));
        late.setAmountMinor(5_000L);
        late.setAmountPaidMinor(1_000L);
        when(invoices.findOverdue(eq(ORG), any())).thenReturn(List.of(late));

        OrgBillingReadService.Overview o = service.overview(me);
        assertThat(o.status()).isEqualTo("PAST_DUE");
        assertThat(o.nextInvoiceOn()).isEqualTo(LocalDate.of(2026, 12, 1));
        assertThat(o.nextInvoiceEstimateMinor()).isEqualTo(1_499L);
        assertThat(o.overdue()).isEqualTo(new OrgBillingReadService.Overdue(1, 4_000L, LocalDate.of(2026, 11, 1)));
    }

    @Test
    void theAccountShowsOnlyBrandAndLastFourOfTheCard() {
        OrgPaymentMethod pm = new OrgPaymentMethod();
        pm.setKind("CARD");
        pm.setBrand("visa");
        pm.setLast4("4242");
        pm.setExpMonth(4);
        pm.setExpYear(2029);
        when(methods.findFirstByOrgIdAndDefaultMethodTrueAndStatus(ORG, "ACTIVE")).thenReturn(Optional.of(pm));
        OrgBillingReadService.Billing b = service.billing(me);
        assertThat(b.paymentMethod()).isEqualTo(new OrgBillingReadService.PaymentMethod("CARD", "visa", "4242", 4, 2029));
        assertThat(b.account()).isNull();
        assertThat(b.status()).isEqualTo("SETUP");
    }

    @Test
    void invoicesAreEstimatesWhenLocalAndOverdueWhenOpenPastTheirDueDate() {
        OrgInvoice open = invoice(1L, "OPEN", LocalDate.of(2026, 11, 1));
        OrgInvoice paid = invoice(2L, "PAID", LocalDate.of(2026, 10, 1));
        paid.setSource("STRIPE");
        when(invoices.findByOrgIdOrderByIssueDateDescIdDesc(eq(ORG), any())).thenReturn(new PageImpl<>(List.of(open, paid)));
        OrgBillingReadService.InvoicePage page = service.invoices(me, "weird", -3);
        assertThat(page.page()).isZero();
        assertThat(page.rows()).extracting(OrgBillingReadService.InvoiceRow::estimate).containsExactly(true, false);
        assertThat(page.rows()).extracting(OrgBillingReadService.InvoiceRow::overdue).containsExactly(true, false);
    }

    @Test
    void oneInvoiceCarriesItsLinesAndAnotherOrganizationsIsA404() {
        OrgInvoice i = invoice(3L, "PAID", LocalDate.of(2026, 10, 1));
        when(invoices.findByOrgIdAndId(ORG, 3L)).thenReturn(Optional.of(i));
        OrgInvoiceLine l = new OrgInvoiceLine();
        l.setLineKind("BASE_LICENSE");
        l.setDescription("Base licence");
        l.setQuantity(3);
        l.setUnitAmountMinor(1_499L);
        l.setAmountMinor(4_497L);
        when(lines.findByOrgIdAndInvoiceIdOrderBySortOrderAsc(ORG, 3L)).thenReturn(List.of(l));
        when(payments.findByOrgIdAndInvoiceIdOrderByOccurredAtAsc(ORG, 3L)).thenReturn(List.of());
        OrgBillingReadService.InvoiceDetail d = service.invoice(me, 3L);
        assertThat(d.lines()).containsExactly(new OrgBillingReadService.Line("BASE_LICENSE", "Base licence", null, 3, 1_499L, 4_497L));
        when(invoices.findByOrgIdAndId(ORG, 99L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.invoice(me, 99L)).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void theModuleOffOrNoPermissionIsTheGeneric404() {
        when(access.require(me, OrgBillingReadService.VIEW)).thenThrow(new OrgNotFoundException());
        assertThatThrownBy(() -> service.overview(me)).isInstanceOf(OrgNotFoundException.class);
        when(modules.isOn(TenantModule.BILLING, ORG)).thenReturn(false);
        assertThatThrownBy(() -> service.billing(me)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.invoices(me, null, 0)).isInstanceOf(OrgNotFoundException.class);
    }

    private static OrgInvoice invoice(Long id, String status, LocalDate due) {
        OrgInvoice i = new OrgInvoice();
        i.setId(id);
        i.setOrgId(ORG);
        i.setInvoiceNumber("INV-" + id);
        i.setStatus(status);
        i.setIssueDate(due.minusDays(15));
        i.setDueDate(due);
        i.setAmountMinor(1_000L);
        i.setAmountPaidMinor(0L);
        return i;
    }
}
