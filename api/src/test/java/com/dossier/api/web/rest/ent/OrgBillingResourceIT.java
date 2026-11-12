package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.billing.OrgInvoice;
import com.dossier.api.domain.ent.billing.OrgInvoiceLine;
import com.dossier.api.repository.ent.billing.OrgInvoiceLineRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceRepository;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

/**
 * The organization billing pages through the real chain (docs/enterprise-v2/ORG-BILLING-BUILD.md step 1a): the billing module gate, the permission
 * gate, tenant isolation, and the numbers a real organization (no billing account, licences without prices) reads.
 */
@IntegrationTest
@AutoConfigureMockMvc
class OrgBillingResourceIT extends MemberItSupport {

    @Autowired
    private OrgInvoiceRepository invoiceRows;

    @Autowired
    private OrgInvoiceLineRepository lineRows;

    private String url(String rest) {
        return "/api/orgs/" + a.getId() + rest;
    }

    private void billingOn() {
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_BILLING, "{\"on\":true}", WHO, Instant.now()));
        settingsCache.invalidate();
    }

    private long consultant(String name, String email) throws Exception {
        JsonNode c = json(call(login("owner"), post(url("/consultants")), "{\"displayName\":\"" + name + "\",\"email\":\"" + email + "\"}", null, key()));
        return c.path("consultant").path("id").asLong();
    }

    private OrgInvoice invoice() {
        OrgInvoice i = new OrgInvoice();
        i.setOrgId(a.getId());
        i.setInvoiceNumber("A-" + p);
        i.setPeriodStart(LocalDate.of(2026, 10, 1));
        i.setPeriodEnd(LocalDate.of(2026, 10, 31));
        i.setIssueDate(LocalDate.of(2026, 11, 1));
        i.setDueDate(LocalDate.of(2026, 11, 16));
        i.setDescription("October");
        i.setAmountMinor(2_998L);
        i.setAmountPaidMinor(0L);
        i = invoiceRows.saveAndFlush(i);
        OrgInvoiceLine l = new OrgInvoiceLine();
        l.setOrgId(a.getId());
        l.setInvoiceId(i.getId());
        l.setLineKind("BASE_LICENSE");
        l.setDescription("Base licence");
        l.setQuantity(2);
        l.setUnitAmountMinor(1_499L);
        l.setAmountMinor(2_998L);
        lineRows.saveAndFlush(l);
        return i;
    }

    @Test
    void withTheBillingModuleOffEveryPageIsTheGeneric404EvenForTheOwner() throws Exception {
        for (String path : new String[] { "/billing/overview", "/billing", "/billing/invoices", "/usage", "/usage/history" }) {
            assertGeneric404(call(login("owner"), get(url(path))), path);
        }
    }

    @Test
    void theOwnerReadsSetupWithRealCountsAndNoInventedPrice() throws Exception {
        billingOn();
        long ana = consultant("Ana Abe", "ana@" + p + ".example.org");
        consultant("Ben Bo", "ben@" + p + ".example.org");
        assertStatus(call(login("owner"), post(url("/licenses/" + ana)), "{\"features\":[]}"), 200);

        JsonNode o = json(call(login("owner"), get(url("/billing/overview"))));
        assertThat(o.path("status").asText()).isEqualTo("SETUP");
        assertThat(o.path("billingConnected").asBoolean()).isFalse();
        assertThat(o.path("tiles").path("consultants").asInt()).isEqualTo(2);
        assertThat(o.path("tiles").path("licensed").asInt()).isEqualTo(1);
        assertThat(o.path("tiles").path("unlicensed").asInt()).isEqualTo(1);
        assertThat(o.path("monthlyRecurringMinor").isNull()).as("no contract prices: 'price not set', never $0").isTrue();

        JsonNode b = json(call(login("owner"), get(url("/billing"))));
        assertThat(b.path("status").asText()).isEqualTo("SETUP");
        assertThat(b.path("account").isNull()).isTrue();

        JsonNode u = json(call(login("owner"), get(url("/usage"))));
        assertThat(u.path("consultants")).hasSize(1);
        assertThat(u.path("consultants").get(0).path("name").asText()).isEqualTo("Ana Abe");
        assertThat(json(call(login("owner"), get(url("/usage/history?months=3")))).path("months")).hasSize(3);
    }

    @Test
    void invoicesAreTheOrganizationsOwnAndAnotherOrganizationGetsA404() throws Exception {
        billingOn();
        OrgInvoice i = invoice();
        JsonNode page = json(call(login("owner"), get(url("/billing/invoices"))));
        assertThat(page.path("total").asLong()).isEqualTo(1);
        assertThat(page.path("rows").get(0).path("estimate").asBoolean()).isTrue();
        JsonNode d = json(call(login("owner"), get(url("/billing/invoices/" + i.getId()))));
        assertThat(d.path("lines").get(0).path("amountMinor").asLong()).isEqualTo(2_998L);

        assertGeneric404(call(login("bowner"), get(url("/billing/invoices/" + i.getId()))), "another organization's invoice");
        assertGeneric404(call(login("bowner"), get(url("/billing/overview"))), "another organization's overview");
        assertGeneric404(call(login("plain"), get(url("/billing/overview"))), "a member without billing.view");
        assertGeneric404(call(login("plain"), get(url("/usage"))), "a member without usage.view");
        assertThat(json(call(login("bowner"), get("/api/orgs/" + b.getId() + "/billing/invoices"))).path("total").asLong()).as("B sees none of A's").isZero();
    }
}
