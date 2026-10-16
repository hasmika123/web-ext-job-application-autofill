package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.mkt.MktResumeEventRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.ent.mkt.resumes.MktResumesDemoSeeder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing Resumes page on the real stack (MySQL via Testcontainers, the talent demo seed): scope (a marketer sees only the consultants
 * assigned to them, the org admin sees all), the tenant wall, the edit/approval rules and the honest "no file stored" download.
 * NOT executed on the machine that wrote it (no Docker); it compiles and mirrors {@code OrgDashboardDemoSeedIT}.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(180)
class MktResumesIT {

    private static final String MARKETER = "demo-ent-acme-jessica";
    private static final String ADMIN = "demo-ent-acme-sarah";
    private static final String BETA_MARKETER = "demo-ent-beta-priya";

    @Autowired private EnterpriseDemoSeeder seeder;
    @Autowired private TalentDemoSeeder talent;
    @Autowired private MktResumesDemoSeeder mktSeeder;
    @Autowired private MktResumeEventRepository events;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private OrganizationRepository orgs;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private TenantResolver resolver;

    private Organization acme;
    private Organization beta;

    @BeforeEach
    @org.junit.jupiter.api.Timeout(120) // the demo seed on a cold context outlasts the suite-wide 15 s default
    void seed() {
        assertThat(seeder.seed().ran()).isTrue();
        talent.seed();
        mktSeeder.seed();
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).orElseThrow();
        beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).orElseThrow();
    }

    @AfterEach
    void forget() {
        settings.invalidate();
        resolver.invalidate();
    }

    private String base(Organization org) {
        return "/api/orgs/" + org.getId() + "/mkt/resumes";
    }

    private MvcResult getAs(String login, String url) throws Exception {
        return mockMvc.perform(get(url).with(user(login))).andReturn();
    }

    private JsonNode json(MvcResult r) throws Exception {
        return om.readTree(r.getResponse().getContentAsString());
    }

    /** Every id the caller can see: the API caps a page at 100 and the demo organization has more resumes than that, so read all pages. */
    private Set<Long> ids(String login, Organization org) throws Exception {
        Set<Long> out = new HashSet<>();
        for (int page = 0; ; page++) {
            MvcResult r = getAs(login, base(org) + "?size=100&page=" + page);
            assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
            JsonNode body = json(r);
            for (JsonNode i : body.path("items")) out.add(i.path("id").asLong());
            if (out.size() >= body.path("total").asLong() || body.path("items").isEmpty()) return out;
        }
    }

    @Test
    void theSeedWritesActivityOnceAndAnotherRunAddsNothing() {
        long before = events.countByOrgId(acme.getId());
        assertThat(before).isGreaterThan(0);
        assertThat(mktSeeder.seed()).isZero();
        assertThat(events.countByOrgId(acme.getId())).isEqualTo(before);
    }

    @Test
    void aMarketerSeesFewerResumesThanTheAdminAndTheBoardNumbersAreReal() throws Exception {
        Set<Long> mine = ids(MARKETER, acme);
        Set<Long> everything = ids(ADMIN, acme);
        assertThat(mine).isNotEmpty();
        assertThat(everything).containsAll(mine);
        assertThat(everything.size()).isGreaterThan(mine.size());

        JsonNode board = json(getAs(MARKETER, base(acme) + "?size=10"));
        assertThat(board.path("kpis")).hasSize(4);
        assertThat(board.path("kpis").get(0).path("value").asLong()).isEqualTo(mine.size());
        assertThat(board.path("kpis").get(0).path("sparkline")).hasSize(8);
        assertThat(board.path("activity").size()).isBetween(1, 5);
    }

    @Test
    void anotherConsultantsResumeIsANotFoundForAMarketer() throws Exception {
        Set<Long> mine = ids(MARKETER, acme);
        Long foreign = ids(ADMIN, acme).stream().filter(i -> !mine.contains(i)).findFirst().orElseThrow();
        assertThat(getAs(MARKETER, base(acme) + "/" + foreign).getResponse().getStatus()).isEqualTo(404);
        assertThat(mockMvc.perform(patch(base(acme) + "/" + foreign).with(user(MARKETER)).contentType(MediaType.APPLICATION_JSON).content("{\"headline\":\"x\"}")).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(getAs(MARKETER, base(acme) + "/" + foreign + "/download").getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void theTenantWallHoldsBothWays() throws Exception {
        Long betaResume = ids(BETA_MARKETER, beta).stream().findFirst().orElseThrow();
        // Beta's resume id on Acme's path, as an Acme admin: not found. Acme's marketer on Beta's path: not a member, same 404.
        assertThat(getAs(ADMIN, base(acme) + "/" + betaResume).getResponse().getStatus()).isEqualTo(404);
        assertThat(getAs(MARKETER, base(beta)).getResponse().getStatus()).isEqualTo(404);
        assertThat(ids(BETA_MARKETER, beta)).doesNotContainAnyElementsOf(ids(ADMIN, acme));
    }

    @Test
    void editMakesANewPendingVersionWithAnEventAndDownloadIsHonest() throws Exception {
        Long id = ids(MARKETER, acme).stream().findFirst().orElseThrow();
        JsonNode before = json(getAs(MARKETER, base(acme) + "/" + id)).path("row");
        MvcResult r = mockMvc.perform(patch(base(acme) + "/" + id).with(user(MARKETER)).contentType(MediaType.APPLICATION_JSON).content("{\"headline\":\"Updated by the marketing team\"}")).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode after = json(r);
        assertThat(after.path("row").path("version").asInt()).isEqualTo(before.path("version").asInt() + 1);
        assertThat(after.path("row").path("approval").asText()).isEqualTo("PENDING");
        assertThat(after.path("headline").asText()).isEqualTo("Updated by the marketing team");
        assertThat(after.path("history").get(0).path("kind").asText()).isEqualTo("UPDATED");

        MvcResult dl = getAs(MARKETER, base(acme) + "/" + id + "/download");
        assertThat(dl.getResponse().getStatus()).isEqualTo(404);
        assertThat(dl.getResponse().getContentAsString()).contains("NO_FILE_STORED");
    }

    @Test
    void aMarketerCannotApproveTheirOwnRequestButTheAdminCan() throws Exception {
        Long id = ids(MARKETER, acme).stream().findFirst().orElseThrow();
        mockMvc.perform(post(base(acme) + "/" + id + "/approval-request").with(user(MARKETER))).andReturn();
        assertThat(mockMvc.perform(post(base(acme) + "/" + id + "/approve").with(user(MARKETER))).andReturn().getResponse().getStatus()).isEqualTo(404);
        MvcResult ok = mockMvc.perform(post(base(acme) + "/" + id + "/approve").with(user(ADMIN))).andReturn();
        assertThat(ok.getResponse().getStatus()).as(ok.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(json(ok).path("row").path("approval").asText()).isEqualTo("APPROVED");
    }
}
