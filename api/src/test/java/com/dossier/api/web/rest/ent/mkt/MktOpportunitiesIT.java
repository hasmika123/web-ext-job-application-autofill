package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunityDemoSeeder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Opportunities page on the real stack (MySQL via Testcontainers): the migration and the seeder, the caller's scope, the tenant wall
 * (a foreign org or a consultant outside the scope is a 404), and the E1 rule that Assign asks for interest but never answers for the consultant.
 * NOT executed on the machine that wrote it (no Docker there): it compiles, run it in CI.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(240)
class MktOpportunitiesIT {

    private static final String MARKETER = "demo-ent-acme-jessica"; // Marketing Specialist: ASSIGNED scope
    private static final String ADMIN = "demo-ent-acme-sarah"; // Org Admin + Marketing Manager: ORG scope
    private static final String BETA_MARKETER = "demo-ent-beta-bea";

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private MktOpportunityDemoSeeder oppSeeder;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private OrganizationRepository orgs;
    @Autowired private MarketerAssignmentRepository assignments;
    @Autowired private RequirementMatchRepository matches;
    @Autowired private MktOpportunityRepository opps;
    @Autowired private MktOpportunityEventRepository events;
    @Autowired private JdbcTemplate jdbc;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private TenantResolver resolver;

    private Long acme;
    private Long beta;

    // The class-level @Timeout(240) does not reach lifecycle methods, so the 15 s default (junit-platform.properties) cut off this seeding. The three demo seeders
    // insert a few hundred rows one statement at a time, a fresh set per test (the test rolls back): about 20 s on a loaded machine, almost all of it waiting on MySQL.
    @BeforeEach
    @org.junit.jupiter.api.Timeout(240)
    void seed() {
        assertThat(baseSeeder.seed().ran()).isTrue();
        assertThat(talentSeeder.seed().ran()).isTrue();
        oppSeeder.seed();
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).map(Organization::getId).orElseThrow();
        beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).map(Organization::getId).orElseThrow();
    }

    @AfterEach
    void forget() {
        settings.invalidate();
        resolver.invalidate();
    }

    private JsonNode json(MvcResult r, int status) throws Exception {
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(status);
        return status == 200 ? om.readTree(r.getResponse().getContentAsString()) : null;
    }

    private JsonNode list(String login, Long org, String query) throws Exception {
        return json(mockMvc.perform(get("/api/orgs/" + org + "/mkt/opportunities" + query).with(user(login))).andReturn(), 200);
    }

    @Test
    void theMigrationCreatesBothTablesWithTheTenantKeys() {
        for (String t : new String[] { "mkt_opportunity", "mkt_opportunity_event" }) {
            assertThat(jdbc.queryForObject("select count(*) from information_schema.columns where table_schema = database() and table_name = ? and column_name = 'org_id' and is_nullable = 'NO'", Long.class, t)).as(t).isEqualTo(1L);
        }
        assertThat(jdbc.queryForObject("select count(*) from information_schema.key_column_usage where table_schema = database() and table_name = 'mkt_opportunity' and referenced_table_name = 'requirement_match' and ordinal_position = 1 and column_name = 'org_id'", Long.class))
            .as("composite tenant FK to requirement_match").isEqualTo(1L);
    }

    @Test
    void theSeederFillsAcmeAndASecondRunAddsNothing() {
        long before = opps.countByOrgId(acme);
        assertThat(before).isGreaterThan(0);
        assertThat(events.countByOrgId(acme)).isGreaterThan(0);
        oppSeeder.seed();
        assertThat(opps.countByOrgId(acme)).isEqualTo(before);
    }

    @Test
    void anAssignedMarketerOnlySeesTheirOwnConsultantsAndAnAdminSeesAll() throws Exception {
        JsonNode mine = list(MARKETER, acme, "?days=0&size=100");
        JsonNode all = list(ADMIN, acme, "?days=0&size=100");
        assertThat(all.path("total").asLong()).isGreaterThanOrEqualTo(mine.path("total").asLong());
        Set<Long> allowed = new HashSet<>();
        for (MarketerAssignment a : assignments.findByOrgId(acme)) allowed.add(a.getConsultantId());
        for (JsonNode item : mine.path("items")) assertThat(allowed).contains(item.path("consultant").path("id").asLong());
        assertThat(mine.path("kpis")).hasSize(4);
    }

    @Test
    void aConsultantOutsideTheCallersScopeIsA404() throws Exception {
        JsonNode mine = list(MARKETER, acme, "?days=0&size=100");
        Set<Long> visible = new HashSet<>();
        for (JsonNode item : mine.path("items")) visible.add(item.path("id").asLong());
        JsonNode all = list(ADMIN, acme, "?days=0&size=100");
        Long foreign = null;
        for (JsonNode item : all.path("items")) {
            if (!visible.contains(item.path("id").asLong())) {
                foreign = item.path("id").asLong();
                break;
            }
        }
        assertThat(foreign).as("Acme has opportunities that jessica does not market").isNotNull();
        json(mockMvc.perform(get("/api/orgs/" + acme + "/mkt/opportunities/" + foreign).with(user(MARKETER))).andReturn(), 404);
        json(mockMvc.perform(post("/api/orgs/" + acme + "/mkt/opportunities/" + foreign + "/assign").with(user(MARKETER))).andReturn(), 404);
    }

    @Test
    void aConsultantOnAProjectIsListedDisabledInThePickerAndAssigningThemIsAClear409() throws Exception {
        JsonNode mine = list(MARKETER, acme, "?days=0&size=100");
        JsonNode item = mine.path("items").get(0);
        long oppId = item.path("id").asLong();
        long consultantId = item.path("consultant").path("id").asLong();
        jdbc.update("update client_requirement set status = 'OPEN' where org_id = ? and id = (select requirement_id from requirement_match where id = ?)", acme, oppId);
        jdbc.update("update consultant_profile set marketing_status = 'PAUSED' where org_id = ? and id = ?", acme, consultantId);
        em.flush();
        em.clear(); // the native updates bypass the persistence context (shared with the request in this transaction): forget the seeded copies so the picker reads the row

        JsonNode options = json(mockMvc.perform(get("/api/orgs/" + acme + "/mkt/opportunities/options").with(user(MARKETER))).andReturn(), 200);
        JsonNode paused = null;
        for (JsonNode c : options.path("consultants")) if (c.path("id").asLong() == consultantId) paused = c;
        assertThat(paused).as("still listed").isNotNull();
        assertThat(paused.path("pausedReason").asText()).isEqualTo("On a project — marketing paused");

        MvcResult r = mockMvc.perform(post("/api/orgs/" + acme + "/mkt/opportunities/" + oppId + "/assign").with(user(MARKETER))).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(409);
        assertThat(om.readTree(r.getResponse().getContentAsString()).path("code").asText()).isEqualTo("CONSULTANT_PAUSED");
    }

    @Test
    void anotherTenantIsA404NotA403() throws Exception {
        json(mockMvc.perform(get("/api/orgs/" + beta + "/mkt/opportunities").with(user(MARKETER))).andReturn(), 404);
        json(mockMvc.perform(get("/api/orgs/" + acme + "/mkt/opportunities").with(user(BETA_MARKETER))).andReturn(), 404);
        Long acmeMatch = matches.findByOrgId(acme).get(0).getId();
        json(mockMvc.perform(get("/api/orgs/" + beta + "/mkt/opportunities/" + acmeMatch).with(user(BETA_MARKETER))).andReturn(), 404);
        json(mockMvc.perform(post("/api/orgs/" + beta + "/mkt/opportunities/" + acmeMatch + "/review").with(user(BETA_MARKETER))).andReturn(), 404);
    }

    @Test
    void notifyAsksForInterestButNeverChangesAnyConsultantsAnswer() throws Exception {
        long answered = jdbc.queryForObject("select count(*) from mkt_opportunity where org_id = ? and interest <> 'NO_RESPONSE'", Long.class, acme);
        long noResponse = jdbc.queryForObject("select count(*) from mkt_opportunity where org_id = ? and interest = 'NO_RESPONSE'", Long.class, acme);
        json(mockMvc.perform(post("/api/orgs/" + acme + "/mkt/opportunities/notify").with(user(ADMIN))).andReturn(), 200);
        assertThat(jdbc.queryForObject("select count(*) from mkt_opportunity where org_id = ? and interest <> 'NO_RESPONSE'", Long.class, acme)).isEqualTo(answered);
        assertThat(jdbc.queryForObject("select count(*) from mkt_opportunity where org_id = ? and interest = 'NO_RESPONSE'", Long.class, acme)).isEqualTo(noResponse);
    }

    @Test
    void theExportIsACsvOfTheVisibleRows() throws Exception {
        MvcResult r = mockMvc.perform(get("/api/orgs/" + acme + "/mkt/opportunities/export?days=0").with(user(MARKETER))).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(r.getResponse().getContentType()).startsWith("text/csv");
        assertThat(r.getResponse().getContentAsString()).startsWith("Consultant,Job Title,Client").doesNotContain("@");
    }
}
