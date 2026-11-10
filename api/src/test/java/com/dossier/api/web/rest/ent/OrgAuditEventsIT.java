package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.Organization;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * The organization audit log page (D9, 2026-10-16 audit): the organization own rows, newest first, filtered and paged, with names and words and never a raw
 * login, free text or another organization row; only an auditor at ORG scope reads it, everyone else gets the generic 404.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgAuditEventsIT extends MemberItSupport {

    private static String url(Organization o) {
        return "/api/orgs/" + o.getId() + "/audit";
    }

    private OrgAuditEvent row(Organization org, String actorLogin, String action, String targetType, String targetLogin, int minutesAgo, String details) {
        OrgAuditEvent e = new OrgAuditEvent();
        e.setOrgId(org.getId());
        e.setActorLogin(actorLogin);
        e.setAction(action);
        e.setTargetType(targetType);
        e.setTargetLogin(targetLogin);
        e.setDetails(details);
        e.setCreatedAt(Instant.now().minus(minutesAgo, ChronoUnit.MINUTES).truncatedTo(ChronoUnit.MICROS));
        return audit.save(e);
    }

    @Test
    void theOwnerReadsTheirOrganizationsLogNewestFirstWithWordsAndNamesAndNothingElse() throws Exception {
        row(a, login("admin"), "MEMBER_INVITE", "MEMBER", login("plain"), 30, "secret free text");
        row(a, login("owner"), "BRANDING_PUBLISH", "BRANDING", null, 10, null);
        row(b, login("bowner"), "ORG_CREATE", "ORG", null, 5, null);
        em.flush();
        JsonNode r = json(call(login("owner"), get(url(a))));
        assertThat(r.path("total").asLong()).as("only this organization").isGreaterThanOrEqualTo(2);
        JsonNode first = r.path("items").get(0);
        assertThat(first.path("action").asText()).isEqualTo("BRANDING_PUBLISH");
        assertThat(first.path("label").asText()).isEqualTo("published the branding");
        assertThat(first.path("actorName").asText()).isEqualTo("Olivia Owner");
        JsonNode second = r.path("items").get(1);
        assertThat(second.path("action").asText()).isEqualTo("MEMBER_INVITE");
        assertThat(second.path("targetName").asText()).isEqualTo("Pat Plain");
        String body = r.toString();
        assertThat(body).doesNotContain("secret free text").doesNotContain("ORG_CREATE").doesNotContain(login("bowner")).doesNotContain("ent#").doesNotContain(login("owner")).doesNotContain("ipHash");
        assertThat(r.path("actions")).extracting(n -> n.path("action").asText()).contains("MEMBER_INVITE", "BRANDING_PUBLISH").doesNotContain("ORG_CREATE");
    }

    @Test
    void filtersAndPagingNarrowTheLog() throws Exception {
        for (int i = 0; i < 5; i++) row(a, login("admin"), "MEMBER_INVITE", "MEMBER", null, 100 + i, null);
        row(a, login("owner"), "BRANDING_PUBLISH", "BRANDING", null, 10, null);
        em.flush();
        JsonNode onlyInvites = json(call(login("owner"), get(url(a) + "?action=MEMBER_INVITE&size=2")));
        assertThat(onlyInvites.path("total").asLong()).isEqualTo(5);
        assertThat(onlyInvites.path("items")).hasSize(2);
        JsonNode third = json(call(login("owner"), get(url(a) + "?action=MEMBER_INVITE&size=2&page=2")));
        assertThat(third.path("items")).hasSize(1);
        String from = Instant.now().minus(20, ChronoUnit.MINUTES).toString();
        JsonNode recent = json(call(login("owner"), get(url(a) + "?from=" + from)));
        assertThat(recent.path("items")).extracting(n -> n.path("action").asText()).doesNotContain("MEMBER_INVITE");
        assertCode(call(login("owner"), get(url(a) + "?size=0")), 400, "VALIDATION");
        assertCode(call(login("owner"), get(url(a) + "?action=drop table")), 400, "VALIDATION");
    }

    @Test
    void everyoneWhoIsNotAnAuditorOrIsAStrangerGetsTheGeneric404() throws Exception {
        row(a, login("owner"), "BRANDING_PUBLISH", "BRANDING", null, 10, null);
        em.flush();
        assertGeneric404(call(login("spec"), get(url(a))), "a marketing specialist");
        assertGeneric404(call(login("c1"), get(url(a))), "a consultant");
        assertGeneric404(call(login("plain"), get(url(a))), "a plain member");
        assertGeneric404(call(login("hr"), get(url(a))), "HR holds a row-filtered audit grant");
        assertGeneric404(call(login("bowner"), get(url(a))), "another organization owner");
        assertThat(json(call(login("bowner"), get(url(b)))).path("items")).extracting(n -> n.path("action").asText()).doesNotContain("BRANDING_PUBLISH");
    }

    @Test
    void theCsvExportCarriesTheFilteredRowsAndIsItselfAudited() throws Exception {
        row(a, login("admin"), "MEMBER_INVITE", "MEMBER", login("plain"), 30, "secret free text");
        row(a, login("owner"), "BRANDING_PUBLISH", "BRANDING", null, 10, null);
        row(b, login("bowner"), "ORG_CREATE", "ORG", null, 5, null);
        em.flush();
        long exportsBefore = auditCount(a, "EXPORT");
        var res = call(login("owner"), get(url(a) + "/export?action=MEMBER_INVITE"));
        assertStatus(res, 200);
        assertThat(res.getResponse().getContentType()).startsWith("text/csv");
        assertThat(res.getResponse().getHeader("Content-Disposition")).contains("audit-log.csv");
        String csv = res.getResponse().getContentAsString();
        assertThat(csv).startsWith("When (UTC),Action,What happened,Who,Target type,Target");
        assertThat(csv).contains("MEMBER_INVITE").contains("Adam Admin").contains("Pat Plain");
        assertThat(csv).doesNotContain("BRANDING_PUBLISH").doesNotContain("ORG_CREATE").doesNotContain("secret free text").doesNotContain(login("admin"));
        assertThat(auditCount(a, "EXPORT")).isEqualTo(exportsBefore + 1);
    }

    @Test
    void aNameThatLooksLikeAFormulaIsNeutralisedInTheExport() throws Exception {
        var u = users.findOneByLogin(login("admin")).orElseThrow();
        u.setFirstName("=HYPERLINK(\"http://evil.example\")");
        u.setLastName("x");
        users.saveAndFlush(u);
        row(a, login("admin"), "MEMBER_INVITE", "MEMBER", null, 5, null);
        em.flush();
        String csv = call(login("owner"), get(url(a) + "/export")).getResponse().getContentAsString();
        assertThat(csv).contains("'=HYPERLINK").doesNotContain(",=HYPERLINK").doesNotContain("\"=HYPERLINK");
    }

    @Test
    void theExportHasTheSameGateAsTheLog() throws Exception {
        assertGeneric404(call(login("spec"), get(url(a) + "/export")), "a marketing specialist");
        assertGeneric404(call(login("plain"), get(url(a) + "/export")), "a plain member");
        assertGeneric404(call(login("hr"), get(url(a) + "/export")), "HR holds a row-filtered grant");
        assertGeneric404(call(login("bowner"), get(url(a) + "/export")), "another organization owner");
        assertCode(call(login("owner"), get(url(a) + "/export?action=drop table")), 400, "VALIDATION");
    }
}
