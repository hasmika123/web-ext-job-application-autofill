package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDemoSeeder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
 * The Marketing Performance board on the real stack (MySQL, Liquibase, demo seed): the marketer sees the six tiles and every card's shape, the seeded
 * targets and industry figures appear, her own targets override the org default (and only hers), and another tenant / a member of another org is the
 * generic 404. Needs Docker (Testcontainers); NOT run on the machine that wrote it.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(240)
class MktPerformanceIT {

    private static final String JESSICA = "demo-ent-acme-jessica";
    private static final String BETA_OWNER = "demo-ent-beta-bea";

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private MktPerformanceDemoSeeder performanceSeeder;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private OrganizationRepository orgs;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private TenantResolver resolver;

    private Organization acme;
    private Organization beta;

    @BeforeEach
    void seed() {
        assertThat(baseSeeder.seed().ran()).isTrue();
        talentSeeder.seed();
        performanceSeeder.seed();
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).orElseThrow();
        beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).orElseThrow();
    }

    @AfterEach
    void forget() {
        settings.invalidate();
        resolver.invalidate();
    }

    private JsonNode board(String login, Organization org, String query) throws Exception {
        MvcResult r = mockMvc.perform(get("/api/orgs/" + org.getId() + "/mkt/performance" + query).with(user(login))).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return om.readTree(r.getResponse().getContentAsString());
    }

    @Test
    void theMarketerSeesTheSixTilesAndEveryCard() throws Exception {
        JsonNode b = board(JESSICA, acme, "");
        assertThat(b.path("kpis")).hasSize(6);
        assertThat(b.path("kpis").get(0).path("key").asText()).isEqualTo("assignedConsultants");
        assertThat(b.path("kpis").get(0).path("sparkline")).hasSize(8);
        assertThat(b.path("weekly").path("weeks")).hasSize(8);
        assertThat(b.path("funnel").path("stages")).hasSize(4);
        assertThat(b.path("readiness").path("buckets")).hasSize(4);
        assertThat(b.path("top").size()).isLessThanOrEqualTo(5);
        assertThat(b.path("streams").path("rows").size()).isLessThanOrEqualTo(5);
        assertThat(b.path("benchmarks").path("rows")).hasSize(3);
        assertThat(b.path("goals").path("rows")).hasSize(4);
        // the seeded org targets and industry figures
        assertThat(b.path("goals").path("rows").get(0).path("target").asInt()).isEqualTo(200);
        assertThat(b.path("benchmarks").path("rows").get(0).path("industry").asDouble()).isEqualTo(25.0);
    }

    @Test
    void thePeriodSelectsChangeTheShape() throws Exception {
        assertThat(board(JESSICA, acme, "?weeks=12w").path("weekly").path("weeks")).hasSize(12);
        assertThat(board(JESSICA, acme, "?funnel=1m").path("funnel").path("period").asText()).isEqualTo("1m");
    }

    @Test
    void aMarketersOwnTargetOverridesTheOrgDefaultForThemAlone() throws Exception {
        MvcResult r = mockMvc.perform(put("/api/orgs/" + acme.getId() + "/mkt/performance/goals").with(user(JESSICA)).contentType(MediaType.APPLICATION_JSON).content("{\"submissions\":77}")).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(board(JESSICA, acme, "").path("goals").path("rows").get(0).path("target").asInt()).isEqualTo(77);
        assertThat(board(JESSICA, acme, "").path("goals").path("rows").get(1).path("target").asInt()).isEqualTo(60);
    }

    @Test
    void anotherTenantAndAMemberOfAnotherOrgAreTheGenericNotFound() throws Exception {
        assertThat(mockMvc.perform(get("/api/orgs/" + beta.getId() + "/mkt/performance").with(user(JESSICA))).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(mockMvc.perform(get("/api/orgs/" + acme.getId() + "/mkt/performance").with(user(BETA_OWNER))).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(mockMvc.perform(put("/api/orgs/" + beta.getId() + "/mkt/performance/goals").with(user(JESSICA)).contentType(MediaType.APPLICATION_JSON).content("{\"offers\":4}")).andReturn().getResponse().getStatus()).isEqualTo(404);
    }
}
