package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.mkt.MktTask;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktTaskEventRepository;
import com.dossier.api.repository.ent.mkt.MktTaskRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDemoSeeder;
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
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Tasks page on the real stack (MySQL, Liquibase, demo seed): Acme's marketer sees only her own tasks (24 open + 16 completed this week), the writes only
 * record, another marketer's task and another tenant are the generic 404, and the seed is idempotent. Needs Docker (Testcontainers); NOT run on the machine
 * that wrote it.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(240)
class MktTasksIT {

    private static final String JESSICA = "demo-ent-acme-jessica";
    private static final String BETA_OWNER = "demo-ent-beta-bea";

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private MktTasksDemoSeeder seeder;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private OrganizationRepository orgs;
    @Autowired private MktTaskRepository tasks;
    @Autowired private MktTaskEventRepository events;
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
        seeder.seed();
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).orElseThrow();
        beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).orElseThrow();
    }

    @AfterEach
    void forget() {
        settings.invalidate();
        resolver.invalidate();
    }

    private JsonNode board(String login, Organization org, String query) throws Exception {
        MvcResult r = mockMvc.perform(get("/api/orgs/" + org.getId() + "/mkt/tasks" + query).with(user(login))).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return om.readTree(r.getResponse().getContentAsString());
    }

    private Long memberOf(String login, Organization org) {
        Long userId = users.findOneByLogin(login).orElseThrow().getId();
        return members.findByOrgIdAndUserIdAndStatusIn(org.getId(), userId, List.of(OrgMemberStatus.ACTIVE)).get(0).getId();
    }

    @Test
    void theMarketerSeesTheBoardOfHerOwnTasksOnly() throws Exception {
        JsonNode b = board(JESSICA, acme, "");
        Long jessica = memberOf(JESSICA, acme);
        assertThat(b.path("kpis")).hasSize(4);
        assertThat(b.path("kpis").get(0).path("key").asText()).isEqualTo("total");
        assertThat(b.path("tabs").path("all").asLong()).isEqualTo(MktTasksDemoSeeder.OPEN);
        assertThat(b.path("tabs").path("my").asLong()).isEqualTo(MktTasksDemoSeeder.OPEN);
        assertThat(b.path("tabs").path("team").asLong()).as("an ASSIGNED marketer has no team tab").isZero();
        assertThat(b.path("tabs").path("overdue").asLong()).isEqualTo(MktTasksDemoSeeder.OVERDUE);
        assertThat(b.path("tabs").path("completed").asLong()).isEqualTo(MktTasksDemoSeeder.COMPLETED_THIS_WEEK);
        assertThat(b.path("tasks").path("items").size()).isLessThanOrEqualTo(10);
        for (JsonNode row : b.path("tasks").path("items")) assertThat(row.path("ownerMemberId").asLong()).isEqualTo(jessica);
        Set<Long> mine = new HashSet<>();
        for (MarketerAssignment a : assignments.findByOrgId(acme.getId())) if (jessica.equals(a.getMarketerMemberId()) || jessica.equals(a.getBackupMemberId())) mine.add(a.getConsultantId());
        for (JsonNode row : b.path("tasks").path("items")) if (!row.path("consultantId").isNull()) assertThat(mine).contains(row.path("consultantId").asLong());
        long owners = tasks.findByOrgId(acme.getId()).stream().map(MktTask::getOwnerMemberId).distinct().count();
        assertThat(owners).as("every marketer with assignments got tasks").isGreaterThan(1);
    }

    @Test
    void anotherTenantAndAnotherMarketersTaskAreTheGenericNotFound() throws Exception {
        assertThat(mockMvc.perform(get("/api/orgs/" + beta.getId() + "/mkt/tasks").with(user(JESSICA))).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(mockMvc.perform(get("/api/orgs/" + acme.getId() + "/mkt/tasks").with(user(BETA_OWNER))).andReturn().getResponse().getStatus()).isEqualTo(404);
        Long jessica = memberOf(JESSICA, acme);
        MktTask foreign = tasks.findByOrgId(acme.getId()).stream().filter(t -> !jessica.equals(t.getOwnerMemberId()) && t.isOpen()).findFirst().orElseThrow();
        assertThat(mockMvc.perform(post("/api/orgs/" + acme.getId() + "/mkt/tasks/" + foreign.getId() + "/complete").with(user(JESSICA))).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(mockMvc.perform(delete("/api/orgs/" + acme.getId() + "/mkt/tasks/" + foreign.getId()).with(user(JESSICA))).andReturn().getResponse().getStatus()).isEqualTo(404);
        // a task of another tenant addressed through Acme's org id
        MktTask betaTask = tasks.findByOrgId(beta.getId()).get(0);
        assertThat(mockMvc.perform(post("/api/orgs/" + acme.getId() + "/mkt/tasks/" + betaTask.getId() + "/complete").with(user(JESSICA))).andReturn().getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void createCompleteReopenAndDeleteOnlyRecord() throws Exception {
        long before = events.countByOrgId(acme.getId());
        MvcResult made = mockMvc.perform(post("/api/orgs/" + acme.getId() + "/mkt/tasks").with(user(JESSICA)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"Call the hiring manager\",\"category\":\"FOLLOW_UP\",\"priority\":\"HIGH\",\"dueAt\":\"2099-01-01T10:00:00Z\"}")).andReturn();
        assertThat(made.getResponse().getStatus()).isEqualTo(200);
        JsonNode out = om.readTree(made.getResponse().getContentAsString());
        assertThat(out.path("emailed").asBoolean()).isFalse();
        long id = out.path("item").path("id").asLong();
        assertThat(events.countByOrgId(acme.getId())).isEqualTo(before + 1);
        assertThat(mockMvc.perform(post("/api/orgs/" + acme.getId() + "/mkt/tasks/" + id + "/complete").with(user(JESSICA))).andReturn().getResponse().getStatus()).isEqualTo(200);
        assertThat(tasks.findByOrgIdAndId(acme.getId(), id).orElseThrow().getCompletedAt()).isNotNull();
        assertThat(mockMvc.perform(delete("/api/orgs/" + acme.getId() + "/mkt/tasks/" + id).with(user(JESSICA))).andReturn().getResponse().getStatus()).as("a completed task is history").isEqualTo(422);
        assertThat(mockMvc.perform(post("/api/orgs/" + acme.getId() + "/mkt/tasks/" + id + "/reopen").with(user(JESSICA))).andReturn().getResponse().getStatus()).isEqualTo(200);
        assertThat(mockMvc.perform(delete("/api/orgs/" + acme.getId() + "/mkt/tasks/" + id).with(user(JESSICA))).andReturn().getResponse().getStatus()).isEqualTo(200);
        assertThat(tasks.findByOrgIdAndId(acme.getId(), id)).isEmpty();
        MvcResult bad = mockMvc.perform(post("/api/orgs/" + acme.getId() + "/mkt/tasks").with(user(JESSICA)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"ssn 123-45-6789\",\"dueAt\":\"2099-01-01T10:00:00Z\"}")).andReturn();
        assertThat(bad.getResponse().getStatus()).isEqualTo(422);
    }

    @Test
    void theCalendarListsTheDaysThatHaveTasks() throws Exception {
        MvcResult r = mockMvc.perform(get("/api/orgs/" + acme.getId() + "/mkt/tasks/calendar").with(user(JESSICA))).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        JsonNode cal = om.readTree(r.getResponse().getContentAsString());
        assertThat(cal.path("month").asText()).matches("\\d{4}-\\d{2}");
        assertThat(cal.path("days").isArray()).isTrue();
    }

    @Test
    void aSecondSeedRunAddsNothingAndBetaOnlyHasItsOwnRows() throws Exception {
        long before = tasks.countByOrgId(acme.getId());
        assertThat(seeder.seed()).isEmpty();
        assertThat(tasks.countByOrgId(acme.getId())).isEqualTo(before);
        assertThat(tasks.findByOrgId(beta.getId()).size()).isGreaterThan(0);
        assertThat(board("demo-ent-beta-priya", beta, "").path("kpis")).hasSize(4);
    }
}
