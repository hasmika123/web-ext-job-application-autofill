package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.consultantws.CwsTask;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.consultantws.CwsTaskRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
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
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace Home through the real chain on real rows: {@code GET /api/orgs/{orgId}/me-workspace/home}. Every number is
 * asserted against rows the test wrote, a consultant only ever sees their own rows, and every refusal is the generic 404.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConsultantHomeResourceIT {

    private static final String WHO = "cws-home-it";

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
    @Autowired private TalentApplicationRepository applications;
    @Autowired private TalentInterviewRepository interviews;
    @Autowired private TalentPlacementRepository placements;
    @Autowired private CwsTaskRepository tasks;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private final LocalDate today = LocalDate.now(ZoneOffset.UTC);
    private int seq = 0;

    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ClientAccount acme;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cws-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);

        staff(a, "cws-a-owner", OrgRole.OWNER);
        staff(a, "cws-a-admin", OrgRole.ADMIN);
        staff(a, "cws-a-marketer", OrgRole.MARKETER);
        staff(b, "cws-b-owner", OrgRole.OWNER);

        c1 = consultant(a, "cws-a-c1", "Casey One", true);
        c2 = consultant(a, "cws-a-c2", "Robin Two", true);
        consultant(a, "cws-a-noprofile", "Nobody", false);
        consultant(b, "cws-b-c1", "Bee Consultant", true);

        acme = client(a, "Acme Corp");
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

    /** An ACTIVE seat holding the Consultant role; with a consultant_profile linked by member_id when {@code withProfile} (else returns null). */
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
        p.setAvailabilitySince(today); // keeps the "Update availability" focus item out of the way unless a test wants it
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
        r.setEmploymentLabel("CONTRACT");
        return requirements.saveAndFlush(r);
    }

    private RequirementMatch match(ConsultantProfile c, ClientRequirement r, String status, int score, Instant createdAt, Instant assignedAt) {
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(c.getOrgId());
        m.setRequirementId(r.getId());
        m.setConsultantId(c.getId());
        m.setScore(score);
        m.setStatus(status);
        m.setCreatedAt(createdAt);
        m.setAssignedAt(assignedAt);
        return matches.saveAndFlush(m);
    }

    private TalentApplication application(ConsultantProfile c, ClientRequirement r, String stage, int appliedDaysAgo) {
        TalentApplication t = new TalentApplication();
        t.setOrgId(c.getOrgId());
        t.setCode("CWS-" + System.nanoTime() + "-" + (seq++));
        t.setRequirementId(r.getId());
        t.setConsultantId(c.getId());
        t.setClientId(r.getClientId());
        t.setStage(stage);
        t.setAppliedOn(today.minusDays(appliedDaysAgo));
        return applications.saveAndFlush(t);
    }

    private TalentInterview interview(ConsultantProfile c, TalentApplication app, String status, Instant at, String round) {
        TalentInterview i = new TalentInterview();
        i.setOrgId(c.getOrgId());
        i.setApplicationId(app == null ? null : app.getId());
        i.setConsultantId(c.getId());
        i.setClientId(acme.getId());
        i.setScheduledAt(at);
        i.setStatus(status);
        i.setRoundLabel(round);
        return interviews.saveAndFlush(i);
    }

    private TalentPlacement placement(ConsultantProfile c, String status) {
        TalentPlacement p = new TalentPlacement();
        p.setOrgId(c.getOrgId());
        p.setConsultantId(c.getId());
        p.setClientId(acme.getId());
        p.setRoleTitle("Placed role " + status);
        p.setStatus(status);
        p.setStartDate(today.minusDays(60));
        return placements.saveAndFlush(p);
    }

    private CwsTask task(ConsultantProfile c, String title, LocalDate due, String status) {
        CwsTask t = new CwsTask();
        t.setOrgId(c.getOrgId());
        t.setConsultantId(c.getId());
        t.setTitle(title);
        t.setDueOn(due);
        t.setStatus(status);
        return tasks.saveAndFlush(t);
    }

    /** c1's world: 4 open matches (plus 1 dismissed), 3 applications (2 active), 2 upcoming interviews, 1 active placement, 1 open task. */
    private void seedC1() {
        ClientRequirement r1 = requirement(a, acme, "Java Developer");
        ClientRequirement r2 = requirement(a, acme, "Data Engineer");
        ClientRequirement r3 = requirement(a, acme, "SRE Lead");
        ClientRequirement r4 = requirement(a, acme, "QA Architect");
        ClientRequirement r5 = requirement(a, acme, "Closed Req");
        match(c1, r1, "SUGGESTED", 90, now.minus(Duration.ofDays(1)), null);
        match(c1, r2, "ASSIGNED", 70, now.minus(Duration.ofDays(20)), now.minus(Duration.ofDays(2)));
        match(c1, r3, "ASSIGNED", 80, now.minus(Duration.ofDays(10)), now.minus(Duration.ofDays(10)));
        match(c1, r4, "ASSIGNED", 60, now.minus(Duration.ofDays(10)), now.minus(Duration.ofDays(9)));
        match(c1, r5, "DISMISSED", 99, now.minus(Duration.ofDays(3)), null);
        TalentApplication a1 = application(c1, r3, "ASSIGNED", 3);
        a1.setNextActionDue(today);
        applications.saveAndFlush(a1);
        TalentApplication a2 = application(c1, r4, "SUBMITTED", 1);
        application(c1, r5, "CLOSED", 30);
        interview(c1, a2, "SCHEDULED", now.plus(Duration.ofDays(2)), "Round 1");
        interview(c1, a2, "SCHEDULED", now.plus(Duration.ofDays(5)), "Final");
        interview(c1, a2, "COMPLETED", now.minus(Duration.ofDays(4)), "Screen");
        interview(c1, a2, "SCHEDULED", now.minus(Duration.ofDays(1)), "Stale");
        placement(c1, "ACTIVE");
        placement(c1, "ENDED");
        task(c1, "Update rate card", today, "NOT_STARTED");
        task(c1, "Already done", today, "DONE");
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private MvcResult call(String login, long orgId) throws Exception {
        return mockMvc.perform(get("/api/orgs/" + orgId + "/me-workspace/home").with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private MvcResult call(String login, Organization org) throws Exception {
        return call(login, org.getId());
    }

    private JsonNode home(String login, Organization org) throws Exception {
        MvcResult r = call(login, org);
        assertThat(r.getResponse().getStatus()).as(login + " -> " + r.getResponse().getContentAsString()).isEqualTo(200);
        return om.readTree(r.getResponse().getContentAsString());
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("not a member").doesNotContain("denied");
    }

    private static List<String> texts(JsonNode array, String field) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : array) out.add(n.path(field).asText());
        return out;
    }

    // ---- (a) correct values ---------------------------------------------------------------------------------------

    @Test
    void aConsultantGetsTheirTilesRowsAndStatusesFromTheirOwnRows() throws Exception {
        seedC1();
        JsonNode h = home("cws-a-c1", a);

        assertThat(h.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(h.path("generatedAt").asText()).isNotBlank();
        assertThat(h.path("me").path("consultantId").asLong()).isEqualTo(c1.getId());
        assertThat(h.path("me").path("name").asText()).isEqualTo("Casey One");
        assertThat(h.path("me").path("jobTitle").asText()).isEqualTo("Senior Engineer");

        JsonNode t = h.path("tiles");
        JsonNode jm = t.path("jobMatches");
        assertThat(jm.path("value").asLong()).as("4 matches that are not dismissed").isEqualTo(4);
        assertThat(jm.path("previous").asLong()).as("3 of them existed a week ago").isEqualTo(3);
        assertThat(jm.path("deltaPct").asDouble()).isEqualTo(33.3);
        assertThat(jm.path("sparkline")).hasSize(6);
        assertThat(jm.path("sparkline").get(0).asLong()).isZero();
        assertThat(jm.path("sparkline").get(3).asLong()).isEqualTo(1);
        assertThat(jm.path("sparkline").get(4).asLong()).isEqualTo(3);
        assertThat(jm.path("sparkline").get(5).asLong()).isEqualTo(4);
        assertThat(jm.path("sample").asBoolean()).isFalse();

        JsonNode ao = t.path("assignedOpportunities");
        assertThat(ao.path("value").asLong()).isEqualTo(3);
        assertThat(ao.path("previous").asLong()).as("assigned a week ago: r3 (10d) and r4 (9d)").isEqualTo(2);
        assertThat(ao.path("deltaPct").asDouble()).isEqualTo(50.0);
        assertThat(t.path("activeApplications").path("value").asLong()).as("the CLOSED one does not count").isEqualTo(2);
        assertThat(t.path("upcomingInterviews").path("value").asLong()).as("only SCHEDULED in the future").isEqualTo(2);
        assertThat(t.path("activeApplications").path("sample").asBoolean()).isFalse();
        assertThat(t.path("upcomingInterviews").path("sample").asBoolean()).isFalse();
        assertThat(t.path("activePlacement").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("activePlacement").path("label").asText()).isEqualTo("On track");

        JsonNode sub = t.path("submissionsPending");
        assertThat(sub.path("sample").asBoolean()).as("approvals belong to another role's module").isTrue();
        assertThat(sub.path("value").asLong()).isZero();
        assertThat(sub.path("deltaPct").isNull()).isTrue();
        assertThat(sub.path("sparkline")).isEmpty();

        // recommended = open matches the consultant has not applied to, best score first
        JsonNode rec = h.path("recommendedMatches");
        assertThat(texts(rec, "title")).containsExactly("Java Developer", "Data Engineer");
        assertThat(rec.get(0).path("score").asInt()).isEqualTo(90);
        assertThat(rec.get(0).path("company").asText()).isEqualTo("Acme Corp");
        assertThat(rec.get(0).path("location").asText()).isEqualTo("Austin, TX");
        assertThat(rec.get(0).path("workMode").asText()).isEqualTo("HYBRID");
        assertThat(rec.get(0).path("employment").asText()).isEqualTo("CONTRACT");

        // assigned opportunities: newest assignment first, status from the application (none / ASSIGNED / later)
        JsonNode opps = h.path("assignedOpportunities");
        assertThat(texts(opps, "title")).containsExactly("Data Engineer", "QA Architect", "SRE Lead");
        assertThat(texts(opps, "status")).containsExactly("REVIEW_NEEDED", "INTERESTED", "AWAITING_APPROVAL");

        // applications, most recently applied first, CLOSED ones still listed
        JsonNode apps = h.path("applications");
        assertThat(texts(apps, "title")).containsExactly("QA Architect", "SRE Lead", "Closed Req");
        assertThat(texts(apps, "stage")).containsExactly("SUBMITTED", "ASSIGNED", "CLOSED");
        assertThat(apps.get(0).path("code").asText()).startsWith("CWS-");
        assertThat(apps.get(0).path("company").asText()).isEqualTo("Acme Corp");

        JsonNode iv = h.path("interviews");
        assertThat(iv).hasSize(2);
        assertThat(texts(iv, "round")).containsExactly("Round 1", "Final");
        assertThat(iv.get(0).path("title").asText()).isEqualTo("QA Architect");
        assertThat(iv.get(0).path("company").asText()).isEqualTo("Acme Corp");
        assertThat(iv.get(0).path("durationMinutes").asInt()).isEqualTo(45);
        assertThat(iv.get(0).path("mode").asText()).isEqualTo("VIDEO");
        assertThat(iv.get(0).path("modeSample").asBoolean()).as("the interview mode is not stored yet").isTrue();

        JsonNode taskRows = h.path("tasks");
        assertThat(texts(taskRows, "title")).containsExactly("Update rate card");
        assertThat(taskRows.get(0).path("status").asText()).isEqualTo("NOT_STARTED");
        assertThat(taskRows.get(0).path("priority").asText()).isEqualTo("MEDIUM");

        JsonNode focus = h.path("todaysFocus");
        assertThat(focus.path("date").asText()).isEqualTo(today.toString());
        List<String> keys = texts(focus.path("items"), "key");
        assertThat(keys).contains("matches", "interview-prep", "follow-up").anyMatch(k -> k.startsWith("task-")).doesNotContain("availability");
        assertThat(texts(focus.path("items"), "label")).contains("Review 1 new job match", "Update rate card");

        assertThat(h.path("marketerMessages").path("sample").asBoolean()).isTrue();
        assertThat(h.path("marketerMessages").path("items")).isEmpty();
        assertThat(h.path("resumeStrength").path("checks")).hasSize(5);
        assertThat(h.path("resumeStrength").path("hasResume").asBoolean()).isFalse();
    }

    // ---- (b) own rows only ----------------------------------------------------------------------------------------

    @Test
    void aConsultantNeverSeesAnotherConsultantsRowsInTheSameOrg() throws Exception {
        seedC1();
        ClientAccount other = client(a, "Globex Hidden");
        ClientRequirement hr = requirement(a, other, "Hidden Secret Role");
        match(c2, hr, "ASSIGNED", 95, now.minus(Duration.ofDays(30)), now.minus(Duration.ofDays(1)));
        TalentApplication hApp = application(c2, hr, "SUBMITTED", 1);
        interview(c2, hApp, "SCHEDULED", now.plus(Duration.ofDays(1)), "Hidden Round");
        placement(c2, "ACTIVE");
        task(c2, "Hidden task", today, "NOT_STARTED");

        MvcResult r = call("cws-a-c1", a);
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(body).doesNotContain("Hidden").doesNotContain("Globex").doesNotContain("Robin Two");
        JsonNode h = om.readTree(body);
        assertThat(h.path("tiles").path("jobMatches").path("value").asLong()).isEqualTo(4);
        assertThat(h.path("tiles").path("activePlacement").path("value").asLong()).isEqualTo(1);
        assertThat(h.path("tasks")).hasSize(1);

        // and the other consultant sees exactly their own
        JsonNode h2 = home("cws-a-c2", a);
        assertThat(h2.path("me").path("consultantId").asLong()).isEqualTo(c2.getId());
        assertThat(texts(h2.path("assignedOpportunities"), "title")).containsExactly("Hidden Secret Role");
        assertThat(h2.path("tiles").path("jobMatches").path("value").asLong()).isEqualTo(1);
        assertThat(h2.path("applications")).hasSize(1);
        assertThat(h2.toString()).doesNotContain("Java Developer").doesNotContain("Update rate card").doesNotContain("Casey One");
    }

    // ---- (c) / (d) refusals ---------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationsOwnerAndConsultantGetTheGeneric404() throws Exception {
        seedC1();
        assertGeneric404(call("cws-b-owner", a), "another org's owner");
        assertGeneric404(call("cws-b-c1", a), "another org's consultant with a profile");
        assertGeneric404(call("ghost-login", a), "a login that does not exist");
        assertGeneric404(call("cws-a-c1", 999999999L), "an organization that does not exist");
        assertThat(b.getId()).isNotEqualTo(a.getId());
    }

    @Test
    void membersWithoutOpportunitiesRespondAndConsultantsWithoutAProfileGetTheGeneric404() throws Exception {
        seedC1();
        assertGeneric404(call("cws-a-owner", a), "owner lacks opportunities.respond");
        assertGeneric404(call("cws-a-admin", a), "admin lacks opportunities.respond");
        assertGeneric404(call("cws-a-marketer", a), "marketer lacks opportunities.respond");
        assertGeneric404(call("cws-a-noprofile", a), "consultant seat without a consultant_profile");
    }

    @Test
    void theRouteIs404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        seedC1();
        flags(true, false);
        assertGeneric404(call("cws-a-c1", a), "roles flag off");
        flags(false, true);
        assertGeneric404(call("cws-a-c1", a), "master flag off");
    }

    // ---- (e) empty consultant -------------------------------------------------------------------------------------

    @Test
    void aConsultantWithNoRowsGetsZerosAndEmptyListsNeverNulls() throws Exception {
        c1.setAvailabilitySince(null);
        profiles.saveAndFlush(c1);
        JsonNode h = home("cws-a-c1", a);

        for (String tile : List.of("jobMatches", "assignedOpportunities", "activeApplications", "upcomingInterviews")) {
            JsonNode t = h.path("tiles").path(tile);
            assertThat(t.path("value").asLong()).as(tile).isZero();
            assertThat(t.path("previous").asLong()).as(tile).isZero();
            assertThat(t.get("deltaPct").isNull()).as(tile + " has no delta, not a made-up one").isTrue();
            assertThat(t.path("sparkline")).as(tile).hasSize(6);
            for (JsonNode p : t.path("sparkline")) assertThat(p.asLong()).isZero();
            assertThat(t.path("sample").asBoolean()).isFalse();
        }
        assertThat(h.path("tiles").path("activePlacement").path("value").asLong()).isZero();
        assertThat(h.path("tiles").path("activePlacement").get("label").isNull()).isTrue();
        for (String list : List.of("recommendedMatches", "assignedOpportunities", "applications", "interviews", "tasks")) {
            assertThat(h.get(list).isArray()).as(list + " is an array, never null").isTrue();
            assertThat(h.get(list)).as(list).isEmpty();
        }
        assertThat(h.path("marketerMessages").get("items").isArray()).isTrue();
        assertThat(h.path("resumeStrength").path("percent").asInt()).isZero();
        assertThat(h.path("resumeStrength").path("hasResume").asBoolean()).isFalse();
        assertThat(h.path("resumeStrength").path("checks")).hasSize(5);
        assertThat(texts(h.path("todaysFocus").path("items"), "key")).containsExactly("availability");
    }
}
