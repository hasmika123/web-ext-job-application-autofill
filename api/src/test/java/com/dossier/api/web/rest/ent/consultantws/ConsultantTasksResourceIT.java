package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.consultantws.CwsSubmission;
import com.dossier.api.domain.ent.consultantws.CwsTask;
import com.dossier.api.domain.ent.consultantws.CwsTaskDetail;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.consultantws.CwsSubmissionRepository;
import com.dossier.api.repository.ent.consultantws.CwsTaskAccessRepository;
import com.dossier.api.repository.ent.consultantws.CwsTaskDetailRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.consultantws.ConsultantWsTasksDemoSeeder;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace Tasks and Follow-ups page through the real chain on real rows: {@code /api/orgs/{orgId}/me-workspace/tasks}. Every
 * number is asserted against rows the test wrote, a consultant only ever sees and changes their own tasks, every refusal is the generic 404, free
 * text is PII-scanned, and completing a task here is visible on the Home page (the same {@code cws_task} rows).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConsultantTasksResourceIT {

    private static final String WHO = "cws-tasks-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgRoleRepository roleRows;
    @Autowired private OrgMemberRoleRepository memberRoles;
    @Autowired private OrgRoleService roleService;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private ConsultantProfileRepository profiles;
    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private RequirementMatchRepository matches;
    @Autowired private CwsSubmissionRepository submissions;
    @Autowired private CwsTaskAccessRepository tasks;
    @Autowired private CwsTaskDetailRepository details;
    @Autowired private ConsultantWsTasksDemoSeeder seeder;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private final LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();

    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ClientAccount acme;
    private ClientRequirement reqData;
    private ClientRequirement reqCloud;
    private ClientRequirement reqUnlinked;
    private ClientRequirement reqOtherOrg;

    private CwsTask tA;
    private CwsTask tB;
    private CwsTask tC;
    private CwsTask tD;
    private CwsTask tE;
    private CwsTask tF;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cws-t-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-t-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);
        staff(a, "cws-t-a-owner", OrgRole.OWNER);
        staff(a, "cws-t-a-admin", OrgRole.ADMIN);
        staff(a, "cws-t-a-marketer", OrgRole.MARKETER);
        staff(b, "cws-t-b-owner", OrgRole.OWNER);
        c1 = consultant(a, "cws-t-a-c1", "Casey One", true);
        c2 = consultant(a, "cws-t-a-c2", "Robin Two", true);
        consultant(a, "cws-t-a-noprofile", "Nobody", false);
        consultant(b, "cws-t-b-c1", "Bee Consultant", true);
        acme = client(a, "Acme Corp");
        reqData = requirement(a, acme, "Data Engineer");
        reqCloud = requirement(a, acme, "Cloud Architect");
        reqUnlinked = requirement(a, acme, "Unrelated Role");
        reqOtherOrg = requirement(b, client(b, "Beta Co"), "Other Tenant Role");
    }

    @AfterEach
    void clean() {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        cache.invalidate();
    }

    private void flags(boolean master, boolean rolesOn) {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":" + master + "}", WHO, Instant.now()));
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":" + rolesOn + "}", WHO, Instant.now()));
        cache.invalidate();
    }

    // ---- fixtures -------------------------------------------------------------------------------------------------

    private OrgMember staff(Organization org, String login, OrgRole role) {
        OrgMember m = fx.active(org, login, role);
        m.setJoinedAt(now.minus(Duration.ofDays(100)));
        members.saveAndFlush(m);
        roleService.syncFromLegacy(m);
        return m;
    }

    private ConsultantProfile consultant(Organization org, String login, String name, boolean withProfile) {
        OrgMember m = fx.seat(org, login, LegacyRoleMirror.toEnum(RoleTemplates.CONSULTANT).orElse(OrgRole.MEMBER), OrgMemberStatus.ACTIVE);
        m.setJoinedAt(now.minus(Duration.ofDays(100)));
        members.saveAndFlush(m);
        OrgMemberRole row = new OrgMemberRole();
        row.setOrgId(org.getId());
        row.setMemberId(m.getId());
        row.setRoleId(roleRows.findSystemByRoleKey(RoleTemplates.CONSULTANT).orElseThrow().getId());
        row.setPrimary(true);
        row.setGrantedAt(Instant.now());
        memberRoles.saveAndFlush(row);
        m.setPrimaryRoleId(row.getRoleId());
        members.saveAndFlush(m);
        if (!withProfile) return null;
        ConsultantProfile p = new ConsultantProfile();
        p.setOrgId(org.getId());
        p.setMemberId(m.getId());
        p.setDisplayName(name);
        p.setEmail(login + "@example.org");
        p.setJobTitle("Senior Engineer");
        return profiles.saveAndFlush(p);
    }

    private ClientAccount client(Organization org, String name) {
        ClientAccount c = new ClientAccount();
        c.setOrgId(org.getId());
        c.setName(name);
        return clients.saveAndFlush(c);
    }

    private ClientRequirement requirement(Organization org, ClientAccount client, String title) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(org.getId());
        r.setClientId(client.getId());
        r.setTitle(title);
        r.setLocation("Austin, TX");
        r.setWorkMode("HYBRID");
        r.setEmploymentLabel("FULL_TIME");
        r.setPostedAt(now.minus(Duration.ofDays(2)));
        return requirements.saveAndFlush(r);
    }

    private void match(ConsultantProfile c, ClientRequirement r) {
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(c.getOrgId());
        m.setRequirementId(r.getId());
        m.setConsultantId(c.getId());
        m.setScore(80);
        m.setStatus("SUGGESTED");
        m.setCreatedAt(now.minus(Duration.ofDays(1)));
        matches.saveAndFlush(m);
    }

    private CwsTask task(ConsultantProfile c, String title, String priority, String status, Integer dueInDays, int createdDaysAgo, Integer doneDaysAgo, String type, ClientRequirement job, String marketerLabel) {
        CwsTask t = new CwsTask();
        t.setOrgId(c.getOrgId());
        t.setConsultantId(c.getId());
        t.setTitle(title);
        t.setPriority(priority);
        t.setStatus(status);
        t.setDueOn(dueInDays == null ? null : today.plusDays(dueInDays));
        t.setCreatedAt(now.minus(Duration.ofDays(createdDaysAgo)));
        t.setUpdatedAt(now.minus(Duration.ofDays(createdDaysAgo)));
        if (doneDaysAgo != null) t.setCompletedAt(now.minus(Duration.ofDays(doneDaysAgo)));
        t = tasks.saveAndFlush(t);
        if (type != null) {
            CwsTaskDetail d = new CwsTaskDetail();
            d.setOrgId(c.getOrgId());
            d.setConsultantId(c.getId());
            d.setTaskId(t.getId());
            d.setTaskType(type);
            d.setRequirementId(job == null ? null : job.getId());
            if (marketerLabel != null) {
                d.setAssignedByLabel(marketerLabel);
                d.setSampleData(true);
            }
            details.saveAndFlush(d);
        }
        return t;
    }

    /**
     * c1 (today = UTC today): A overdue 2 days, B due today, C due in 3 days, D no date, E done 2 days ago, F done 10 days ago.
     * Total 6, open 4: due today 1, upcoming 1, overdue 1, completed this week 1 (last week 1).
     */
    private void seedC1() {
        match(c1, reqData);
        match(c1, reqCloud);
        tA = task(c1, "Update resume for Data Engineer role", "HIGH", "IN_PROGRESS", -2, 10, null, "RESUME_PROFILE", reqData, "Michael Park");
        tB = task(c1, "Approve submission for Cloud Architect", "HIGH", "PENDING", 0, 2, null, "SUBMISSION_APPROVAL", reqCloud, null);
        tC = task(c1, "Complete interview prep session", "MEDIUM", "NOT_STARTED", 3, 9, null, "INTERVIEW_PREPARATION", null, null);
        tD = task(c1, "Review offer details", "LOW", "NOT_STARTED", null, 1, null, null, null, null);
        tE = task(c1, "Send availability to marketer", "MEDIUM", "DONE", -5, 12, 2, "COMMUNICATION", null, null);
        tF = task(c1, "Old finished task", "LOW", "DONE", -14, 20, 10, "OTHER", null, null);
    }

    private CwsTask seedC2() {
        return task(c2, "Hidden Secret Task", "HIGH", "NOT_STARTED", 0, 1, null, "OTHER", null, "Hidden Marketer");
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private static String path(long orgId, String tail) {
        return "/api/orgs/" + orgId + "/me-workspace/tasks" + tail;
    }

    private MvcResult send(MockHttpServletRequestBuilder req, String login, String body) throws Exception {
        if (body != null) req = req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private JsonNode ok(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isBetween(200, 204);
        return body.isBlank() ? om.nullNode() : om.readTree(body);
    }

    private JsonNode page(String login, Organization org, String query) throws Exception {
        return ok(send(get(path(org.getId(), query)), login, null), "page " + login);
    }

    private JsonNode list(String query) throws Exception {
        return ok(send(get(path(a.getId(), "/list" + query)), "cws-t-a-c1", null), "list " + query);
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("not a member").doesNotContain("denied");
    }

    private void assertStatus(MvcResult r, int status, String what) throws Exception {
        assertThat(r.getResponse().getStatus()).as(what + " -> " + r.getResponse().getContentAsString()).isEqualTo(status);
    }

    private static List<String> texts(JsonNode array, String field) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : array) out.add(n.path(field).asText());
        return out;
    }

    private String body(String title, Integer dueInDays, String priority, String type, Long requirementId) {
        return "{\"title\":\"" + title + "\"" + (dueInDays == null ? "" : ",\"dueOn\":\"" + today.plusDays(dueInDays) + "\"") + (priority == null ? "" : ",\"priority\":\"" + priority + "\"")
            + (type == null ? "" : ",\"type\":\"" + type + "\"") + (requirementId == null ? "" : ",\"requirementId\":" + requirementId) + "}";
    }

    private JsonNode home(String login, Organization org) throws Exception {
        return ok(send(get("/api/orgs/" + org.getId() + "/me-workspace/home"), login, null), "home");
    }

    // ---- (a) correct values ---------------------------------------------------------------------------------------

    @Test
    void aConsultantGetsTheirOwnTilesTabsRowsAndBottomCardsFromTheirRows() throws Exception {
        seedC1();
        CwsSubmission s = new CwsSubmission();
        s.setOrgId(a.getId());
        s.setConsultantId(c1.getId());
        s.setRequirementId(reqUnlinked.getId());
        s.setStatus(CwsSubmission.PENDING);
        s.setDueAt(now.plus(Duration.ofDays(1)));
        s.setCreatedAt(now.minus(Duration.ofDays(1)));
        s.setUpdatedAt(now);
        submissions.saveAndFlush(s);

        JsonNode p = page("cws-t-a-c1", a, "");
        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(p.path("name").asText()).isEqualTo("Casey One");
        assertThat(p.path("today").asText()).isEqualTo(today.toString());

        JsonNode t = p.path("tiles");
        assertThat(t.path("total").path("value").asLong()).isEqualTo(6);
        assertThat(t.path("total").path("previous").asLong()).as("four existed more than a week ago").isEqualTo(4);
        assertThat(t.path("total").path("deltaPct").asDouble()).isEqualTo(50.0);
        assertThat(t.path("dueToday").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("dueToday").path("previous").asLong()).isZero();
        assertThat(t.path("dueToday").get("deltaPct").isNull()).as("no earlier value, no made-up delta").isTrue();
        assertThat(t.path("upcoming").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("overdue").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("completedThisWeek").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("completedThisWeek").path("previous").asLong()).isEqualTo(1);
        assertThat(t.path("completedThisWeek").path("deltaPct").asDouble()).isZero();
        for (String k : List.of("total", "dueToday", "upcoming", "overdue", "completedThisWeek")) assertThat(t.path(k).path("sparkline")).as(k).hasSize(6);

        JsonNode counts = p.path("tasks").path("counts");
        assertThat(counts.path("all").asLong()).isEqualTo(6);
        assertThat(counts.path("today").asLong()).isEqualTo(1);
        assertThat(counts.path("week").asLong()).isEqualTo(2);
        assertThat(counts.path("overdue").asLong()).isEqualTo(1);
        assertThat(counts.path("completed").asLong()).isEqualTo(2);

        // due date ascending, undated last
        assertThat(texts(p.path("tasks").path("items"), "title")).containsExactly(
            "Old finished task", "Send availability to marketer", "Update resume for Data Engineer role", "Approve submission for Cloud Architect", "Complete interview prep session", "Review offer details"
        );
        JsonNode first = p.path("tasks").path("items").get(2);
        assertThat(first.path("type").asText()).isEqualTo("RESUME_PROFILE");
        assertThat(first.path("jobTitle").asText()).isEqualTo("Data Engineer");
        assertThat(first.path("company").asText()).isEqualTo("Acme Corp");
        assertThat(first.path("overdue").asBoolean()).isTrue();
        assertThat(first.path("assignedBy").path("kind").asText()).isEqualTo("MARKETER");
        assertThat(first.path("assignedBy").path("name").asText()).isEqualTo("Michael Park");
        assertThat(first.path("assignedBy").path("sample").asBoolean()).isTrue();
        JsonNode second = p.path("tasks").path("items").get(3);
        assertThat(second.path("dueToday").asBoolean()).isTrue();
        assertThat(second.path("assignedBy").path("kind").asText()).isEqualTo("SELF");
        assertThat(second.path("assignedBy").path("name").asText()).isEqualTo("Casey One");
        JsonNode noDetail = p.path("tasks").path("items").get(5);
        assertThat(noDetail.path("type").asText()).as("a task with no detail row is general").isEqualTo("OTHER");
        assertThat(noDetail.get("requirementId").isNull()).isTrue();
        assertThat(p.path("tasks").path("items").get(1).path("overdue").asBoolean()).as("a finished task is never overdue").isFalse();

        // today's focus: overdue open + due today, soonest first
        assertThat(texts(p.path("focus"), "title")).containsExactly("Update resume for Data Engineer role", "Approve submission for Cloud Architect");
        assertThat(p.path("focus").get(0).path("done").asBoolean()).isFalse();
        // upcoming deadlines: open tasks due today or later with a date
        assertThat(texts(p.path("deadlines"), "title")).containsExactly("Approve submission for Cloud Architect", "Complete interview prep session");
        assertThat(p.path("deadlines").get(0).path("company").asText()).isEqualTo("Acme Corp");

        JsonNode in = p.path("insights");
        assertThat(in.path("total").asLong()).isEqualTo(6);
        assertThat(in.path("completed").asLong()).isEqualTo(2);
        assertThat(in.path("overdue").asLong()).isEqualTo(1);
        assertThat(in.path("inProgress").asLong()).isEqualTo(1);
        assertThat(in.path("notStarted").asLong()).isEqualTo(2);
        assertThat(in.path("completionPct").asInt()).isEqualTo(33);
        assertThat(in.path("completed").asLong() + in.path("overdue").asLong() + in.path("inProgress").asLong() + in.path("notStarted").asLong()).isEqualTo(in.path("total").asLong());
        assertThat(in.get("note").isNull()).as("the same as last week is not great progress").isTrue();

        assertThat(texts(p.path("reminders"), "kind")).containsExactly("SUBMISSION");
        assertThat(p.path("reminders").get(0).path("subtitle").asText()).isEqualTo("Acme Corp - Unrelated Role");
        assertThat(p.path("reminders").get(0).path("href").asText()).isEqualTo("/w/consultant/submissions");

        assertThat(texts(p.path("jobs"), "title")).containsExactlyInAnyOrder("Data Engineer", "Cloud Architect");
        assertThat(p.path("assigners")).hasSize(1);
        assertThat(p.path("assigners").get(0).asText()).isEqualTo("Michael Park");
    }

    @Test
    void theInsightNoteIsHonest() throws Exception {
        seedC1();
        task(c1, "Another finished one", "LOW", "DONE", -1, 5, 1, "OTHER", null, null);
        JsonNode in = page("cws-t-a-c1", a, "").path("insights");
        assertThat(in.path("completedThisWeek").asLong()).isEqualTo(2);
        assertThat(in.path("completedLastWeek").asLong()).isEqualTo(1);
        assertThat(in.path("note").asText()).isEqualTo("You've completed 100% more tasks than last week.");
    }

    @Test
    void filtersSortAndPagingRunOnTheServer() throws Exception {
        seedC1();
        assertThat(texts(list("?tab=OVERDUE").path("items"), "title")).containsExactly("Update resume for Data Engineer role");
        assertThat(texts(list("?tab=TODAY").path("items"), "title")).containsExactly("Approve submission for Cloud Architect");
        assertThat(texts(list("?tab=WEEK").path("items"), "title")).containsExactly("Approve submission for Cloud Architect", "Complete interview prep session");
        assertThat(texts(list("?tab=COMPLETED&sort=completed&dir=desc").path("items"), "title")).containsExactly("Send availability to marketer", "Old finished task");
        assertThat(texts(list("?type=RESUME_PROFILE").path("items"), "title")).containsExactly("Update resume for Data Engineer role");
        assertThat(texts(list("?priority=high").path("items"), "title")).containsExactly("Update resume for Data Engineer role", "Approve submission for Cloud Architect");
        assertThat(texts(list("?assignedBy=Michael Park").path("items"), "title")).containsExactly("Update resume for Data Engineer role");
        assertThat(list("?assignedBy=SELF").path("total").asLong()).isEqualTo(5);
        assertThat(texts(list("?due=NO_DATE").path("items"), "title")).containsExactly("Review offer details");
        assertThat(texts(list("?due=NEXT_7").path("items"), "title")).containsExactly("Approve submission for Cloud Architect", "Complete interview prep session");
        assertThat(texts(list("?q=OFFER").path("items"), "title")).containsExactly("Review offer details");
        assertThat(texts(list("?q=acme").path("items"), "title")).as("search finds the company").containsExactly("Update resume for Data Engineer role", "Approve submission for Cloud Architect");
        assertThat(texts(list("?sort=title&dir=desc&size=3").path("items"), "title")).containsExactly("Update resume for Data Engineer role", "Send availability to marketer", "Review offer details");
        assertThat(texts(list("?sort=priority").path("items"), "priority").subList(0, 2)).containsExactly("HIGH", "HIGH");

        JsonNode p1 = list("?size=4&page=1");
        assertThat(p1.path("total").asLong()).isEqualTo(6);
        assertThat(p1.path("totalPages").asInt()).isEqualTo(2);
        assertThat(p1.path("items")).hasSize(2);
        assertThat(p1.path("counts").path("all").asLong()).as("tab counts ignore the filters").isEqualTo(6);
        JsonNode filtered = list("?type=OTHER&tab=COMPLETED");
        assertThat(filtered.path("counts").path("all").asLong()).isEqualTo(6);

        for (String bad : List.of("?tab=NOPE", "?type=NOPE", "?priority=URGENT", "?due=SOON", "?sort=nope", "?dir=sideways", "?size=0", "?size=51", "?page=-1", "?q=" + "x".repeat(101))) {
            assertStatus(send(get(path(a.getId(), "/list" + bad)), "cws-t-a-c1", null), 422, bad);
        }
    }

    // ---- (b) own rows only ----------------------------------------------------------------------------------------

    @Test
    void aConsultantNeverSeesOrChangesAnotherConsultantsTasks() throws Exception {
        seedC1();
        CwsTask hidden = seedC2();
        MvcResult r = send(get(path(a.getId(), "")), "cws-t-a-c1", null);
        assertThat(r.getResponse().getContentAsString()).doesNotContain("Hidden").doesNotContain("Robin Two");
        assertThat(om.readTree(r.getResponse().getContentAsString()).path("tiles").path("total").path("value").asLong()).isEqualTo(6);

        String url = path(a.getId(), "/" + hidden.getId());
        assertGeneric404(send(put(url), "cws-t-a-c1", body("Taken over", 1, "HIGH", "OTHER", null)), "edit another's task");
        assertGeneric404(send(put(url + "/status"), "cws-t-a-c1", "{\"status\":\"DONE\"}"), "complete another's task");
        assertGeneric404(send(delete(url), "cws-t-a-c1", null), "delete another's task");
        CwsTask fresh = tasks.findByOrgIdAndId(hidden.getOrgId(), hidden.getId()).orElseThrow();
        assertThat(fresh.getTitle()).isEqualTo("Hidden Secret Task");
        assertThat(fresh.getStatus()).isEqualTo("NOT_STARTED");

        JsonNode p2 = page("cws-t-a-c2", a, "");
        assertThat(texts(p2.path("tasks").path("items"), "title")).containsExactly("Hidden Secret Task");
        assertThat(p2.toString()).doesNotContain("Casey One").doesNotContain("Update resume");
    }

    // ---- (c) / (d) refusals ---------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationAndNonConsultantsGetTheGeneric404OnEveryRoute() throws Exception {
        seedC1();
        String id = String.valueOf(tB.getId());
        String valid = body("A valid title", 1, "LOW", "OTHER", null);
        for (String login : List.of("cws-t-b-owner", "cws-t-b-c1", "ghost-login", "cws-t-a-owner", "cws-t-a-admin", "cws-t-a-marketer", "cws-t-a-noprofile")) {
            assertGeneric404(send(get(path(a.getId(), "")), login, null), login + " page");
            assertGeneric404(send(get(path(a.getId(), "/list")), login, null), login + " list");
            assertGeneric404(send(post(path(a.getId(), "")), login, valid), login + " create");
            assertGeneric404(send(put(path(a.getId(), "/" + id)), login, valid), login + " edit");
            assertGeneric404(send(put(path(a.getId(), "/" + id + "/status")), login, "{\"status\":\"DONE\"}"), login + " status");
            assertGeneric404(send(delete(path(a.getId(), "/" + id)), login, null), login + " delete");
        }
        assertThat(tasks.findByOrgIdAndId(tB.getOrgId(), tB.getId()).orElseThrow().getStatus()).as("nobody else could move it").isEqualTo("PENDING");
        assertThat(tasks.findByOrgIdAndConsultantId(a.getId(), c1.getId())).hasSize(6);
        assertGeneric404(send(get(path(999999999L, "")), "cws-t-a-c1", null), "an organization that does not exist");
        assertGeneric404(send(put(path(a.getId(), "/987654321/status")), "cws-t-a-c1", "{\"status\":\"DONE\"}"), "a task id that does not exist");
        assertGeneric404(send(delete(path(a.getId(), "/987654321")), "cws-t-a-c1", null), "delete an id that does not exist");
        // another tenant's consultant cannot reach this org's task through their own org either
        assertGeneric404(send(put(path(b.getId(), "/" + id + "/status")), "cws-t-b-c1", "{\"status\":\"DONE\"}"), "task id from another organization");
        assertGeneric404(send(delete(path(b.getId(), "/" + id)), "cws-t-b-c1", null), "delete across tenants");
    }

    @Test
    void theRoutesAre404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        seedC1();
        flags(true, false);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-t-a-c1", null), "roles flag off");
        assertGeneric404(send(post(path(a.getId(), "")), "cws-t-a-c1", body("A valid title", null, null, null, null)), "roles flag off, write");
        flags(false, true);
        assertGeneric404(send(get(path(a.getId(), "/list")), "cws-t-a-c1", null), "master flag off");
        assertThat(tasks.findByOrgIdAndConsultantId(a.getId(), c1.getId())).hasSize(6);
    }

    // ---- (e) empty consultant -------------------------------------------------------------------------------------

    @Test
    void aConsultantWithNoTasksGetsZerosAndEmptyListsNeverNulls() throws Exception {
        JsonNode p = page("cws-t-a-c1", a, "");
        for (String tile : List.of("total", "dueToday", "upcoming", "overdue", "completedThisWeek")) {
            JsonNode t = p.path("tiles").path(tile);
            assertThat(t.path("value").asLong()).as(tile).isZero();
            assertThat(t.get("deltaPct").isNull()).as(tile + " has no delta").isTrue();
            assertThat(t.path("sparkline")).as(tile).hasSize(6);
        }
        assertThat(p.path("tasks").get("items").isArray()).isTrue();
        assertThat(p.path("tasks").path("items")).isEmpty();
        assertThat(p.path("tasks").path("total").asLong()).isZero();
        assertThat(p.path("tasks").path("totalPages").asInt()).isZero();
        assertThat(p.path("focus")).isEmpty();
        assertThat(p.path("deadlines")).isEmpty();
        assertThat(p.path("reminders")).isEmpty();
        assertThat(p.path("insights").path("completionPct").asInt()).isZero();
        assertThat(p.path("insights").get("note").isNull()).isTrue();
        assertThat(p.get("jobs").isArray()).isTrue();
    }

    // ---- writes ---------------------------------------------------------------------------------------------------

    @Test
    void creatingATaskStoresItForTheCallerAndHomeSeesIt() throws Exception {
        match(c1, reqData);
        MvcResult res = send(post(path(a.getId(), "")), "cws-t-a-c1", body("  Call the recruiter  ", 1, "high", "communication", reqData.getId()));
        assertStatus(res, 201, "create");
        JsonNode row = om.readTree(res.getResponse().getContentAsString());
        assertThat(row.path("title").asText()).isEqualTo("Call the recruiter");
        assertThat(row.path("priority").asText()).isEqualTo("HIGH");
        assertThat(row.path("type").asText()).isEqualTo("COMMUNICATION");
        assertThat(row.path("status").asText()).isEqualTo("NOT_STARTED");
        assertThat(row.path("jobTitle").asText()).isEqualTo("Data Engineer");
        assertThat(row.path("assignedBy").path("kind").asText()).isEqualTo("SELF");
        assertThat(row.path("dueOn").asText()).isEqualTo(today.plusDays(1).toString());

        CwsTask saved = tasks.findByOrgIdAndId(a.getId(), row.path("id").asLong()).orElseThrow();
        assertThat(saved.getConsultantId()).isEqualTo(c1.getId());
        assertThat(saved.getOrgId()).isEqualTo(a.getId());
        CwsTaskDetail d = details.findByOrgIdAndTaskId(a.getId(), saved.getId()).orElseThrow();
        assertThat(d.getRequirementId()).isEqualTo(reqData.getId());
        assertThat(d.getAssignedByMemberId()).isNull();

        assertThat(texts(home("cws-t-a-c1", a).path("tasks"), "title")).contains("Call the recruiter");
        // minimal body: only a title
        JsonNode min = ok(send(post(path(a.getId(), "")), "cws-t-a-c1", "{\"title\":\"Just a title\"}"), "minimal create");
        assertThat(min.path("priority").asText()).isEqualTo("MEDIUM");
        assertThat(min.path("type").asText()).isEqualTo("OTHER");
        assertThat(min.get("dueOn").isNull()).isTrue();
    }

    @Test
    void creatingNeedsAValidScreenedBody() throws Exception {
        match(c1, reqData);
        String url = path(a.getId(), "");
        assertStatus(send(post(url), "cws-t-a-c1", null), 422, "no body");
        assertStatus(send(post(url), "cws-t-a-c1", "{}"), 422, "no title");
        assertStatus(send(post(url), "cws-t-a-c1", body("ab", null, null, null, null)), 422, "two characters");
        assertStatus(send(post(url), "cws-t-a-c1", body("x".repeat(201), null, null, null, null)), 422, "201 characters");
        MvcResult ssn = send(post(url), "cws-t-a-c1", body("my SSN 123-45-6789", null, null, null, null));
        assertStatus(ssn, 422, "a social security number");
        assertThat(ssn.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        MvcResult dob = send(post(url), "cws-t-a-c1", body("date of birth 04/12/1990", null, null, null, null));
        assertStatus(dob, 422, "a date of birth");
        assertThat(dob.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        assertStatus(send(post(url), "cws-t-a-c1", "{\"title\":\"Valid title\",\"dueOn\":\"next friday\"}"), 422, "bad date");
        assertStatus(send(post(url), "cws-t-a-c1", "{\"title\":\"Valid title\",\"dueOn\":\"1999-01-01\"}"), 422, "far past date");
        assertStatus(send(post(url), "cws-t-a-c1", body("Valid title", null, "URGENT", null, null)), 422, "bad priority");
        assertStatus(send(post(url), "cws-t-a-c1", body("Valid title", null, null, "NOPE", null)), 422, "bad type");
        assertGeneric404(send(post(url), "cws-t-a-c1", body("Valid title", null, null, null, reqOtherOrg.getId())), "a job from another tenant");
        assertGeneric404(send(post(url), "cws-t-a-c1", body("Valid title", null, null, null, 987654321L)), "a job that does not exist");
        assertGeneric404(send(post(url), "cws-t-a-c1", body("Valid title", null, null, null, reqUnlinked.getId())), "a job that is not one of the caller's own");
        assertThat(tasks.findByOrgIdAndConsultantId(a.getId(), c1.getId())).as("every refusal changed nothing").isEmpty();
    }

    @Test
    void editingReplacesTheEditableFieldsAndAnOmittedDueDateClears() throws Exception {
        seedC1();
        String url = path(a.getId(), "/" + tC.getId());
        JsonNode r = ok(send(put(url), "cws-t-a-c1", body("Prepare for the panel", 7, "low", "INTERVIEW_COORDINATION", reqCloud.getId())), "edit");
        assertThat(r.path("title").asText()).isEqualTo("Prepare for the panel");
        assertThat(r.path("priority").asText()).isEqualTo("LOW");
        assertThat(r.path("type").asText()).isEqualTo("INTERVIEW_COORDINATION");
        assertThat(r.path("jobTitle").asText()).isEqualTo("Cloud Architect");
        assertThat(r.path("status").asText()).as("editing never changes the status").isEqualTo("NOT_STARTED");
        assertThat(tasks.findByOrgIdAndId(tC.getOrgId(), tC.getId()).orElseThrow().getDueOn()).isEqualTo(today.plusDays(7));

        JsonNode cleared = ok(send(put(url), "cws-t-a-c1", body("Prepare for the panel", null, "low", "INTERVIEW_COORDINATION", null)), "clear due date and job");
        assertThat(cleared.get("dueOn").isNull()).isTrue();
        assertThat(cleared.get("requirementId").isNull()).isTrue();
        // a task that had no detail row gets one
        ok(send(put(path(a.getId(), "/" + tD.getId())), "cws-t-a-c1", body("Review the offer", 2, "HIGH", "OFFER_REVIEW", null)), "edit a task without detail");
        assertThat(details.findByOrgIdAndTaskId(a.getId(), tD.getId()).orElseThrow().getTaskType()).isEqualTo("OFFER_REVIEW");

        assertStatus(send(put(url), "cws-t-a-c1", body("ab", null, null, null, null)), 422, "too short");
        MvcResult pii = send(put(url), "cws-t-a-c1", body("my SSN 123-45-6789", null, null, null, null));
        assertStatus(pii, 422, "pii");
        assertThat(pii.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        assertGeneric404(send(put(url), "cws-t-a-c1", body("Valid title", null, null, null, reqOtherOrg.getId())), "job from another tenant");
        assertThat(tasks.findByOrgIdAndId(tC.getOrgId(), tC.getId()).orElseThrow().getTitle()).isEqualTo("Prepare for the panel");
    }

    @Test
    void completingATaskStampsCompletedAtIsIdempotentAndShowsOnHome() throws Exception {
        seedC1();
        JsonNode before = home("cws-t-a-c1", a);
        assertThat(texts(before.path("tasks"), "title")).contains("Approve submission for Cloud Architect");
        assertThat(texts(before.path("todaysFocus").path("items"), "label")).contains("Approve submission for Cloud Architect");

        String url = path(a.getId(), "/" + tB.getId() + "/status");
        JsonNode done = ok(send(put(url), "cws-t-a-c1", "{\"status\":\"done\"}"), "complete");
        assertThat(done.path("status").asText()).isEqualTo("DONE");
        assertThat(done.path("completedAt").asText()).isNotBlank();
        Instant stamp = tasks.findByOrgIdAndId(tB.getOrgId(), tB.getId()).orElseThrow().getCompletedAt();
        assertThat(stamp).isNotNull();

        ok(send(put(url), "cws-t-a-c1", "{\"status\":\"DONE\"}"), "complete again");
        assertThat(tasks.findByOrgIdAndId(tB.getOrgId(), tB.getId()).orElseThrow().getCompletedAt()).as("the first completion time is kept").isEqualTo(stamp);

        JsonNode after = home("cws-t-a-c1", a);
        assertThat(texts(after.path("tasks"), "title")).doesNotContain("Approve submission for Cloud Architect");
        assertThat(texts(after.path("todaysFocus").path("items"), "label")).doesNotContain("Approve submission for Cloud Architect");

        JsonNode p = page("cws-t-a-c1", a, "");
        assertThat(p.path("tiles").path("completedThisWeek").path("value").asLong()).isEqualTo(2);
        assertThat(p.path("tasks").path("counts").path("completed").asLong()).isEqualTo(3);
        assertThat(p.path("insights").path("completionPct").asInt()).isEqualTo(50);
        assertThat(p.path("focus").get(0).path("done").asBoolean()).as("a task due today stays in the focus, checked, listed first").isTrue();

        JsonNode reopened = ok(send(put(url), "cws-t-a-c1", "{\"status\":\"IN_PROGRESS\"}"), "reopen");
        assertThat(reopened.path("status").asText()).isEqualTo("IN_PROGRESS");
        assertThat(reopened.get("completedAt").isNull()).isTrue();
        assertThat(tasks.findByOrgIdAndId(tB.getOrgId(), tB.getId()).orElseThrow().getCompletedAt()).isNull();
        assertThat(texts(home("cws-t-a-c1", a).path("tasks"), "title")).contains("Approve submission for Cloud Architect");

        assertStatus(send(put(url), "cws-t-a-c1", "{\"status\":\"NOPE\"}"), 422, "unknown status");
        assertStatus(send(put(url), "cws-t-a-c1", "{}"), 422, "no status");
        assertStatus(send(put(url), "cws-t-a-c1", null), 422, "no body");
        assertThat(tasks.findByOrgIdAndId(tB.getOrgId(), tB.getId()).orElseThrow().getStatus()).isEqualTo("IN_PROGRESS");
    }

    @Test
    void deletingATaskRemovesItAndItsDetailAndASecondDeleteIs404() throws Exception {
        seedC1();
        String url = path(a.getId(), "/" + tA.getId());
        assertStatus(send(delete(url), "cws-t-a-c1", null), 204, "delete");
        assertThat(tasks.findByOrgIdAndId(tA.getOrgId(), tA.getId())).isEmpty();
        assertThat(details.findByOrgIdAndTaskId(a.getId(), tA.getId())).isEmpty();
        assertGeneric404(send(delete(url), "cws-t-a-c1", null), "delete twice");
        assertThat(page("cws-t-a-c1", a, "").path("tasks").path("total").asLong()).isEqualTo(5);
        assertThat(texts(home("cws-t-a-c1", a).path("tasks"), "title")).doesNotContain("Update resume for Data Engineer role");
    }

    @Test
    void theDemoSeederIsIdempotentAndGuardsOnItsOwnTable() throws Exception {
        seedC1();
        long before = details.countByOrgIdAndConsultantId(a.getId(), c1.getId());
        assertThat(before).isEqualTo(5);
        // the seeder only seeds the demo organizations; for a test organization it must do nothing and never fail
        int made = seeder.seed();
        assertThat(made).isGreaterThanOrEqualTo(0);
        assertThat(seeder.seed()).as("second run adds nothing").isZero();
        assertThat(details.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isEqualTo(before);
    }
}
