package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.LicenseChange;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.billing.OrgBillingAccount;
import com.dossier.api.domain.ent.billing.OrgContract;
import com.dossier.api.domain.ent.billing.OrgContractPrice;
import com.dossier.api.domain.ent.billing.OrgInvoice;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseChangeRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.billing.OrgBillingAccountRepository;
import com.dossier.api.repository.ent.billing.OrgContractPriceRepository;
import com.dossier.api.repository.ent.billing.OrgContractRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceLineRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ent.billing.OrgBillingPeriodService;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Billing step 2 through the real chain (docs/enterprise-v2/ORG-BILLING-BUILD.md): the platform admin starts billing (local while Stripe is off), the
 * organization's portal says billing isn't connected, and the period rollover writes the estimate of a closed month and finishes the removals that waited
 * for it.
 */
@IntegrationTest
@AutoConfigureMockMvc
class OrgBillingStartIT extends MemberItSupport {

    static final String INBOX = "inbox.monitoring";

    @Autowired private OrgBillingAccountRepository accounts;
    @Autowired private OrgContractRepository contracts;
    @Autowired private OrgContractPriceRepository contractPrices;
    @Autowired private ProductRepository products;
    @Autowired private ConsultantLicenseRepository licenseRows;
    @Autowired private LicenseFeatureRepository featureRows;
    @Autowired private LicenseChangeRepository changeRows;
    @Autowired private OrgInvoiceRepository invoiceRows;
    @Autowired private OrgInvoiceLineRepository lineRows;
    @Autowired private OrgBillingPeriodService periods;

    private void billingModuleOn() {
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_BILLING, "{\"on\":true}", WHO, Instant.now()));
        settingsCache.invalidate();
    }

    @Test
    @WithMockUser(username = "billing-admin", authorities = AuthoritiesConstants.ADMIN)
    void thePlatformAdminStartsBillingOnceAndItStaysLocalWhileStripeIsOff() throws Exception {
        String url = "/api/admin/orgs/" + a.getId() + "/billing";
        JsonNode before = om.readTree(mockMvc.perform(get(url)).andReturn().getResponse().getContentAsString());
        assertThat(before.path("started").asBoolean()).isFalse();
        assertThat(before.path("stripeReady").asBoolean()).isFalse();

        MvcResult r = mockMvc.perform(post(url + "/start").contentType(MediaType.APPLICATION_JSON).content("{\"billingEmail\":\"ap@" + p + ".example.org\",\"waiveSetupFee\":false,\"reason\":\"Signed the order form\"}")).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode s = om.readTree(r.getResponse().getContentAsString());
        assertThat(s.path("account").path("source").asText()).isEqualTo("LOCAL");
        assertThat(s.path("account").path("stripeCustomer").asBoolean()).isFalse();
        assertThat(s.path("account").path("setupFee").path("status").asText()).isIn("OWED", "WAIVED");
        assertThat(audit.findByOrgIdAndAction(a.getId(), "ADMIN_BILLING_START", PageRequest.of(0, 5)).getTotalElements()).isEqualTo(1);

        MvcResult again = mockMvc.perform(post(url + "/start").contentType(MediaType.APPLICATION_JSON).content("{\"billingEmail\":\"ap@" + p + ".example.org\",\"reason\":\"Twice\"}")).andReturn();
        assertThat(again.getResponse().getStatus()).isEqualTo(409);
        assertThat(again.getResponse().getContentAsString()).contains("BILLING_STARTED");
    }

    @Test
    @WithMockUser(username = "billing-admin", authorities = AuthoritiesConstants.ADMIN)
    void thePlatformAdminSuspendsAnOrganizationByHandAndResumesItWithAReason() throws Exception {
        String url = "/api/admin/orgs/" + a.getId();
        MvcResult noReason = mockMvc.perform(post(url + "/suspend").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"\"}")).andReturn();
        assertThat(noReason.getResponse().getStatus()).isEqualTo(422);
        JsonNode s = om.readTree(mockMvc.perform(post(url + "/suspend").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Invoice unpaid for two months\"}")).andReturn().getResponse().getContentAsString());
        assertThat(s.path("status").asText()).isEqualTo("SUSPENDED");
        assertThat(orgs.findByOrgId(a.getId()).orElseThrow().getStatus().name()).isEqualTo("SUSPENDED");
        assertThat(audit.findByOrgIdAndAction(a.getId(), "ADMIN_ORG_SUSPEND", PageRequest.of(0, 5)).getTotalElements()).isEqualTo(1);
        assertThat(mockMvc.perform(post(url + "/suspend").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Trying the same action twice\"}")).andReturn().getResponse().getStatus()).isEqualTo(409);

        JsonNode r = om.readTree(mockMvc.perform(post(url + "/resume").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Paid in full\"}")).andReturn().getResponse().getContentAsString());
        assertThat(r.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(mockMvc.perform(post(url + "/resume").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Trying the same action twice\"}")).andReturn().getResponse().getStatus()).isEqualTo(409);
    }

    @Test
    @WithMockUser(username = "plain-user", authorities = AuthoritiesConstants.USER)
    void onlyThePlatformAdminMayStartBilling() throws Exception {
        assertThat(mockMvc.perform(get("/api/admin/orgs/" + a.getId() + "/billing")).andReturn().getResponse().getStatus()).isEqualTo(403);
        assertThat(mockMvc.perform(post("/api/admin/orgs/" + a.getId() + "/billing/start").contentType(MediaType.APPLICATION_JSON).content("{\"billingEmail\":\"x@y.test\",\"reason\":\"nope\"}")).andReturn().getResponse().getStatus()).isEqualTo(403);
    }

    @Test
    void thePortalSaysBillingIsNotConnectedAndIsTheGeneric404WithoutBillingManage() throws Exception {
        billingModuleOn();
        MvcResult r = call(login("owner"), post("/api/orgs/" + a.getId() + "/billing/portal"));
        assertStatus(r, 409);
        assertThat(r.getResponse().getContentAsString()).contains("BILLING_NOT_CONNECTED");
        assertGeneric404(call(login("plain"), post("/api/orgs/" + a.getId() + "/billing/portal")), "a member without billing.manage");
        assertGeneric404(call(login("bowner"), post("/api/orgs/" + a.getId() + "/billing/portal")), "another organization");
    }

    @Test
    void theRolloverWritesTheEstimateOfTheClosedMonthAndFinishesTheRemovalThatWaitedForIt() throws Exception {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        LocalDate lastStart = today.withDayOfMonth(1).minusMonths(1);
        LocalDate lastEnd = today.withDayOfMonth(1).minusDays(1);
        Instant periodEnd = today.withDayOfMonth(1).atStartOfDay(ZoneOffset.UTC).toInstant();

        // A contract price for the base licence and Inbox monitoring, and a consultant licensed with both since before last month
        OrgContract k = new OrgContract();
        k.setOrgId(a.getId());
        k.setReference("R-" + p);
        k.setName("Rollover contract");
        k.setStatus("ACTIVE");
        k.setStartsAt(Instant.now().minusSeconds(90L * 86_400));
        k = contracts.saveAndFlush(k);
        price(k.getId(), products.findByCode("ORG_BASE_LICENSE").orElseThrow().getId(), 1_499L);
        price(k.getId(), products.findByKindOrderBySortOrderAsc("FEATURE").stream().filter(x -> INBOX.equals(x.getFeatureKey())).findFirst().orElseThrow().getId(), 900L);
        JsonNode c = json(call(login("owner"), post("/api/orgs/" + a.getId() + "/consultants"), "{\"displayName\":\"Rolf Over\",\"email\":\"rolf@" + p + ".example.org\"}", null, key()));
        long consultantId = c.path("consultant").path("id").asLong();
        assertStatus(call(login("owner"), post("/api/orgs/" + a.getId() + "/licenses/" + consultantId), "{\"features\":[\"" + INBOX + "\"]}"), 200);
        ConsultantLicense lic = licenseRows.findByOrgIdAndConsultantIdOrderByStartsAtDesc(a.getId(), consultantId).get(0);
        lic.setStartsAt(lastStart.minusDays(3).atStartOfDay(ZoneOffset.UTC).toInstant());
        licenseRows.saveAndFlush(lic);
        LicenseFeature inbox = featureRows.findByOrgIdAndLicenseIdOrderByIdAsc(a.getId(), lic.getId()).get(0);
        inbox.setStartsAt(lic.getStartsAt());
        inbox.setEndsAt(periodEnd); // its removal waited for the end of last month
        featureRows.saveAndFlush(inbox);
        LicenseChange pending = new LicenseChange();
        pending.setOrgId(a.getId());
        pending.setLicenseId(lic.getId());
        pending.setKind("REMOVE_FEATURE");
        pending.setFeatureKey(INBOX);
        pending.setSummary("removes Inbox monitoring");
        pending.setAmountDeltaMinor(-900L);
        pending.setEffectiveAt(periodEnd);
        pending.setStatus("PENDING");
        pending.setAppliedAt(null);
        changeRows.saveAndFlush(pending);

        OrgBillingAccount acc = new OrgBillingAccount();
        acc.setOrgId(a.getId());
        acc.setCurrentPeriodStart(lastStart);
        acc.setCurrentPeriodEnd(lastEnd);
        accounts.saveAndFlush(acc);

        OrgBillingPeriodService.RunResult r = periods.runDue(Instant.now());
        assertThat(r.failed()).isZero();

        OrgBillingAccount after = accounts.findFirstByOrgId(a.getId()).orElseThrow();
        assertThat(after.getCurrentPeriodStart()).isEqualTo(today.withDayOfMonth(1));
        assertThat(after.getCurrentPeriodEnd()).isEqualTo(today.withDayOfMonth(today.lengthOfMonth()));
        List<OrgInvoice> invs = invoiceRows.findByOrgIdOrderByIssueDateDescIdDesc(a.getId(), PageRequest.of(0, 5)).getContent();
        assertThat(invs).hasSize(1);
        OrgInvoice inv = invs.get(0);
        assertThat(inv.getSource()).isEqualTo("LOCAL");
        assertThat(inv.getDescription()).endsWith("(estimate)");
        assertThat(inv.getPeriodStart()).isEqualTo(lastStart);
        assertThat(inv.getAmountMinor()).as("base + Inbox monitoring, which was live until the month ended").isEqualTo(2_399L);
        assertThat(inv.getDueDate()).isEqualTo(lastEnd.plusDays(16));
        assertThat(lineRows.findByOrgIdAndInvoiceIdOrderBySortOrderAsc(a.getId(), inv.getId())).hasSize(2);
        assertThat(changeRows.findByOrgIdAndId(a.getId(), pending.getId()).orElseThrow().getStatus()).isEqualTo("APPLIED");
        assertThat(featureRows.findByOrgIdAndLicenseIdOrderByIdAsc(a.getId(), lic.getId()).get(0).getLive()).isFalse();

        OrgBillingPeriodService.RunResult second = periods.runDue(Instant.now());
        assertThat(invoiceRows.countByOrgId(a.getId())).as("a second run writes nothing").isEqualTo(1);
        assertThat(second.failed()).isZero();
    }

    private void price(Long contractId, Long productId, long amount) {
        OrgContractPrice cp = new OrgContractPrice();
        cp.setOrgId(a.getId());
        cp.setContractId(contractId);
        cp.setProductId(productId);
        cp.setOverrideAmountMinor(amount);
        contractPrices.saveAndFlush(cp);
    }
}
