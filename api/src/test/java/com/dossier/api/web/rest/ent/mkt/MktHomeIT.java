package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.TenantResolver;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
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
 * The Marketing Home board on the real stack (MySQL, Liquibase, demo seed): Acme's marketer sees only her own consultants, all six tiles and the section
 * shapes come back, another tenant and a non-marketer are the generic 404. Needs Docker (Testcontainers); NOT run on the machine that wrote it.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(240)
class MktHomeIT {

    private static final String JESSICA = "demo-ent-acme-jessica";
    private static final String BETA_OWNER = "demo-ent-beta-bea";

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private OrganizationRepository orgs;
    @Autowired private MarketerAssignmentRepository assignments;
    @Autowired private UserRepository users;
    @Autowired private OrgMemberRepository members;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private TenantResolver resolver;

    private Organization acme;
    private Organization beta;

    @BeforeEach
    void seed() {
        assertThat(baseSeeder.seed().ran()).isTrue();
        talentSeeder.seed();
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).orElseThrow();
        beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).orElseThrow();
    }

    @AfterEach
    void forget() {
        settings.invalidate();
        resolver.invalidate();
    }

    private Set<Long> jessicasConsultants() {
        Long userId = users.findOneByLogin(JESSICA).orElseThrow().getId();
        Long memberId = members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), userId, List.of(OrgMemberStatus.ACTIVE)).get(0).getId();
        Set<Long> ids = new HashSet<>();
        for (MarketerAssignment a : assignments.findByOrgId(acme.getId())) if (memberId.equals(a.getMarketerMemberId()) || memberId.equals(a.getBackupMemberId())) ids.add(a.getConsultantId());
        return ids;
    }

    private JsonNode board(String login, Organization org) throws Exception {
        MvcResult r = mockMvc.perform(get("/api/orgs/" + org.getId() + "/mkt/home").with(user(login))).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return om.readTree(r.getResponse().getContentAsString());
    }

    @Test
    void theMarketerSeesTheSixTilesAndOnlyHerOwnConsultants() throws Exception {
        JsonNode b = board(JESSICA, acme);
        assertThat(b.path("kpis")).hasSize(6);
        assertThat(b.path("kpis").get(0).path("key").asText()).isEqualTo("assigned");
        Set<Long> mine = jessicasConsultants();
        assertThat(mine).isNotEmpty();
        assertThat(b.path("kpis").get(0).path("value").asLong()).isEqualTo(mine.size());
        assertThat(b.path("kpis").get(0).path("sparkline")).hasSize(8);
        assertThat(b.path("talent").size()).isBetween(1, 5);
        for (JsonNode t : b.path("talent")) {
            assertThat(mine).contains(t.path("id").asLong());
            assertThat(t.path("nextAction").path("label").asText()).isNotBlank();
        }
        assertThat(b.path("openings").size()).isLessThanOrEqualTo(5);
        assertThat(b.path("tasks").size()).isLessThanOrEqualTo(5);
        assertThat(b.path("interviews").size()).isLessThanOrEqualTo(4);
        assertThat(b.path("activity").size()).isLessThanOrEqualTo(5);
    }

    @Test
    void anotherTenantAndAMemberOfAnotherOrgAreTheGenericNotFound() throws Exception {
        assertThat(mockMvc.perform(get("/api/orgs/" + beta.getId() + "/mkt/home").with(user(JESSICA))).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(mockMvc.perform(get("/api/orgs/" + acme.getId() + "/mkt/home").with(user(BETA_OWNER))).andReturn().getResponse().getStatus()).isEqualTo(404);
    }
}
