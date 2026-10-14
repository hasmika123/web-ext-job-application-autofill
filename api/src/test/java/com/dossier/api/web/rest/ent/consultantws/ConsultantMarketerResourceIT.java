package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.consultantws.CwsTask;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.TalentApplication;
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
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
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
 * "My Marketer" through the real chain on real rows: {@code GET /api/orgs/{orgId}/me-workspace/marketer}. The page is read-only, so there
 * are no write cases. Own data is asserted against rows the test wrote, a second consultant's data and marketer never leak, and every
 * refusal is the generic 404.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConsultantMarketerResourceIT {

    private static final String WHO = "cws-mkt-it";

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
    @Autowired private CwsTaskRepository tasks;
    @Autowired private ConsultantSkillRepository skills;
    @Autowired private MarketerAssignmentRepository assignments;
    @Autowired private MarketerCapacityRepository capacities;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private final LocalDate today = LocalDate.now(ZoneOffset.UTC);
    private int seq = 0;

    private OrgMember emily;
    private OrgMember otherMarketer;
    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ConsultantProfile c3;
    private ClientAccount acme;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cws-mk-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-mk-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);

        staff(a, "cws-mk-a-owner", OrgRole.OWNER);
        staff(a, "cws-mk-a-admin", OrgRole.ADMIN);
        emily = staff(a, "cws-mk-a-emily", OrgRole.MARKETER);
        otherMarketer = staff(a, "cws-mk-a-omar", OrgRole.MARKETER);
        staff(b, "cws-mk-b-owner", OrgRole.OWNER);
        name("cws-mk-a-emily", "Emily", "Carter");
        name("cws-mk-a-omar", "Omar", "Hidden");

        c1 = consultant(a, "cws-mk-a-c1", "Casey One", true);
        c2 = consultant(a, "cws-mk-a-c2", "Robin Two", true);
        c3 = consultant(a, "cws-mk-a-c3", "Sam Unassigned", true);
        consultant(a, "cws-mk-a-noprofile", "Nobody", false);
        consultant(b, "cws-mk-b-c1", "Bee Consultant", true);

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

    private void name(String login, String first, String last) {
        User u = users.findOneByLogin(login).orElseThrow();
        u.setFirstName(first);
        u.setLastName(last);
        users.saveAndFlush(u);
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
        p.setAvailabilitySince(today);
        return profiles.saveAndFlush(p);
    }

    private ClientAccount client(Organization org, String name) {
        ClientAccount c = new ClientAccount();
        c.setOrgId(org.getId());
        c.setName(name);
        return clients.saveAndFlush(c);
    }

    private ClientRequirement requirement(ClientAccount client, String title) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(client.getOrgId());
        r.setClientId(client.getId());
        r.setTitle(title);
        r.setLocation("Austin, TX");
        r.setWorkMode("HYBRID");
        return requirements.saveAndFlush(r);
    }

    private RequirementMatch match(ConsultantProfile c, ClientRequirement r, String status, int score, int assignedDaysAgo) {
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(c.getOrgId());
        m.setRequirementId(r.getId());
        m.setConsultantId(c.getId());
        m.setScore(score);
        m.setStatus(status);
        m.setCreatedAt(now.minus(Duration.ofDays(20)));
        if ("ASSIGNED".equals(status)) m.setAssignedAt(now.minus(Duration.ofDays(assignedDaysAgo)));
        return matches.saveAndFlush(m);
    }

    private TalentApplication application(ConsultantProfile c, ClientRequirement r, String stage, String next, LocalDate due) {
        TalentApplication t = new TalentApplication();
        t.setOrgId(c.getOrgId());
        t.setCode("MK-" + System.nanoTime() + "-" + (seq++));
        t.setRequirementId(r.getId());
        t.setConsultantId(c.getId());
        t.setClientId(r.getClientId());
        t.setStage(stage);
        t.setAppliedOn(today.minusDays(2));
        t.setNextAction(next);
        t.setNextActionDue(due);
        return applications.saveAndFlush(t);
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

    private void skill(ConsultantProfile c, String s, int order) {
        ConsultantSkill k = new ConsultantSkill();
        k.setOrgId(c.getOrgId());
        k.setConsultantId(c.getId());
        k.setSkill(s);
        k.setSortOrder(order);
        skills.saveAndFlush(k);
    }

    private void assign(ConsultantProfile c, OrgMember marketer, String status) {
        MarketerAssignment m = new MarketerAssignment();
        m.setOrgId(c.getOrgId());
        m.setConsultantId(c.getId());
        m.setMarketerMemberId(marketer.getId());
        m.setStatus(status);
        assignments.saveAndFlush(m);
    }

    private void title(OrgMember marketer, String label) {
        MarketerCapacity cap = new MarketerCapacity();
        cap.setOrgId(marketer.getOrgId());
        cap.setMemberId(marketer.getId());
        cap.setTitleLabel(label);
        capacities.saveAndFlush(cap);
    }

    /** c1: Emily is the marketer. Three assigned jobs (one with an application, one closed), one unassigned open match, tasks. */
    private void seedC1() {
        title(emily, "Talent Marketing Specialist");
        assign(c1, emily, "ACTIVE");
        ClientRequirement r1 = requirement(acme, "Senior Java Developer");
        ClientRequirement r2 = requirement(acme, "Data Engineer");
        ClientRequirement r3 = requirement(acme, "Closed Req");
        ClientRequirement r4 = requirement(acme, "Open Match Only");
        match(c1, r1, "ASSIGNED", 92, 2);
        match(c1, r2, "ASSIGNED", 72, 5);
        match(c1, r3, "ASSIGNED", 95, 9);
        match(c1, r4, "SUGGESTED", 88, 0);
        application(c1, r1, "SUBMITTED", "Client feedback", today.plusDays(3));
        application(c1, r3, "CLOSED", "Should not show", today.plusDays(1));
        task(c1, "Update resume", today, "IN_PROGRESS");
        task(c1, "Already done", today, "DONE");
        task(c1, "No due date", null, "NOT_STARTED");
        skill(c1, "Java", 0);
        skill(c1, "AWS", 1);
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private MvcResult call(String login, long orgId) throws Exception {
        return mockMvc.perform(get("/api/orgs/" + orgId + "/me-workspace/marketer").with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private JsonNode page(String login, Organization org) throws Exception {
        MvcResult r = call(login, org.getId());
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

    // ---- own data -------------------------------------------------------------------------------------------------

    @Test
    void aConsultantSeesTheirOwnMarketerFocusOpportunitiesAndFollowups() throws Exception {
        seedC1();
        JsonNode p = page("cws-mk-a-c1", a);

        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        JsonNode m = p.path("marketer");
        assertThat(m.path("memberId").asLong()).isEqualTo(emily.getId());
        assertThat(m.path("name").asText()).isEqualTo("Emily Carter");
        assertThat(m.path("title").asText()).isEqualTo("Talent Marketing Specialist");
        assertThat(m.has("email")).isFalse();

        JsonNode focus = p.path("focusOpportunities");
        assertThat(texts(focus, "title")).as("assigned, newest first, CLOSED application and the unassigned match left out").containsExactly("Senior Java Developer", "Data Engineer");
        assertThat(texts(focus, "stage")).containsExactly("SUBMITTED", "MARKETING");
        assertThat(texts(focus, "priority")).containsExactly("HIGH", "MEDIUM");
        assertThat(focus.get(0).path("company").asText()).isEqualTo("Acme Corp");
        assertThat(focus.get(0).path("nextStep").asText()).isEqualTo("Client feedback");
        assertThat(focus.get(0).path("nextStepDue").asText()).isEqualTo(today.plusDays(3).toString());
        assertThat(focus.get(1).path("nextStep").isNull()).isTrue();

        JsonNode fu = p.path("followups");
        assertThat(texts(fu, "description")).as("own app next action + own open tasks with a due date, by date").containsExactly("Update resume", "Client feedback");
        assertThat(texts(fu, "kind")).containsExactly("TASK", "APPLICATION");
        assertThat(texts(fu, "status")).containsExactly("IN_PROGRESS", "UPCOMING");
        assertThat(fu.get(1).path("relatedTitle").asText()).isEqualTo("Senior Java Developer");
        assertThat(fu.get(1).path("relatedCompany").asText()).isEqualTo("Acme Corp");

        JsonNode mf = p.path("marketerFocus");
        assertThat(texts(mf, "key")).containsExactly("marketing", "skills", "assigned", "strong");
        assertThat(mf.get(0).path("detail").asText()).isEqualTo("to 4 potential opportunities");
        assertThat(mf.get(1).path("title").asText()).isEqualTo("Targeting Java, AWS roles");
        assertThat(mf.get(2).path("title").asText()).isEqualTo("Working 3 assigned opportunities");

        assertThat(p.path("responseBadge").path("sample").asBoolean()).isTrue();
        assertThat(p.path("messages").path("sample").asBoolean()).isTrue();
        assertThat(p.path("messages").path("items")).hasSize(4);
        assertThat(p.path("messages").path("items").get(0).path("from").asText()).isEqualTo("Emily Carter");
        assertThat(p.path("actionPlan").path("sample").asBoolean()).isTrue();
        assertThat(p.path("actionPlan").path("items")).isNotEmpty();
        assertThat(p.path("notes").path("sample").asBoolean()).isTrue();
        assertThat(p.path("notes").path("items")).isNotEmpty();
    }

    @Test
    void anotherConsultantsRowsAndTheirMarketerNeverLeak() throws Exception {
        seedC1();
        title(otherMarketer, "Hidden Specialist");
        assign(c2, otherMarketer, "ACTIVE");
        ClientAccount other = client(a, "Globex Hidden");
        ClientRequirement hr = requirement(other, "Hidden Secret Role");
        match(c2, hr, "ASSIGNED", 99, 1);
        application(c2, hr, "SUBMITTED", "Hidden next step", today.plusDays(1));
        task(c2, "Hidden task", today, "NOT_STARTED");
        skill(c2, "HiddenSkill", 0);

        MvcResult r = call("cws-mk-a-c1", a.getId());
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(body).doesNotContain("Hidden").doesNotContain("Globex").doesNotContain("Omar").doesNotContain("Robin Two");

        JsonNode p2 = page("cws-mk-a-c2", a);
        assertThat(p2.path("marketer").path("name").asText()).isEqualTo("Omar Hidden");
        assertThat(texts(p2.path("focusOpportunities"), "title")).containsExactly("Hidden Secret Role");
        assertThat(p2.toString()).doesNotContain("Emily").doesNotContain("Senior Java Developer").doesNotContain("Update resume");
    }

    @Test
    void aConsultantWithNoMarketerGetsAnHonestEmptyPage() throws Exception {
        JsonNode p = page("cws-mk-a-c3", a);
        assertThat(p.get("marketer").isNull()).isTrue();
        for (String list : List.of("focusOpportunities", "followups", "marketerFocus")) {
            assertThat(p.get(list).isArray()).as(list).isTrue();
            assertThat(p.get(list)).as(list).isEmpty();
        }
        assertThat(p.path("messages").path("items")).as("no conversation with nobody").isEmpty();
        assertThat(p.path("actionPlan").path("items")).isEmpty();
        assertThat(p.path("notes").path("items")).isEmpty();
    }

    @Test
    void anInactiveAssignmentIsNotShownAsTheMarketer() throws Exception {
        assign(c3, emily, "ENDED");
        assertThat(page("cws-mk-a-c3", a).get("marketer").isNull()).isTrue();
    }

    // ---- refusals -------------------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationAndNonConsultantsGetTheGeneric404() throws Exception {
        seedC1();
        assertGeneric404(call("cws-mk-b-owner", a.getId()), "another org's owner");
        assertGeneric404(call("cws-mk-b-c1", a.getId()), "another org's consultant");
        assertGeneric404(call("ghost-login", a.getId()), "unknown login");
        assertGeneric404(call("cws-mk-a-c1", 999999999L), "organization that does not exist");
        assertGeneric404(call("cws-mk-a-owner", a.getId()), "owner lacks opportunities.respond");
        assertGeneric404(call("cws-mk-a-admin", a.getId()), "admin lacks opportunities.respond");
        assertGeneric404(call("cws-mk-a-emily", a.getId()), "the marketer herself has no consultant record");
        assertGeneric404(call("cws-mk-a-noprofile", a.getId()), "consultant seat without a profile");
        assertThat(b.getId()).isNotEqualTo(a.getId());
    }

    @Test
    void theRouteIs404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        seedC1();
        flags(true, false);
        assertGeneric404(call("cws-mk-a-c1", a.getId()), "roles flag off");
        flags(false, true);
        assertGeneric404(call("cws-mk-a-c1", a.getId()), "master flag off");
    }
}
