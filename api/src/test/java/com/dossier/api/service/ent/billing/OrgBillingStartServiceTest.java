package com.dossier.api.service.ent.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.ent.billing.OrgBillingAccount;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.ent.billing.OrgBillingAccountRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.repository.sub.ProductPriceRepository;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;

/** ORG-BILLING-BUILD.md step 2: starting billing for an organization, the setup fee rules, and Stripe first with keys (nothing saved when it fails). */
class OrgBillingStartServiceTest {

    static final Long ORG = 7L;
    static final Instant NOW = Instant.parse("2026-11-12T10:00:00Z");

    OrganizationRepository organizations = mock(OrganizationRepository.class);
    OrgBillingAccountRepository accounts = mock(OrgBillingAccountRepository.class);
    ProductRepository products = mock(ProductRepository.class);
    ProductPriceRepository prices = mock(ProductPriceRepository.class);
    StripeGateway stripe = mock(StripeGateway.class);
    SettingsService settings = mock(SettingsService.class);
    AdminAuditService adminAudit = mock(AdminAuditService.class);
    OrgAuditService orgAudit = mock(OrgAuditService.class);
    OrgBillingStartService service = new OrgBillingStartService(organizations, accounts, products, prices, stripe, settings, adminAudit, orgAudit, mock(PlatformTransactionManager.class));

    Organization org = new Organization();
    List<OrgBillingAccount> saved = new ArrayList<>();

    @BeforeEach
    void ready() {
        service.setClock(Clock.fixed(NOW, ZoneOffset.UTC));
        org.setId(ORG);
        org.setName("Aaruna Tech");
        org.setSlug("aaruna");
        when(organizations.findByOrgId(ORG)).thenReturn(Optional.of(org));
        when(accounts.findFirstByOrgId(ORG)).thenAnswer(inv -> saved.stream().findFirst());
        when(accounts.saveAndFlush(any())).thenAnswer(inv -> {
            saved.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        Product fee = new Product();
        fee.setId(40L);
        when(products.findByCode("ORG_SETUP_FEE")).thenReturn(Optional.of(fee));
    }

    private void stripeOn() {
        when(settings.getBool(EnterpriseSettingKeys.BILLING_STRIPE_ENABLED)).thenReturn(true);
        when(stripe.isEnabled()).thenReturn(true);
        when(stripe.createOrgCustomer(anyString(), anyString(), anyLong(), any())).thenReturn("cus_org_1");
        when(stripe.createInvoiceItem(anyString(), anyLong(), anyString(), anyString(), any(), any(), any())).thenReturn("ii_1");
    }

    private void feePrice(long minor) {
        ProductPrice p = new ProductPrice();
        p.setAmountMinor(minor);
        when(prices.findActive(40L, "ORG", "ONE_TIME", "USD")).thenReturn(Optional.of(p));
    }

    @Test
    void withStripeOffBillingIsLocalTheFeeIsOwedAndThePeriodRunsToTheMonthEnd() {
        OrgBillingStartService.Status s = service.start(ORG, new OrgBillingStartService.StartRequest(" Billing@Aaruna.TEST ", false, "Signed the order form"));
        assertThat(s.started()).isTrue();
        OrgBillingStartService.Account a = s.account();
        assertThat(a.billingEmail()).isEqualTo("billing@aaruna.test");
        assertThat(a.source()).isEqualTo("LOCAL");
        assertThat(a.stripeCustomer()).isFalse();
        assertThat(a.collectionMethod()).isEqualTo("SEND_INVOICE");
        assertThat(a.periodStart()).isEqualTo(LocalDate.of(2026, 11, 12));
        assertThat(a.periodEnd()).isEqualTo(LocalDate.of(2026, 11, 30));
        assertThat(a.nextInvoiceOn()).isEqualTo(LocalDate.of(2026, 12, 1));
        assertThat(a.setupFee().status()).isEqualTo("OWED");
        assertThat(a.setupFee().amountMinor()).as("no published price: null, never $0").isNull();
        assertThat(org.getBillingEmail()).isEqualTo("billing@aaruna.test");
        verify(stripe, never()).createOrgCustomer(any(), any(), any(), any());
        verify(adminAudit).record(eq(AdminAuditService.ORG_BILLING_START), eq(AdminAuditService.TARGET_ORG), eq("7"), eq("Signed the order form"), anyString());
        verify(orgAudit).record(eq(ORG), anyString(), isNull(), eq(OrgAuditService.ADMIN_BILLING_START), eq(OrgAuditService.TARGET_ORG), isNull(), eq("7"), anyString(), isNull(), isNull(), isNull(), eq("HIGH"));

        assertThatThrownBy(() -> service.start(ORG, new OrgBillingStartService.StartRequest("billing@aaruna.test", false, "again please")))
            .isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("BILLING_STARTED"));
    }

    @Test
    void withStripeOnTheCustomerIsMadeAndAPricedFeeWaitsForTheFirstInvoice() {
        stripeOn();
        feePrice(50_000L);
        OrgBillingStartService.Account a = service.start(ORG, new OrgBillingStartService.StartRequest("billing@aaruna.test", null, "Signed the order form")).account();
        assertThat(a.source()).isEqualTo("STRIPE");
        assertThat(a.stripeCustomer()).isTrue();
        assertThat(a.setupFee().status()).isEqualTo("ADDED");
        assertThat(a.setupFee().amountMinor()).isEqualTo(50_000L);
        assertThat(saved.get(0).getStripeCustomerId()).isEqualTo("cus_org_1");
        assertThat(saved.get(0).getSetupFeeItemId()).isEqualTo("ii_1");
        assertThat(org.getStripeCustomerId()).isEqualTo("cus_org_1");
        verify(stripe).createOrgCustomer("billing@aaruna.test", "Aaruna Tech", ORG, IdempotencyKey.of("orgcust", ORG));
        verify(stripe).createInvoiceItem(eq("cus_org_1"), eq(50_000L), eq("USD"), eq("Organization setup fee"), isNull(), eq(Map.of("kind", "org_setup", "org_id", "7")), eq(IdempotencyKey.of("orgsetup", ORG)));
    }

    @Test
    void anOrganizationThatExistedBeforeSetupFeesOrAWaiverIsNeverCharged() {
        stripeOn();
        feePrice(50_000L);
        org.setSetupFeeExempt(true);
        OrgBillingStartService.Account a = service.start(ORG, new OrgBillingStartService.StartRequest("billing@aaruna.test", false, "Existing customer")).account();
        assertThat(a.setupFee().status()).isEqualTo("WAIVED");
        assertThat(a.setupFee().amountMinor()).isNull();
        verify(stripe, never()).createInvoiceItem(any(), anyLong(), any(), any(), any(), any(), any());

        saved.clear();
        org.setSetupFeeExempt(false);
        OrgBillingStartService.Account w = service.start(ORG, new OrgBillingStartService.StartRequest("billing@aaruna.test", true, "Pilot customer")).account();
        assertThat(w.setupFee().status()).isEqualTo("WAIVED");
        assertThat(w.setupFee().note()).isEqualTo("Waived: Pilot customer");
    }

    @Test
    void whenStripeFailsNothingIsSavedAndTheRetryUsesTheSameKeys() {
        stripeOn();
        when(stripe.createOrgCustomer(anyString(), anyString(), anyLong(), any())).thenThrow(new StripeGatewayException("down", StripeGatewayException.Kind.CONNECTION, null, null));
        assertThatThrownBy(() -> service.start(ORG, new OrgBillingStartService.StartRequest("billing@aaruna.test", false, "Signed the order form")))
            .isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("BILLING_PROVIDER"));
        assertThat(saved).isEmpty();
        verify(adminAudit, never()).record(any(), any(), any(), any(), any());
    }

    @Test
    void anEmailAndAReasonAreRequired() {
        assertThatThrownBy(() -> service.start(ORG, new OrgBillingStartService.StartRequest("not-an-email", false, "Signed the order form")))
            .isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo(OrgException.CODE_ORG_INVALID));
        assertThatThrownBy(() -> service.start(ORG, new OrgBillingStartService.StartRequest("billing@aaruna.test", false, " ")))
            .isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo(OrgException.CODE_ORG_INVALID));
        assertThat(saved).isEmpty();
    }
}
