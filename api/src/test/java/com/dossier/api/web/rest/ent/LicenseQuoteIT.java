package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.billing.LicenseQuote;
import com.dossier.api.domain.ent.billing.OrgBillingAccount;
import com.dossier.api.domain.ent.billing.OrgContract;
import com.dossier.api.domain.ent.billing.OrgContractPrice;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.ent.billing.LicenseQuoteRepository;
import com.dossier.api.repository.ent.billing.OrgBillingAccountRepository;
import com.dossier.api.repository.ent.billing.OrgContractPriceRepository;
import com.dossier.api.repository.ent.billing.OrgContractRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Licence quotes through the real chain (docs/enterprise-v2/ORG-BILLING-BUILD.md step 1b): price, confirm, the refusals (used, stale, expired), removals at
 * the end of the billing period with Undo, and the tenant wall. No money moves anywhere.
 */
@IntegrationTest
@AutoConfigureMockMvc
class LicenseQuoteIT extends MemberItSupport {

    static final String INBOX = "inbox.monitoring";

    @Autowired private LicenseQuoteRepository quoteRows;
    @Autowired private OrgBillingAccountRepository accounts;
    @Autowired private OrgContractRepository contracts;
    @Autowired private OrgContractPriceRepository contractPrices;
    @Autowired private ProductRepository products;

    private String url(String rest) {
        return "/api/orgs/" + a.getId() + "/licenses" + rest;
    }

    private long consultant(String name) throws Exception {
        JsonNode c = json(call(login("owner"), post("/api/orgs/" + a.getId() + "/consultants"), "{\"displayName\":\"" + name + "\",\"email\":\"" + name.toLowerCase().replace(' ', '.') + "@" + p + ".example.org\"}", null, key()));
        return c.path("consultant").path("id").asLong();
    }

    private JsonNode quote(long consultantId, String... features) throws Exception {
        MvcResult r = call(login("owner"), post(url("/quotes")), "{\"consultantId\":" + consultantId + ",\"features\":[" + (features.length == 0 ? "" : "\"" + String.join("\",\"", features) + "\"") + "]}");
        assertStatus(r, 200);
        return json(r);
    }

    private MvcResult confirm(long quoteId) throws Exception {
        return call(login("owner"), post(url("/quotes/" + quoteId + "/confirm")), null, null, key());
    }

    /** A billing period around now (the month we are in), so removals wait for its end. */
    private LocalDate periodWithPrices(long baseMinor, long inboxMinor) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        OrgBillingAccount acc = new OrgBillingAccount();
        acc.setOrgId(a.getId());
        acc.setCurrentPeriodStart(today.withDayOfMonth(1));
        acc.setCurrentPeriodEnd(today.withDayOfMonth(today.lengthOfMonth()));
        accounts.saveAndFlush(acc);
        OrgContract k = new OrgContract();
        k.setOrgId(a.getId());
        k.setReference("Q-" + p);
        k.setName("Quote test contract");
        k.setStatus("ACTIVE");
        k.setStartsAt(Instant.now().minusSeconds(86_400));
        k = contracts.saveAndFlush(k);
        price(k.getId(), products.findByCode("ORG_BASE_LICENSE").orElseThrow().getId(), baseMinor);
        Long inbox = products.findByKindOrderBySortOrderAsc("FEATURE").stream().filter(x -> INBOX.equals(x.getFeatureKey())).findFirst().orElseThrow().getId();
        price(k.getId(), inbox, inboxMinor);
        return acc.getCurrentPeriodEnd();
    }

    private void price(Long contractId, Long productId, long amount) {
        OrgContractPrice cp = new OrgContractPrice();
        cp.setOrgId(a.getId());
        cp.setContractId(contractId);
        cp.setProductId(productId);
        cp.setOverrideAmountMinor(amount);
        contractPrices.saveAndFlush(cp);
    }

    @Test
    void withoutBillingAQuoteSaysPriceNotSetAndConfirmingGivesTheLicenceOnce() throws Exception {
        long ana = consultant("Ana Quote");
        JsonNode q = quote(ana, INBOX);
        assertThat(q.path("status").asText()).isEqualTo("OPEN");
        assertThat(q.path("lines")).hasSize(2);
        assertThat(q.path("lines").get(0).path("op").asText()).isEqualTo("CREATE");
        assertThat(q.path("lines").get(1).path("op").asText()).isEqualTo("ADD_FEATURE");
        assertThat(q.path("totals").path("priceSet").asBoolean()).isFalse();
        assertThat(q.path("totals").path("proposedMonthlyMinor").isNull()).as("no price: null, never $0").isTrue();
        assertThat(q.path("totals").path("dueNowMinor").isNull()).as("no billing period: nothing is due now").isTrue();
        assertThat(q.path("billingConnected").asBoolean()).isFalse();
        long auditBefore = audit.countByOrgId(a.getId());

        JsonNode d = json(confirm(q.path("id").asLong()));
        assertThat(d.path("row").path("status").asText()).isEqualTo("ACTIVE");
        assertThat(d.path("row").path("features").toString()).contains(INBOX);
        assertThat(audit.countByOrgId(a.getId()) - auditBefore).as("one audit row").isEqualTo(1);
        assertThat(json(call(login("owner"), get(url("/quotes/" + q.path("id").asLong())))).path("status").asText()).isEqualTo("CONFIRMED");

        MvcResult again = confirm(q.path("id").asLong());
        assertStatus(again, 409);
        assertThat(again.getResponse().getContentAsString()).contains("QUOTE_USED");
        MvcResult same = call(login("owner"), post(url("/quotes")), "{\"consultantId\":" + ana + ",\"features\":[\"" + INBOX + "\"]}");
        assertStatus(same, 422);
        assertThat(same.getResponse().getContentAsString()).contains("NO_CHANGE");
    }

    @Test
    void aQuoteGoesStaleWhenTheLicenceMovesAndExpiresAfterItsTime() throws Exception {
        long ben = consultant("Ben Stale");
        assertStatus(call(login("owner"), post(url("/" + ben)), "{\"features\":[]}"), 200);
        JsonNode q = quote(ben, INBOX);
        assertStatus(call(login("owner"), put(url("/" + ben + "/features")), "{\"features\":[\"" + INBOX + "\"]}"), 200);
        MvcResult stale = confirm(q.path("id").asLong());
        assertStatus(stale, 409);
        assertThat(stale.getResponse().getContentAsString()).contains("QUOTE_STALE");

        JsonNode q2 = quote(ben);
        LicenseQuote row = quoteRows.findByOrgIdAndId(a.getId(), q2.path("id").asLong()).orElseThrow();
        row.setExpiresAt(Instant.now().minusSeconds(5));
        quoteRows.saveAndFlush(row);
        MvcResult gone = confirm(q2.path("id").asLong());
        assertStatus(gone, 410);
        assertThat(gone.getResponse().getContentAsString()).contains("QUOTE_EXPIRED");
        assertThat(json(call(login("owner"), get(url("/quotes/" + q2.path("id").asLong())))).path("status").asText()).isEqualTo("EXPIRED");
    }

    @Test
    void withABillingPeriodAnAdditionIsProratedAndARemovalWaitsForThePeriodEndAndCanBeUndone() throws Exception {
        LocalDate lastDay = periodWithPrices(1_499L, 900L);
        long cy = consultant("Cy Period");
        JsonNode give = quote(cy, INBOX);
        assertThat(give.path("totals").path("priceSet").asBoolean()).isTrue();
        assertThat(give.path("totals").path("proposedMonthlyMinor").asLong()).isEqualTo(2_399L);
        long due = give.path("totals").path("dueNowMinor").asLong();
        assertThat(due).as("the rest of this period, prorated").isPositive().isLessThanOrEqualTo(2_399L);
        assertStatus(confirm(give.path("id").asLong()), 200);

        JsonNode drop = quote(cy);
        assertThat(drop.path("lines").get(0).path("op").asText()).isEqualTo("REMOVE_FEATURE");
        assertThat(Instant.parse(drop.path("lines").get(0).path("effectiveAt").asText())).isEqualTo(lastDay.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant());
        assertThat(drop.path("totals").path("deltaMinor").asLong()).isEqualTo(-900L);
        JsonNode d = json(confirm(drop.path("id").asLong()));
        assertThat(d.path("row").path("features").toString()).as("kept until the period ends").contains(INBOX);
        assertThat(d.path("row").path("endingFeatures").toString()).contains(INBOX);
        assertThat(d.path("scheduled")).hasSize(1);
        long changeId = d.path("scheduled").get(0).path("changeId").asLong();

        assertGeneric404(call(login("bowner"), delete(url("/changes/" + changeId))), "another organization's change");
        JsonNode kept = json(call(login("owner"), delete(url("/changes/" + changeId))));
        assertThat(kept.path("scheduled")).isEmpty();
        assertThat(kept.path("row").path("endingFeatures")).isEmpty();
        assertThat(kept.path("row").path("features").toString()).contains(INBOX);
        MvcResult twice = call(login("owner"), delete(url("/changes/" + changeId)));
        assertStatus(twice, 409);
        assertThat(twice.getResponse().getContentAsString()).contains("NOT_PENDING");
    }

    @Test
    void quotesAreTheOrganizationsOwn() throws Exception {
        long dee = consultant("Dee Wall");
        JsonNode q = quote(dee);
        long id = q.path("id").asLong();
        assertGeneric404(call(login("bowner"), get(url("/quotes/" + id))), "another organization's quote");
        assertGeneric404(call(login("bowner"), post(url("/quotes/" + id + "/confirm")), null, null, key()), "confirming another organization's quote");
        assertGeneric404(call(login("plain"), get(url("/quotes/" + id))), "a member without licenses.manage");
        assertGeneric404(call(login("bowner"), post("/api/orgs/" + b.getId() + "/licenses/quotes"), "{\"consultantId\":" + dee + ",\"features\":[]}"), "B pricing A's consultant");
        assertThat(quoteRows.findByOrgIdAndId(a.getId(), id).orElseThrow().getStatus()).isEqualTo("OPEN");
    }
}
