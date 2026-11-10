package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationEventRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationNoteRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
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
 * The Marketing > Applications board through the real chain (flags, roles-as-data, ASSIGNED scope, composite tenant FKs):
 * {@code /api/orgs/{orgId}/mkt/applications}. A marketer sees only the applications of the consultants assigned to them, writes
 * records on those, and every refusal (another tenant, an unassigned consultant, a missing permission, the module off) is the same
 * generic 404. NOTE: written against the real stack (Testcontainers); it needs Docker and was compiled but not executed on the
 * machine that wrote it.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class MktApplicationsIT {

    private static final String WHO = "mkt-applications-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgRoleRepository roleRows;
    @Autowired private OrgRolePermissionRepository permissionRows;
    @Autowired private OrgMemberRoleRepository memberRoles;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private MarketerAssignmentRepository assignments;
    @Autowired private TalentApplicationRepository apps;
    @Autowired private TalentApplicationEventRepository events;
    @Autowired private TalentApplicationNoteRepository notes;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private OrgMember marketer;
    private TalentApplication mine;
    private TalentApplication notMine;
    private int roleSeq = 0;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("mkt-app-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("mkt-app-b-" + n, OrgStatus.ACTIVE);
        flags(true);

        marketer = actor(a, "mkt-app-marketer", new String[][] {
            { "member.view_summary", "ASSIGNED" }, { "pipeline.view", "ASSIGNED" }, { "followups.manage", "ASSIGNED" }, { "submissions.record", "ASSIGNED" },
        });
        actor(a, "mkt-app-readonly", new String[][] { { "member.view_summary", "ASSIGNED" }, { "pipeline.view", "ASSIGNED" } });
        actor(a, "mkt-app-nobody", new String[][] { { "dashboard.view_org", "ORG" } });
        actor(b, "mkt-app-b-marketer", new String[][] { { "member.view_summary", "ASSIGNED" }, { "pipeline.view", "ASSIGNED" }, { "followups.manage", "ASSIGNED" } });

        ClientAccount client = client(a, "TechCorp");
        ConsultantProfile alex = consultant(a, "Alex Morgan");
        ConsultantProfile priya = consultant(a, "Priya Sharma");
        assign(a, alex, marketer);
        mine = application(a, client, alex, "APP-IT-001", "UNDER_REVIEW");
        notMine = application(a, client, priya, "APP-IT-002", "OFFER");
        // a tenant B row that must never leak
        ClientAccount other = client(b, "OtherCo");
        application(b, other, consultant(b, "Bea Other"), "APP-IT-901", "OFFER");
    }

    @AfterEach
    void clean() {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        cache.invalidate();
    }

    private void flags(boolean marketing) {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}", WHO, Instant.now()));
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":true}", WHO, Instant.now()));
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_MARKETING, "{\"on\":" + marketing + "}", WHO, Instant.now()));
        cache.invalidate();
    }

    // ---- fixtures ---------------------------------------------------------------------------------------------------

    private OrgMember actor(Organization org, String login, String[][] keys) {
        OrgMember m = fx.active(org, login, OrgRole.MEMBER);
        OrgRoleDefinition def = new OrgRoleDefinition();
        def.setOrgId(org.getId());
        def.setRoleKey("CUSTOM_MKT_APP_" + (roleSeq++) + "_" + (System.nanoTime() % 100000));
        def.setName("Applications test role");
        def = roleRows.saveAndFlush(def);
        for (String[] k : keys) permissionRows.saveAndFlush(new OrgRolePermission(def.getId(), k[0], PermissionScope.valueOf(k[1]), null, null));
        OrgMemberRole row = new OrgMemberRole();
        row.setOrgId(org.getId());
        row.setMemberId(m.getId());
        row.setRoleId(def.getId());
        row.setPrimary(true);
        row.setGrantedAt(Instant.now());
        memberRoles.saveAndFlush(row);
        m.setPrimaryRoleId(def.getId());
        members.saveAndFlush(m);
        return m;
    }

    private ClientAccount client(Organization org, String name) {
        ClientAccount c = new ClientAccount();
        c.setOrgId(org.getId());
        c.setName(name);
        return clients.saveAndFlush(c);
    }

    private ConsultantProfile consultant(Organization org, String name) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(org.getId());
        c.setDisplayName(name);
        c.setEmail(name.toLowerCase().replace(' ', '.') + "@example.test");
        return consultants.saveAndFlush(c);
    }

    private void assign(Organization org, ConsultantProfile c, OrgMember marketer) {
        MarketerAssignment m = new MarketerAssignment();
        m.setOrgId(org.getId());
        m.setConsultantId(c.getId());
        m.setMarketerMemberId(marketer.getId());
        assignments.saveAndFlush(m);
    }

    private TalentApplication application(Organization org, ClientAccount client, ConsultantProfile c, String code, String stage) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(org.getId());
        r.setClientId(client.getId());
        r.setTitle("Senior Java Developer");
        r = requirements.saveAndFlush(r);
        TalentApplication t = new TalentApplication();
        t.setOrgId(org.getId());
        t.setCode(code);
        t.setRequirementId(r.getId());
        t.setConsultantId(c.getId());
        t.setClientId(client.getId());
        t.setStage(stage);
        t.setAppliedOn(LocalDate.now().minusDays(10));
        t.setSourceLabel("LinkedIn");
        t.setNextAction("Follow up with hiring manager");
        t.setNextActionDue(LocalDate.now().minusDays(2));
        t = apps.saveAndFlush(t);
        TalentApplicationEvent e = new TalentApplicationEvent();
        e.setOrgId(org.getId());
        e.setApplicationId(t.getId());
        e.setEventType("CREATED");
        e.setToStage("ASSIGNED");
        e.setOccurredAt(Instant.now().minus(10, ChronoUnit.DAYS));
        events.saveAndFlush(e);
        return t;
    }

    private MvcResult call(String login, MockHttpServletRequestBuilder req) throws Exception {
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission");
    }

    private JsonNode board(String login, Organization org) throws Exception {
        MvcResult r = call(login, get("/api/orgs/" + org.getId() + "/mkt/applications"));
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return om.readTree(r.getResponse().getContentAsString());
    }

    // ---- reads ------------------------------------------------------------------------------------------------------

    @Test
    void aMarketerSeesOnlyTheApplicationsOfTheirAssignedConsultants() throws Exception {
        JsonNode d = board("mkt-app-marketer", a);
        JsonNode items = d.path("tracker").path("items");
        assertThat(items).hasSize(1);
        assertThat(items.get(0).path("code").isNull()).as("no seat, so only the stage is shown").isTrue();
        assertThat(items.get(0).path("consultant").path("consent").asText()).isEqualTo("SUMMARY");
        assertThat(items.get(0).path("consultant").path("name").asText()).isEqualTo("Alex Morgan");
        assertThat(items.get(0).path("stage").path("label").asText()).isEqualTo("Awaiting Response");
        assertThat(d.path("tracker").path("total").asLong()).isEqualTo(1);
        assertThat(d.path("kpis").get(0).path("key").asText()).isEqualTo("active");
        assertThat(d.path("kpis").get(0).path("value").asLong()).isEqualTo(1);
        // Alex has no seat, so the org sees the stage only (doc 60 section 0.8): the next action is not shared and nothing is overdue
        assertThat(d.path("overdueTotal").asLong()).isEqualTo(0);
        assertThat(d.path("perms").path("followups").asBoolean()).isTrue();
        assertThat(d.toString()).doesNotContain("Priya Sharma").doesNotContain("APP-IT-002").doesNotContain("Bea Other").doesNotContain("APP-IT-901");
    }

    @Test
    void everyRefusalIsTheSameGeneric404() throws Exception {
        assertGeneric404(call("mkt-app-nobody", get("/api/orgs/" + a.getId() + "/mkt/applications")), "no member.view_summary");
        assertGeneric404(call("mkt-app-marketer", get("/api/orgs/" + b.getId() + "/mkt/applications")), "another tenant");
        assertGeneric404(call("mkt-app-b-marketer", get("/api/orgs/" + a.getId() + "/mkt/applications")), "the other tenant's marketer");
        flags(false);
        assertGeneric404(call("mkt-app-marketer", get("/api/orgs/" + a.getId() + "/mkt/applications")), "marketing module off");
    }

    // ---- writes (records only) ----------------------------------------------------------------------------------------

    @Test
    void aNoteIsSavedAndLeavesATimelineEventButAnUnassignedConsultantIsA404() throws Exception {
        long before = notes.countByOrgIdAndApplicationId(a.getId(), mine.getId());
        MvcResult ok = call("mkt-app-marketer", post("/api/orgs/" + a.getId() + "/mkt/applications/" + mine.getId() + "/notes").content("{\"body\":\"Called the vendor\"}"));
        assertThat(ok.getResponse().getStatus()).as(ok.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(notes.countByOrgIdAndApplicationId(a.getId(), mine.getId())).isEqualTo(before + 1);
        assertThat(events.findByOrgIdAndApplicationIdOrderByOccurredAtAsc(a.getId(), mine.getId())).extracting(TalentApplicationEvent::getEventType).contains("NOTE");

        assertGeneric404(call("mkt-app-marketer", post("/api/orgs/" + a.getId() + "/mkt/applications/" + notMine.getId() + "/notes").content("{\"body\":\"x\"}")), "unassigned consultant");
        assertThat(notes.countByOrgIdAndApplicationId(a.getId(), notMine.getId())).isZero();
    }

    @Test
    void aReadOnlyMarketerCannotWriteAndStageChangesAreRecordedNotSubmitted() throws Exception {
        assertGeneric404(call("mkt-app-readonly", post("/api/orgs/" + a.getId() + "/mkt/applications/" + mine.getId() + "/notes").content("{\"body\":\"x\"}")), "no followups.manage");
        MvcResult ok = call("mkt-app-marketer", post("/api/orgs/" + a.getId() + "/mkt/applications/" + mine.getId() + "/stage").content("{\"stage\":\"interviewing\"}"));
        assertThat(ok.getResponse().getStatus()).as(ok.getResponse().getContentAsString()).isEqualTo(200);
        TalentApplication after = apps.findByOrgIdAndId(a.getId(), mine.getId()).orElseThrow();
        assertThat(after.getStage()).isEqualTo("INTERVIEWING");
        assertThat(events.findByOrgIdAndApplicationIdOrderByOccurredAtAsc(a.getId(), mine.getId())).extracting(TalentApplicationEvent::getEventType).contains("STAGE_CHANGE");
    }

    @Test
    void followUpDoneClearsTheNextActionAndAnotherTenantCannotTouchIt() throws Exception {
        MvcResult ok = call("mkt-app-marketer", post("/api/orgs/" + a.getId() + "/mkt/applications/" + mine.getId() + "/follow-up-done"));
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(apps.findByOrgIdAndId(a.getId(), mine.getId()).orElseThrow().getNextAction()).isNull();
        assertGeneric404(call("mkt-app-b-marketer", post("/api/orgs/" + b.getId() + "/mkt/applications/" + mine.getId() + "/follow-up-done")), "another tenant's application id");
    }
}
