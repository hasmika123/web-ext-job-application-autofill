package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.mkt.MktFollowup;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.ent.mkt.MktFollowupEventRepository;
import com.dossier.api.repository.ent.mkt.MktFollowupRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.ent.mkt.followups.MktFollowupsDemoSeeder;
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
 * The Follow-ups page on the real stack (MySQL, Liquibase, demo seed): Acme's marketer sees only the follow-ups of her assigned consultants, the writes
 * only record (a reminder is an event and never an email), another marketer's follow-up and another tenant are the generic 404, and the seed is idempotent.
 * Needs Docker (Testcontainers); NOT run on the machine that wrote it.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(240)
class MktFollowupsIT {

    private static final String JESSICA = "demo-ent-acme-jessica";
    private static final String BETA_OWNER = "demo-ent-beta-bea";

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private MktFollowupsDemoSeeder seeder;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private OrganizationRepository orgs;
    @Autowired private MktFollowupRepository followups;
    @Autowired private MktFollowupEventRepository events;
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

    private JsonNode board(String login, Organization org) throws Exception {
        MvcResult r = mockMvc.perform(get("/api/orgs/" + org.getId() + "/mkt/followups").with(user(login))).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return om.readTree(r.getResponse().getContentAsString());
    }

    /** Consultants assigned to Jessica (marketer or backup), straight from the assignment rows. */
    private Set<Long> jessicasConsultants() {
        Long userId = users.findOneByLogin(JESSICA).orElseThrow().getId();
        Long memberId = members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), userId, List.of(OrgMemberStatus.ACTIVE)).get(0).getId();
        Set<Long> ids = new HashSet<>();
        for (MarketerAssignment a : assignments.findByOrgId(acme.getId())) if (memberId.equals(a.getMarketerMemberId()) || memberId.equals(a.getBackupMemberId())) ids.add(a.getConsultantId());
        return ids;
    }

    @Test
    void theMarketerSeesTheBoardOfHerOwnConsultantsOnly() throws Exception {
        JsonNode b = board(JESSICA, acme);
        assertThat(b.path("kpis")).hasSize(4);
        assertThat(b.path("kpis").get(0).path("key").asText()).isEqualTo("dueToday");
        assertThat(b.path("kpis").get(2).path("value").asLong()).as("18 completed today per marketer").isEqualTo(18);
        assertThat(b.path("kpis").get(3).path("value").asLong()).as("14 waiting").isEqualTo(14);
        assertThat(b.path("overdue").path("total").asLong()).isGreaterThanOrEqualTo(6);
        assertThat(b.path("upcoming").path("total").asLong()).isGreaterThanOrEqualTo(14);
        assertThat(b.path("today").path("items").size()).isLessThanOrEqualTo(50);
        // every row's consultant is one of the ids of an assignment naming Jessica; the page never shows another marketer's rows
        Set<Long> seen = new HashSet<>();
        for (String bucket : List.of("today", "overdue", "upcoming")) for (JsonNode row : b.path(bucket).path("items")) seen.add(row.path("consultantId").asLong());
        Set<Long> mine = jessicasConsultants();
        assertThat(mine).isNotEmpty();
        assertThat(mine).containsAll(seen);
        long owned = followups.findAll().stream().filter(f -> f.getOrgId().equals(acme.getId())).map(MktFollowup::getOwnerMemberId).distinct().count();
        assertThat(owned).as("every marketer with assignments got rows").isGreaterThan(1);
        Set<Long> everyone = new HashSet<>();
        for (MarketerAssignment a : assignments.findByOrgId(acme.getId())) everyone.add(a.getConsultantId());
        assertThat(mine).as("not the whole org").hasSizeLessThan(everyone.size());
    }

    @Test
    void anotherTenantAndAnotherMarketersRowAreTheGenericNotFound() throws Exception {
        assertThat(mockMvc.perform(get("/api/orgs/" + beta.getId() + "/mkt/followups").with(user(JESSICA))).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(mockMvc.perform(get("/api/orgs/" + acme.getId() + "/mkt/followups").with(user(BETA_OWNER))).andReturn().getResponse().getStatus()).isEqualTo(404);
        Set<Long> visible = new HashSet<>();
        JsonNode b = board(JESSICA, acme);
        for (String bucket : List.of("today", "overdue", "upcoming")) for (JsonNode row : b.path(bucket).path("items")) visible.add(row.path("id").asLong());
        MktFollowup foreign = followups.findAll().stream().filter(f -> f.getOrgId().equals(acme.getId()) && !visible.contains(f.getId()) && !"COMPLETED".equals(f.getStatus()) && !"WAITING".equals(f.getStatus())).findFirst().orElseThrow();
        MvcResult r = mockMvc.perform(post("/api/orgs/" + acme.getId() + "/mkt/followups/" + foreign.getId() + "/complete").with(user(JESSICA))).andReturn();
        // the row either belongs to one of Jessica's consultants beyond the page size (then 200) or to another marketer (404); beyond-size rows are impossible here (50 cap > 14)
        assertThat(r.getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void aReminderIsRecordedAndNeverEmailed() throws Exception {
        JsonNode b = board(JESSICA, acme);
        long id = b.path("today").path("items").get(0).path("id").asLong();
        long before = events.countByOrgId(acme.getId());
        MvcResult r = mockMvc.perform(post("/api/orgs/" + acme.getId() + "/mkt/followups/" + id + "/reminder").with(user(JESSICA)).contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"Please confirm\"}")).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        JsonNode out = om.readTree(r.getResponse().getContentAsString());
        assertThat(out.path("emailed").asBoolean()).isFalse();
        assertThat(out.path("event").asText()).isEqualTo("REMINDER_SENT");
        assertThat(events.countByOrgId(acme.getId())).isEqualTo(before + 1);
    }

    @Test
    void completingAndLoggingACallChangesTheRow() throws Exception {
        JsonNode b = board(JESSICA, acme);
        long id = b.path("upcoming").path("items").get(0).path("id").asLong();
        MvcResult call = mockMvc.perform(post("/api/orgs/" + acme.getId() + "/mkt/followups/" + id + "/call").with(user(JESSICA)).contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"Left a voicemail\",\"awaitingReply\":true}")).andReturn();
        assertThat(call.getResponse().getStatus()).isEqualTo(200);
        assertThat(om.readTree(call.getResponse().getContentAsString()).path("item").path("status").asText()).isEqualTo("WAITING");
        MvcResult done = mockMvc.perform(patch("/api/orgs/" + acme.getId() + "/mkt/followups/" + id + "/status").with(user(JESSICA)).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"COMPLETED\"}")).andReturn();
        assertThat(done.getResponse().getStatus()).isEqualTo(200);
        assertThat(followups.findByOrgIdAndId(acme.getId(), id).orElseThrow().getCompletedAt()).isNotNull();
        MvcResult bad = mockMvc.perform(patch("/api/orgs/" + acme.getId() + "/mkt/followups/" + id + "/status").with(user(JESSICA)).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"OVERDUE\"}")).andReturn();
        assertThat(bad.getResponse().getStatus()).isEqualTo(422);
    }

    @Test
    void aSecondSeedRunAddsNothingAndBetaOnlyHasItsOwnRows() throws Exception {
        long before = followups.countByOrgId(acme.getId());
        assertThat(seeder.seed()).isEmpty();
        assertThat(followups.countByOrgId(acme.getId())).isEqualTo(before);
        assertThat(followups.findAll().stream().filter(f -> f.getOrgId().equals(beta.getId())).count()).isGreaterThan(0);
        assertThat(board("demo-ent-beta-priya", beta).path("kpis")).hasSize(4);
    }
}
