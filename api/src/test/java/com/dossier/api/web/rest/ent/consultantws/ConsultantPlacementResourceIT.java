package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.consultantws.CwsPlacementActivity;
import com.dossier.api.domain.ent.consultantws.CwsPlacementChecklist;
import com.dossier.api.domain.ent.consultantws.CwsPlacementDetail;
import com.dossier.api.domain.ent.consultantws.CwsPlacementMeeting;
import com.dossier.api.domain.ent.consultantws.CwsPlacementMilestone;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
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
import com.dossier.api.repository.ent.consultantws.CwsPlacementActivityRepository;
import com.dossier.api.repository.ent.consultantws.CwsPlacementChecklistRepository;
import com.dossier.api.repository.ent.consultantws.CwsPlacementDetailRepository;
import com.dossier.api.repository.ent.consultantws.CwsPlacementMeetingRepository;
import com.dossier.api.repository.ent.consultantws.CwsPlacementMilestoneRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.consultantws.ConsultantWsPlacementDemoSeeder;
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
 * The Consultant workspace My Placement page through the real chain on real rows: {@code /api/orgs/{orgId}/me-workspace/placements}. A consultant
 * only ever sees and ticks their own placement, never a rate, every refusal is the generic 404, and every free-text write is PII-scanned.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConsultantPlacementResourceIT {

    private static final String WHO = "cws-pl-it";

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
    @Autowired private TalentPlacementRepository placements;
    @Autowired private CwsPlacementDetailRepository details;
    @Autowired private CwsPlacementChecklistRepository checklist;
    @Autowired private CwsPlacementMilestoneRepository milestones;
    @Autowired private CwsPlacementMeetingRepository meetings;
    @Autowired private CwsPlacementActivityRepository activity;
    @Autowired private MarketerAssignmentRepository assignments;
    @Autowired private MarketerCapacityRepository capacities;
    @Autowired private ConsultantWsPlacementDemoSeeder seeder;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private final LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();

    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ConsultantProfile b1;
    private OrgMember marketer;
    private ClientAccount acme;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cws-p-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-p-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);
        staff(a, "cws-p-a-owner", OrgRole.OWNER);
        staff(a, "cws-p-a-admin", OrgRole.ADMIN);
        marketer = staff(a, "cws-p-a-marketer", OrgRole.MARKETER);
        staff(b, "cws-p-b-owner", OrgRole.OWNER);
        c1 = consultant(a, "cws-p-a-c1", "Casey One", true);
        c2 = consultant(a, "cws-p-a-c2", "Robin Two", true);
        consultant(a, "cws-p-a-noprofile", "Nobody", false);
        b1 = consultant(b, "cws-p-b-c1", "Bee Consultant", true);
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

    private TalentPlacement placement(ConsultantProfile c, ClientAccount cl, String title, String status, LocalDate start, LocalDate end) {
        TalentPlacement p = new TalentPlacement();
        p.setOrgId(c.getOrgId());
        p.setConsultantId(c.getId());
        p.setClientId(cl.getId());
        p.setRoleTitle(title);
        p.setStatus(status);
        p.setStartDate(start);
        p.setEndDate(end);
        p.setBillRateMinor(98765L);
        p.setRateUnit("HOUR");
        return placements.saveAndFlush(p);
    }

    private CwsPlacementDetail detail(TalentPlacement p, boolean sample) {
        CwsPlacementDetail d = new CwsPlacementDetail();
        d.setOrgId(p.getOrgId());
        d.setPlacementId(p.getId());
        d.setEndClientName("Global Group");
        d.setProjectName("Digital Banking Platform");
        d.setManagerName("Alex Morgan");
        d.setManagerTitle("Engineering Manager");
        d.setLocationLabel("New York, NY (Hybrid)");
        d.setWorkMode("Hybrid");
        d.setHoursPerWeek(40);
        d.setScheduleLabel("Mon - Fri");
        d.setEngagementStatus("AT_RISK");
        d.setStatusNote("Scope is shifting");
        d.setNextCheckIn(today.plusDays(5));
        d.setSampleData(sample);
        return details.saveAndFlush(d);
    }

    private CwsPlacementChecklist item(TalentPlacement p, String label, int sort, boolean done) {
        CwsPlacementChecklist i = new CwsPlacementChecklist();
        i.setOrgId(p.getOrgId());
        i.setPlacementId(p.getId());
        i.setLabel(label);
        i.setSortNo(sort);
        if (done) i.setCompletedAt(now.minus(Duration.ofDays(2)));
        else i.setDueOn(today.plusDays(3));
        return checklist.saveAndFlush(i);
    }

    private void milestone(TalentPlacement p, String label, LocalDate on, boolean done) {
        CwsPlacementMilestone m = new CwsPlacementMilestone();
        m.setOrgId(p.getOrgId());
        m.setPlacementId(p.getId());
        m.setLabel(label);
        m.setOnDate(on);
        m.setCompleted(done);
        milestones.saveAndFlush(m);
    }

    private void meeting(TalentPlacement p, String label, Instant at, String url) {
        CwsPlacementMeeting m = new CwsPlacementMeeting();
        m.setOrgId(p.getOrgId());
        m.setPlacementId(p.getId());
        m.setLabel(label);
        m.setStartsAt(at);
        m.setJoinUrl(url);
        meetings.saveAndFlush(m);
    }

    private void act(TalentPlacement p, String type, String text, Instant at) {
        CwsPlacementActivity x = new CwsPlacementActivity();
        x.setOrgId(p.getOrgId());
        x.setPlacementId(p.getId());
        x.setActivityType(type);
        x.setDescription(text);
        x.setActorLabel("System");
        x.setOccurredAt(at);
        activity.saveAndFlush(x);
    }

    private TalentPlacement active1;
    private TalentPlacement older1;
    private TalentPlacement ended1;
    private CwsPlacementChecklist done1;
    private CwsPlacementChecklist open1;

    /** c1: an older ACTIVE row, the current ACTIVE row (newer start) with everything attached, and one ENDED row. */
    private void seedC1() {
        older1 = placement(c1, acme, "Older Role", "ACTIVE", today.minusMonths(20), null);
        ended1 = placement(c1, acme, "Old Contract", "ENDED", today.minusMonths(14), today.minusMonths(9));
        active1 = placement(c1, acme, "Senior Java Developer", "ACTIVE", today.minusWeeks(3), today.plusMonths(5));
        detail(active1, true);
        done1 = item(active1, "Sign agreement", 0, true);
        open1 = item(active1, "Complete training", 1, false);
        milestone(active1, "Mid-Point Review", today.plusMonths(2), false);
        milestone(active1, "Placement Start", today.minusWeeks(3), true);
        meeting(active1, "Later Sync", now.plus(Duration.ofDays(9)), "http://insecure.example.com/x");
        meeting(active1, "Project Sync", now.plus(Duration.ofDays(2)), "https://meet.example.com/abc");
        meeting(active1, "Already Happened", now.minus(Duration.ofDays(2)), "https://meet.example.com/old");
        for (int i = 0; i < 12; i++) act(active1, "UPDATE", "Entry " + i, now.minus(Duration.ofHours(i + 1)));
        MarketerAssignment m = new MarketerAssignment();
        m.setOrgId(a.getId());
        m.setConsultantId(c1.getId());
        m.setMarketerMemberId(marketer.getId());
        m.setStatus("ACTIVE");
        assignments.saveAndFlush(m);
        MarketerCapacity cap = new MarketerCapacity();
        cap.setOrgId(a.getId());
        cap.setMemberId(marketer.getId());
        cap.setTitleLabel("Senior IT Recruiter");
        capacities.saveAndFlush(cap);
    }

    private TalentPlacement hidden2;
    private CwsPlacementChecklist hiddenItem;

    private void seedC2() {
        ClientAccount other = client(a, "Globex Hidden");
        hidden2 = placement(c2, other, "Hidden Secret Role", "ACTIVE", today.minusWeeks(1), null);
        detail(hidden2, true);
        hiddenItem = item(hidden2, "Hidden checklist", 0, false);
        act(hidden2, "UPDATE", "Hidden activity text", now.minus(Duration.ofHours(1)));
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private static String path(long orgId, String tail) {
        return "/api/orgs/" + orgId + "/me-workspace/placements" + tail;
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

    private JsonNode page(String login, Organization org) throws Exception {
        return ok(send(get(path(org.getId(), "")), login, null), "page " + login);
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

    private static final String TICK = "{\"completed\":true}";
    private static final String UNTICK = "{\"completed\":false}";

    // ---- (a) correct values ---------------------------------------------------------------------------------------

    @Test
    void aConsultantGetsTheirCurrentPlacementWithEverythingAttachedAndNoRate() throws Exception {
        seedC1();
        MvcResult r = send(get(path(a.getId(), "")), "cws-p-a-c1", null);
        String raw = r.getResponse().getContentAsString();
        JsonNode p = ok(r, "page");

        assertThat(raw.toLowerCase()).as("no rate of any kind").doesNotContain("billrate").doesNotContain("rateunit").doesNotContain("98765").doesNotContain("currency");
        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(p.path("name").asText()).isEqualTo("Casey One");
        assertThat(p.path("activeCount").asInt()).isEqualTo(2);

        JsonNode act = p.path("active");
        assertThat(act.path("id").asLong()).as("the most recent ACTIVE placement").isEqualTo(active1.getId());
        assertThat(act.path("roleTitle").asText()).isEqualTo("Senior Java Developer");
        assertThat(act.path("clientName").asText()).isEqualTo("Acme Corp");
        assertThat(act.path("endClientName").asText()).isEqualTo("Global Group");
        assertThat(act.path("projectName").asText()).isEqualTo("Digital Banking Platform");
        assertThat(act.path("managerName").asText()).isEqualTo("Alex Morgan");
        assertThat(act.path("hoursPerWeek").asInt()).isEqualTo(40);
        assertThat(act.path("engagementStatus").asText()).isEqualTo("AT_RISK");
        assertThat(act.path("statusNote").asText()).isEqualTo("Scope is shifting");
        assertThat(act.path("startDate").asText()).isEqualTo(today.minusWeeks(3).toString());
        assertThat(act.path("endDate").asText()).isEqualTo(today.plusMonths(5).toString());
        assertThat(act.path("nextCheckIn").asText()).isEqualTo(today.plusDays(5).toString());
        assertThat(act.path("durationMonths").asInt()).as("planned length, about 5 months and 3 weeks").isBetween(5, 6);
        assertThat(act.path("openEnded").asBoolean()).isFalse();
        assertThat(act.path("billable").asBoolean()).isTrue();
        assertThat(act.path("sample").asBoolean()).isTrue();

        assertThat(p.path("marketer").path("name").asText()).isNotBlank();
        assertThat(p.path("marketer").path("title").asText()).isEqualTo("Senior IT Recruiter");
        assertThat(p.path("marketer").has("email")).isFalse();

        assertThat(texts(p.path("checklist"), "label")).containsExactly("Sign agreement", "Complete training");
        assertThat(p.path("checklist").get(0).path("completedAt").asText()).isNotBlank();
        assertThat(p.path("checklist").get(1).get("completedAt").isNull()).isTrue();
        assertThat(p.path("checklist").get(1).path("dueOn").asText()).isEqualTo(today.plusDays(3).toString());
        assertThat(texts(p.path("milestones"), "label")).containsExactly("Placement Start", "Mid-Point Review");
        assertThat(p.path("milestones").get(0).path("completed").asBoolean()).isTrue();
        assertThat(texts(p.path("meetings"), "label")).as("upcoming only, soonest first").containsExactly("Project Sync", "Later Sync");
        assertThat(p.path("meetings").get(0).path("joinUrl").asText()).isEqualTo("https://meet.example.com/abc");
        assertThat(p.path("meetings").get(1).get("joinUrl").isNull()).as("a non-https link is never exposed").isTrue();
        assertThat(p.path("activity")).as("capped at ten, newest first").hasSize(10);
        assertThat(p.path("activity").get(0).path("description").asText()).isEqualTo("Entry 0");
        assertThat(texts(p.path("past"), "roleTitle")).containsExactly("Old Contract");
        assertThat(p.path("past").get(0).path("endDate").asText()).isEqualTo(today.minusMonths(9).toString());
    }

    @Test
    void anOpenEndedPlacementShowsMonthsElapsedAndNoEndDate() throws Exception {
        TalentPlacement open = placement(c1, acme, "Open Role", "ACTIVE", today.minusMonths(4), null);
        JsonNode act = page("cws-p-a-c1", a).path("active");
        assertThat(act.path("id").asLong()).isEqualTo(open.getId());
        assertThat(act.path("openEnded").asBoolean()).isTrue();
        assertThat(act.get("endDate").isNull()).isTrue();
        assertThat(act.path("durationMonths").asInt()).isBetween(3, 4);
        assertThat(act.get("projectName").isNull()).as("no detail row: nothing is invented").isTrue();
        assertThat(act.path("sample").asBoolean()).isFalse();
    }

    // ---- (b) own rows only ----------------------------------------------------------------------------------------

    @Test
    void aConsultantNeverSeesOrTicksAnotherConsultantsPlacement() throws Exception {
        seedC1();
        seedC2();
        MvcResult r = send(get(path(a.getId(), "")), "cws-p-a-c1", null);
        assertThat(r.getResponse().getContentAsString()).doesNotContain("Hidden").doesNotContain("Globex").doesNotContain("Robin Two");

        assertGeneric404(send(put(path(a.getId(), "/checklist/" + hiddenItem.getId())), "cws-p-a-c1", TICK), "tick another consultant's item");
        assertThat(checklist.findByOrgIdAndId(hiddenItem.getOrgId(), hiddenItem.getId()).orElseThrow().getCompletedAt()).isNull();

        JsonNode p2 = page("cws-p-a-c2", a);
        assertThat(p2.path("active").path("roleTitle").asText()).isEqualTo("Hidden Secret Role");
        assertThat(p2.toString()).doesNotContain("Senior Java Developer").doesNotContain("Casey One").doesNotContain("Sign agreement");
        assertThat(p2.path("marketer").isNull()).isTrue();
    }

    // ---- (c) / (d) refusals ---------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationAndNonConsultantsGetTheGeneric404OnEveryRoute() throws Exception {
        seedC1();
        String item = String.valueOf(open1.getId());
        List<String[]> routes = List.of(
            new String[] { "GET", path(a.getId(), "") },
            new String[] { "PUT", path(a.getId(), "/checklist/" + item) },
            new String[] { "POST", path(a.getId(), "/status-note") }
        );
        for (String login : List.of("cws-p-b-owner", "cws-p-b-c1", "ghost-login", "cws-p-a-owner", "cws-p-a-admin", "cws-p-a-marketer", "cws-p-a-noprofile")) {
            for (String[] route : routes) {
                MockHttpServletRequestBuilder req = "PUT".equals(route[0]) ? put(route[1]) : "POST".equals(route[0]) ? post(route[1]) : get(route[1]);
                String body = "PUT".equals(route[0]) ? TICK : "POST".equals(route[0]) ? "{\"note\":\"Going well\"}" : null;
                assertGeneric404(send(req, login, body), login + " " + route[0] + " " + route[1]);
            }
        }
        assertThat(checklist.findByOrgIdAndId(open1.getOrgId(), open1.getId()).orElseThrow().getCompletedAt()).as("nobody else could tick it").isNull();
        assertThat(activity.countByOrgIdAndPlacementId(a.getId(), active1.getId())).isEqualTo(12);
        assertGeneric404(send(get(path(999999999L, "")), "cws-p-a-c1", null), "an organization that does not exist");
        assertGeneric404(send(put(path(a.getId(), "/checklist/987654321")), "cws-p-a-c1", TICK), "an item id that does not exist");
        assertGeneric404(send(put(path(b.getId(), "/checklist/" + item)), "cws-p-b-c1", TICK), "an item id from another organization");
        assertThat(b1.getOrgId()).isEqualTo(b.getId());
    }

    @Test
    void theRoutesAre404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        seedC1();
        flags(true, false);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-p-a-c1", null), "roles flag off");
        assertGeneric404(send(put(path(a.getId(), "/checklist/" + open1.getId())), "cws-p-a-c1", TICK), "roles flag off, write");
        flags(false, true);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-p-a-c1", null), "master flag off");
        assertThat(checklist.findByOrgIdAndId(open1.getOrgId(), open1.getId()).orElseThrow().getCompletedAt()).isNull();
    }

    // ---- (e) empty consultant -------------------------------------------------------------------------------------

    @Test
    void aConsultantWithNoActivePlacementGetsAnHonestEmptyPageAndPastRows() throws Exception {
        JsonNode p = page("cws-p-a-c1", a);
        assertThat(p.path("activeCount").asInt()).isZero();
        assertThat(p.get("active").isNull()).isTrue();
        assertThat(p.get("marketer").isNull()).isTrue();
        for (String list : List.of("checklist", "milestones", "meetings", "activity", "past")) {
            assertThat(p.get(list).isArray()).as(list).isTrue();
            assertThat(p.get(list)).as(list).isEmpty();
        }
        placement(c1, acme, "Finished Gig", "ENDED", today.minusMonths(8), today.minusMonths(2));
        JsonNode again = page("cws-p-a-c1", a);
        assertThat(again.get("active").isNull()).isTrue();
        assertThat(texts(again.path("past"), "roleTitle")).containsExactly("Finished Gig");
        assertGeneric404(send(post(path(a.getId(), "/status-note")), "cws-p-a-c1", "{\"note\":\"Going well\"}"), "a status note with no active placement");
    }

    // ---- writes ---------------------------------------------------------------------------------------------------

    @Test
    void tickingAndUntickingAChecklistItemIsIdempotentAndReal() throws Exception {
        seedC1();
        String url = path(a.getId(), "/checklist/" + open1.getId());
        JsonNode ticked = ok(send(put(url), "cws-p-a-c1", TICK), "tick");
        assertThat(ticked.path("id").asLong()).isEqualTo(open1.getId());
        assertThat(ticked.path("completedAt").asText()).isNotBlank();
        Instant first = checklist.findByOrgIdAndId(open1.getOrgId(), open1.getId()).orElseThrow().getCompletedAt();
        assertThat(first).isNotNull();

        ok(send(put(url), "cws-p-a-c1", TICK), "tick again");
        assertThat(checklist.findByOrgIdAndId(open1.getOrgId(), open1.getId()).orElseThrow().getCompletedAt()).as("a second tick keeps the first time").isEqualTo(first);

        JsonNode unticked = ok(send(put(url), "cws-p-a-c1", UNTICK), "untick");
        assertThat(unticked.get("completedAt").isNull()).isTrue();
        assertThat(checklist.findByOrgIdAndId(open1.getOrgId(), open1.getId()).orElseThrow().getCompletedAt()).isNull();
        ok(send(put(url), "cws-p-a-c1", UNTICK), "untick again");

        assertThat(checklist.findByOrgIdAndId(done1.getOrgId(), done1.getId()).orElseThrow().getCompletedAt()).as("other items untouched").isNotNull();
        JsonNode reread = page("cws-p-a-c1", a);
        assertThat(reread.path("checklist").get(1).get("completedAt").isNull()).isTrue();
    }

    @Test
    void theChecklistWriteValidatesItsBodyAndRefusesAnEndedPlacement() throws Exception {
        seedC1();
        String url = path(a.getId(), "/checklist/" + open1.getId());
        assertStatus(send(put(url), "cws-p-a-c1", "{}"), 422, "missing completed");
        assertStatus(send(put(url), "cws-p-a-c1", "{\"completed\":null}"), 422, "null completed");
        assertThat(checklist.findByOrgIdAndId(open1.getOrgId(), open1.getId()).orElseThrow().getCompletedAt()).isNull();

        CwsPlacementChecklist endedItem = item(ended1, "Old item", 0, false);
        MvcResult r = send(put(path(a.getId(), "/checklist/" + endedItem.getId())), "cws-p-a-c1", TICK);
        assertStatus(r, 409, "an ended placement");
        assertThat(r.getResponse().getContentAsString()).contains("PLACEMENT_NOT_ACTIVE");
        assertThat(checklist.findByOrgIdAndId(endedItem.getOrgId(), endedItem.getId()).orElseThrow().getCompletedAt()).isNull();
    }

    @Test
    void aStatusNoteIsStoredAsAnUpdateActivityRowOnTheCurrentPlacement() throws Exception {
        seedC1();
        long before = activity.countByOrgIdAndPlacementId(a.getId(), active1.getId());
        JsonNode n = ok(send(post(path(a.getId(), "/status-note")), "cws-p-a-c1", "{\"note\":\"  Delivery is on schedule  \"}"), "note");
        assertThat(n.path("type").asText()).isEqualTo("UPDATE");
        assertThat(n.path("description").asText()).isEqualTo("Delivery is on schedule");
        assertThat(n.path("actorLabel").asText()).isEqualTo("Casey One");
        assertThat(n.path("sample").asBoolean()).isFalse();
        assertThat(activity.countByOrgIdAndPlacementId(a.getId(), active1.getId())).isEqualTo(before + 1);
        assertThat(activity.countByOrgIdAndPlacementId(a.getId(), older1.getId())).as("the older active row gets nothing").isZero();

        JsonNode reread = page("cws-p-a-c1", a);
        assertThat(reread.path("activity").get(0).path("description").asText()).isEqualTo("Delivery is on schedule");
        assertThat(page("cws-p-a-c2", a).toString()).doesNotContain("Delivery is on schedule");
    }

    @Test
    void theStatusNoteIsValidatedAndPiiScanned() throws Exception {
        seedC1();
        String url = path(a.getId(), "/status-note");
        long before = activity.countByOrgIdAndPlacementId(a.getId(), active1.getId());
        assertStatus(send(post(url), "cws-p-a-c1", "{}"), 422, "no note");
        assertStatus(send(post(url), "cws-p-a-c1", "{\"note\":\"ok\"}"), 422, "too short");
        assertStatus(send(post(url), "cws-p-a-c1", "{\"note\":\"   \"}"), 422, "blank");
        assertStatus(send(post(url), "cws-p-a-c1", "{\"note\":\"" + "x".repeat(301) + "\"}"), 422, "too long");
        MvcResult ssn = send(post(url), "cws-p-a-c1", "{\"note\":\"my SSN 123-45-6789\"}");
        assertStatus(ssn, 422, "a social security number");
        assertThat(ssn.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        assertThat(activity.countByOrgIdAndPlacementId(a.getId(), active1.getId())).as("nothing stored").isEqualTo(before);
        ok(send(post(url), "cws-p-a-c1", "{\"note\":\"" + "y".repeat(300) + "\"}"), "exactly 300 is accepted");
    }

    // ---- the seeder -----------------------------------------------------------------------------------------------

    @Test
    void theDemoSeederIsIdempotent() {
        seeder.seed();
        assertThat(seeder.seed()).as("a second run finds every placement already seeded").isZero();
    }
}
