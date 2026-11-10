package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.consultantws.CwsMatchView;
import com.dossier.api.domain.ent.consultantws.CwsPrepSession;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
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
import com.dossier.api.repository.ent.consultantws.CwsMatchViewRepository;
import com.dossier.api.repository.ent.consultantws.CwsPrepSessionRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
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
import java.time.YearMonth;
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
 * "My Features" through the real chain on real rows: GET /api/orgs/{orgId}/me-workspace/features. Read-only: no write cases. Usage is
 * asserted against rows the test wrote, a second consultant's usage never leaks, and every refusal is the generic 404.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConsultantFeaturesResourceIT {

    private static final String WHO = "cws-feat-it";

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
    @Autowired private CwsMatchViewRepository matchViews;
    @Autowired private CwsPrepSessionRepository prepSessions;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private final LocalDate today = LocalDate.now(ZoneOffset.UTC);
    private int seq = 0;

    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ConsultantProfile c3;
    private ClientAccount acme;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cws-ft-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-ft-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);

        staff(a, "cws-ft-a-owner", OrgRole.OWNER);
        staff(a, "cws-ft-a-admin", OrgRole.ADMIN);
        staff(a, "cws-ft-a-emily", OrgRole.MARKETER);
        staff(b, "cws-ft-b-owner", OrgRole.OWNER);

        c1 = consultant(a, "cws-ft-a-c1", "Casey One", true);
        c2 = consultant(a, "cws-ft-a-c2", "Robin Two", true);
        c3 = consultant(a, "cws-ft-a-c3", "Sam Unassigned", true);
        consultant(a, "cws-ft-a-noprofile", "Nobody", false);
        consultant(b, "cws-ft-b-c1", "Bee Consultant", true);

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


    private final Instant lastMonth = YearMonth.now(ZoneOffset.UTC).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC).minus(Duration.ofDays(1));

    private void view(ConsultantProfile c, ClientRequirement r, Instant at) {
        match(c, r, "SUGGESTED", 80, 0);
        CwsMatchView v = new CwsMatchView();
        v.setOrgId(c.getOrgId());
        v.setConsultantId(c.getId());
        v.setRequirementId(r.getId());
        v.setViewedAt(at);
        matchViews.saveAndFlush(v);
    }

    private void prep(ConsultantProfile c, Instant at) {
        CwsPrepSession s = new CwsPrepSession();
        s.setOrgId(c.getOrgId());
        s.setConsultantId(c.getId());
        s.setTitle("Practice " + (seq++));
        s.setKind(CwsPrepSession.TECHNICAL);
        s.setScore(80);
        s.setDurationMinutes(20);
        s.setOccurredAt(at);
        prepSessions.saveAndFlush(s);
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private MvcResult call(String login, long orgId) throws Exception {
        return mockMvc.perform(get("/api/orgs/" + orgId + "/me-workspace/features").with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
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

    private static JsonNode feature(JsonNode p, String key) {
        for (JsonNode f : p.path("features")) if (key.equals(f.path("key").asText())) return f;
        throw new AssertionError("no feature " + key);
    }

    // ---- own data -------------------------------------------------------------------------------------------------

    @Test
    void usageIsCountedFromTheConsultantsOwnRows() throws Exception {
        ClientRequirement r1 = requirement(acme, "Role One");
        ClientRequirement r2 = requirement(acme, "Role Two");
        ClientRequirement r3 = requirement(acme, "Role Three");
        view(c1, r1, now);
        view(c1, r2, now);
        view(c1, r3, lastMonth);
        for (int i = 0; i < 3; i++) prep(c1, now);
        prep(c1, lastMonth);
        application(c1, r1, "SUBMITTED", null, null);

        JsonNode p = page("cws-ft-a-c1", a);
        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(p.path("entitlementsSample").asBoolean()).isTrue();
        assertThat(p.path("features")).hasSize(5);

        JsonNode m = feature(p, "job-matching");
        assertThat(m.path("used").asInt()).isEqualTo(2);
        assertThat(m.path("usedLastMonth").asInt()).isEqualTo(1);
        assertThat(m.path("allowance").isNull()).as("unlimited").isTrue();
        assertThat(m.path("sample").asBoolean()).isTrue();

        JsonNode prep = feature(p, "interview-prep");
        assertThat(prep.path("used").asInt()).isEqualTo(3);
        assertThat(prep.path("allowance").asInt()).isEqualTo(20);
        assertThat(prep.path("resetsOn").asText()).isEqualTo(YearMonth.now(ZoneOffset.UTC).plusMonths(1).atDay(1).toString());

        assertThat(feature(p, "application-tracking").path("used").asInt()).isEqualTo(1);
        assertThat(feature(p, "resume-tailoring").path("used").isNull()).as("no metered action exists: never a made-up number").isTrue();
        assertThat(feature(p, "resume-optimization").path("used").isNull()).isTrue();

        JsonNode t = p.path("tiles");
        assertThat(t.path("active").asInt()).isEqualTo(5);
        assertThat(t.path("premium").asInt()).isEqualTo(3);
        assertThat(t.path("usedThisMonth").asInt()).isEqualTo(2 + 3 + 1);
        assertThat(t.path("creditsTotal").asInt()).isEqualTo(50);
        assertThat(t.path("creditsLeft").asInt()).isEqualTo(50);
        assertThat(t.path("creditsSample").asBoolean()).isTrue();
    }

    @Test
    void noPriceOrBillingFieldIsEverReturned() throws Exception {
        String body = page("cws-ft-a-c1", a).toString().toLowerCase();
        assertThat(body).doesNotContain("price").doesNotContain("margin").doesNotContain("cost").doesNotContain("billing").doesNotContain("$");
    }

    @Test
    void anotherConsultantsUsageNeverLeaks() throws Exception {
        ClientRequirement r1 = requirement(acme, "Role One");
        for (int i = 0; i < 4; i++) prep(c2, now);
        view(c2, r1, now);
        application(c2, r1, "SUBMITTED", null, null);

        JsonNode p1 = page("cws-ft-a-c1", a);
        assertThat(feature(p1, "interview-prep").path("used").asInt()).isZero();
        assertThat(feature(p1, "job-matching").path("used").asInt()).isZero();
        assertThat(feature(p1, "application-tracking").path("used").asInt()).isZero();
        JsonNode p2 = page("cws-ft-a-c2", a);
        assertThat(feature(p2, "interview-prep").path("used").asInt()).isEqualTo(4);
    }

    @Test
    void aConsultantWithNoActivityGetsZeroesNotErrors() throws Exception {
        JsonNode p = page("cws-ft-a-c3", a);
        assertThat(p.path("features")).hasSize(5);
        assertThat(p.path("tiles").path("usedThisMonth").asInt()).isZero();
        assertThat(p.path("tiles").path("usedDeltaPct").isNull()).isTrue();
        assertThat(feature(p, "interview-prep").path("used").asInt()).isZero();
    }

    // ---- refusals -------------------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationAndNonConsultantsGetTheGeneric404() throws Exception {
        assertGeneric404(call("cws-ft-b-owner", a.getId()), "another org's owner");
        assertGeneric404(call("cws-ft-b-c1", a.getId()), "another org's consultant");
        assertGeneric404(call("ghost-login", a.getId()), "unknown login");
        assertGeneric404(call("cws-ft-a-c1", 999999999L), "organization that does not exist");
        assertGeneric404(call("cws-ft-a-owner", a.getId()), "owner lacks opportunities.respond");
        assertGeneric404(call("cws-ft-a-admin", a.getId()), "admin lacks opportunities.respond");
        assertGeneric404(call("cws-ft-a-emily", a.getId()), "a marketer has no consultant record");
        assertGeneric404(call("cws-ft-a-noprofile", a.getId()), "consultant seat without a profile");
        assertThat(b.getId()).isNotEqualTo(a.getId());
    }

    @Test
    void theRouteIs404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        flags(true, false);
        assertGeneric404(call("cws-ft-a-c1", a.getId()), "roles flag off");
        flags(false, true);
        assertGeneric404(call("cws-ft-a-c1", a.getId()), "master flag off");
    }
}
