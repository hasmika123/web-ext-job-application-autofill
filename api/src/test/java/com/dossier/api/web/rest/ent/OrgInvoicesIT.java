package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.OrgBillingAccount;
import com.dossier.api.domain.ent.billing.OrgContract;
import com.dossier.api.domain.ent.billing.OrgContractPrice;
import com.dossier.api.domain.ent.billing.OrgInvoice;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.OrgBillingAccountRepository;
import com.dossier.api.repository.ent.billing.OrgContractPriceRepository;
import com.dossier.api.repository.ent.billing.OrgContractRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceLineRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceRepository;
import com.dossier.api.service.billing.StripeWebhookEvent;
import com.dossier.api.service.billing.personal.FakeStripeGateway;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.ent.billing.OrgBillingPeriodService;
import com.dossier.api.service.ent.billing.OrgBillingStartService;
import com.dossier.api.service.ent.billing.OrgInvoiceWebhookHandler;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Billing step 3a through the real chain with a scripted Stripe (docs/enterprise-v2/ORG-BILLING-BUILD.md): billing started with Stripe on, a month
 * closes, Kiwiply composes and sends the invoice in advance and mirrors it, Stripe reports it paid, and an unpaid invoice past its due date makes the
 * account PAST_DUE.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Import(SubFixtures.FakeGatewayConfig.class)
class OrgInvoicesIT extends MemberItSupport {

    @Autowired private FakeStripeGateway fake;
    @Autowired private OrgBillingStartService starts;
    @Autowired private OrgBillingPeriodService periods;
    @Autowired private OrgInvoiceWebhookHandler webhooks;
    @Autowired private OrgBillingAccountRepository accounts;
    @Autowired private OrgContractRepository contracts;
    @Autowired private OrgContractPriceRepository contractPrices;
    @Autowired private ProductRepository products;
    @Autowired private ConsultantLicenseRepository licenseRows;
    @Autowired private OrgInvoiceRepository invoiceRows;
    @Autowired private OrgInvoiceLineRepository lineRows;
    @Autowired private PlatformTransactionManager txManager;

    @AfterEach
    void resetFake() {
        fake.reset();
    }

    private void stripeOn() {
        settingRows.save(new AppSetting(EnterpriseSettingKeys.BILLING_STRIPE_ENABLED, "true", WHO, Instant.now()));
        settingsCache.invalidate();
    }

    @Test
    void aClosedMonthIsInvoicedInAdvanceByStripeThenPaidAndAnUnpaidOneMakesTheAccountPastDue() throws Exception {
        stripeOn();
        fake.reset();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        LocalDate lastStart = today.withDayOfMonth(1).minusMonths(1);
        LocalDate thisStart = today.withDayOfMonth(1);

        // a contract price for the base licence and a licensed consultant since before last month
        OrgContract k = new OrgContract();
        k.setOrgId(a.getId());
        k.setReference("I-" + p);
        k.setName("Invoice contract");
        k.setStatus("ACTIVE");
        k.setStartsAt(Instant.now().minusSeconds(90L * 86_400));
        k = contracts.saveAndFlush(k);
        OrgContractPrice cp = new OrgContractPrice();
        cp.setOrgId(a.getId());
        cp.setContractId(k.getId());
        cp.setProductId(products.findByCode("ORG_BASE_LICENSE").orElseThrow().getId());
        cp.setOverrideAmountMinor(1_500L);
        contractPrices.saveAndFlush(cp);
        JsonNode c = json(call(login("owner"), post("/api/orgs/" + a.getId() + "/consultants"), "{\"displayName\":\"Ina Voice\",\"email\":\"ina@" + p + ".example.org\"}", null, key()));
        long consultantId = c.path("consultant").path("id").asLong();
        assertStatus(call(login("owner"), post("/api/orgs/" + a.getId() + "/licenses/" + consultantId), "{\"features\":[]}"), 200);
        ConsultantLicense lic = licenseRows.findByOrgIdAndConsultantIdOrderByStartsAtDesc(a.getId(), consultantId).get(0);
        lic.setStartsAt(lastStart.minusDays(5).atStartOfDay(ZoneOffset.UTC).toInstant());
        licenseRows.saveAndFlush(lic);

        // billing starts with Stripe on: a customer, the fee waived; then the first period is moved back to last month so it has closed
        OrgBillingStartService.Status started = starts.start(a.getId(), new OrgBillingStartService.StartRequest("ap@" + p + ".example.org", true, "Pilot customer"));
        assertThat(started.account().source()).isEqualTo("STRIPE");
        assertThat(fake.orgCustomerCalls).hasSize(1);
        OrgBillingAccount acc = accounts.findFirstByOrgId(a.getId()).orElseThrow();
        acc.setCurrentPeriodStart(lastStart);
        acc.setCurrentPeriodEnd(thisStart.minusDays(1));
        accounts.saveAndFlush(acc);

        OrgBillingPeriodService.RunResult r = periods.runDue(Instant.now());
        assertThat(r.failed()).isZero();
        assertThat(fake.orgInvoiceKeys).hasSize(1);
        OrgInvoice inv = invoiceRows.findByOrgIdOrderByIssueDateDescIdDesc(a.getId(), PageRequest.of(0, 5)).getContent().get(0);
        assertThat(inv.getSource()).isEqualTo("STRIPE");
        assertThat(inv.getPeriodStart()).as("billed in advance: the month that starts").isEqualTo(thisStart);
        assertThat(inv.getStripeInvoiceId()).isNotBlank();
        assertThat(inv.getStatus()).isEqualTo("OPEN");
        assertThat(lineRows.findByOrgIdAndInvoiceIdOrderBySortOrderAsc(a.getId(), inv.getId()))
            .extracting(l -> l.getLineKind() + ":" + l.getAmountMinor())
            .as("this month in advance, and the whole first month that was never billed")
            .containsExactly("BASE_LICENSE:1500", "PRORATION:1500");
        assertThat(inv.getAmountMinor()).isEqualTo(3_000L);
        assertThat(periods.runDue(Instant.now()).invoices()).as("a second run sends nothing").isZero();
        assertThat(fake.orgInvoiceKeys).hasSize(1);

        // Stripe reports it paid
        String customer = accounts.findFirstByOrgId(a.getId()).orElseThrow().getStripeCustomerId();
        StripeWebhookEvent.InvoiceInfo info = new StripeWebhookEvent.InvoiceInfo(inv.getStripeInvoiceId(), inv.getInvoiceNumber(), "paid", "usd", 3_000L, 3_000L, null, null, null, Instant.now(), null, null, List.of());
        StripeWebhookEvent paid = new StripeWebhookEvent("evt_" + p, "invoice.paid", Instant.now(), "invoice", customer, null, null, null, null, null, null, 3_000L, "usd", "kiwiply", null, "org", a.getId(), null, List.of(), info, null, null, null);
        new TransactionTemplate(txManager).executeWithoutResult(s -> webhooks.apply(paid));
        assertThat(invoiceRows.findByOrgIdAndStripeInvoiceId(a.getId(), inv.getStripeInvoiceId()).orElseThrow().getStatus()).isEqualTo("PAID");
        assertThat(accounts.findFirstByOrgId(a.getId()).orElseThrow().getPaidThroughOn()).isEqualTo(inv.getPeriodEnd());

        // an older Stripe invoice still open past its due date: the account is PAST_DUE until it is paid
        OrgInvoice late = new OrgInvoice();
        late.setOrgId(a.getId());
        late.setInvoiceNumber("LATE-" + (System.nanoTime() % 100000));
        late.setPeriodStart(lastStart);
        late.setPeriodEnd(thisStart.minusDays(1));
        late.setIssueDate(lastStart);
        late.setDueDate(today.minusDays(2));
        late.setDescription("Older invoice");
        late.setAmountMinor(1_500L);
        late.setAmountPaidMinor(0L);
        late.setSource("STRIPE");
        late.setStripeInvoiceId("in_late_" + p);
        invoiceRows.saveAndFlush(late);
        periods.runDue(Instant.now());
        OrgBillingAccount pastDue = accounts.findFirstByOrgId(a.getId()).orElseThrow();
        assertThat(pastDue.getStatus()).isEqualTo("PAST_DUE");
        assertThat(pastDue.getFeaturesPausedFrom()).as("step 3b: add-ons pause the day after the period it paid for").isEqualTo(inv.getPeriodEnd().plusDays(1));
        assertThat(pastDue.getLastReminderAt()).as("a reminder went out").isNotNull();
    }

    @Test
    void withStripeOffABillingAccountWithAStripeCustomerIsLeftOpenNotBilledLocally() {
        settingRows.save(new AppSetting(EnterpriseSettingKeys.BILLING_STRIPE_ENABLED, "false", WHO, Instant.now()));
        settingsCache.invalidate();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        OrgBillingAccount acc = new OrgBillingAccount();
        acc.setOrgId(a.getId());
        acc.setStripeCustomerId("cus_off_" + p);
        acc.setSource("STRIPE");
        acc.setCurrentPeriodStart(today.withDayOfMonth(1).minusMonths(1));
        acc.setCurrentPeriodEnd(today.withDayOfMonth(1).minusDays(1));
        accounts.saveAndFlush(acc);
        periods.runDue(Instant.now());
        assertThat(accounts.findFirstByOrgId(a.getId()).orElseThrow().getCurrentPeriodEnd()).as("kept open until Stripe is on again").isEqualTo(today.withDayOfMonth(1).minusDays(1));
        assertThat(invoiceRows.countByOrgId(a.getId())).isZero();
        assertThat(fake.orgInvoiceKeys).isEmpty();
    }
}
