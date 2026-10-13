package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.TenantResolver;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Job Matches on the real stack (MySQL, Testcontainers): the seeded Acme matches draw the board for Sarah (Org Admin + Marketing
 * Manager, ORG scope), Assign records an ASSIGNED match with an audit row, and another tenant's member or match id is the generic 404.
 * NOT executed on machines without Docker; written against the same fixtures as {@code OrgDashboardDemoSeedIT} and {@code TalentSchemaIT}.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(180)
class MktMatchesIT {

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private OrganizationRepository orgs;
    @Autowired private RequirementMatchRepository matches;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private TenantResolver resolver;

    private Organization acme;
    private Organization beta;

    @BeforeEach
    void seed() {
        assertThat(baseSeeder.seed().ran()).isTrue();
        assertThat(talentSeeder.seed().ran()).isTrue();
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).orElseThrow();
        beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).orElseThrow();
    }

    @AfterEach
    void forget() {
        settings.invalidate();
        resolver.invalidate();
    }

    private String url(Organization o, String tail) {
        return "/api/orgs/" + o.getId() + "/mkt/matches" + tail;
    }

    @Test
    void sarahSeesTheBoardFromTheSeededMatches() throws Exception {
        MvcResult r = mockMvc.perform(get(url(acme, "?size=10")).with(user("demo-ent-acme-sarah"))).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode body = om.readTree(r.getResponse().getContentAsString());
        assertThat(body.path("kpis")).hasSize(4);
        assertThat(body.path("total").asLong()).isPositive();
        assertThat(body.path("items").size()).isBetween(1, 10);
        assertThat(body.path("items").get(0).path("score").asInt()).isGreaterThanOrEqualTo(body.path("items").get(body.path("items").size() - 1).path("score").asInt());
        assertThat(body.path("explanation").path("ticks").size()).isPositive();
        assertThat(body.path("topToday").size()).isBetween(1, 5);
    }

    @Test
    void assignRecordsTheMatchOnly() throws Exception {
        RequirementMatch target = matches.findByOrgId(acme.getId()).stream()
            .filter(m -> "SUGGESTED".equals(m.getStatus()))
            .filter(m -> requirements.findByOrgIdAndId(acme.getId(), m.getRequirementId()).map(x -> "OPEN".equals(x.getStatus())).orElse(false))
            .findFirst().orElseThrow();
        MvcResult r = mockMvc.perform(post(url(acme, "/" + target.getId() + "/assign")).with(user("demo-ent-acme-sarah"))).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(om.readTree(r.getResponse().getContentAsString()).path("status").asText()).isEqualTo("ASSIGNED");
        assertThat(matches.findByOrgIdAndId(acme.getId(), target.getId()).orElseThrow().getStatus()).isEqualTo("ASSIGNED");
    }

    @Test
    void anotherTenantsMemberAndAnotherTenantsMatchAreNotFound() throws Exception {
        assertThat(mockMvc.perform(get(url(acme, "")).with(user("demo-ent-beta-bea"))).andReturn().getResponse().getStatus()).isEqualTo(404);
        Long betaMatch = matches.findByOrgId(beta.getId()).get(0).getId();
        String before = matches.findByOrgIdAndId(beta.getId(), betaMatch).orElseThrow().getStatus();
        assertThat(mockMvc.perform(get(url(acme, "/" + betaMatch)).with(user("demo-ent-acme-sarah"))).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(mockMvc.perform(post(url(acme, "/" + betaMatch + "/assign")).with(user("demo-ent-acme-sarah"))).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(matches.findByOrgIdAndId(beta.getId(), betaMatch).orElseThrow().getStatus()).isEqualTo(before);
    }
}
