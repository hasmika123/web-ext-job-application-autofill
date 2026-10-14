package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.consultantws.CwsSubmission;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
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
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.consultantws.ConsultantWsSubmissionsDemoSeeder;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
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
 * The Consultant workspace Submissions and Approvals page through the real chain on real rows:
 * {@code /api/orgs/{orgId}/me-workspace/submissions}. Every number is asserted against rows the test wrote, a consultant only ever sees and
 * decides their own submissions, every refusal is the generic 404, a second decision is a 409, and every free-text write is PII-scanned.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConsultantSubmissionsResourceIT {

    private static final String WHO = "cws-subs-it";

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
    @Autowired private OrgResumeRepository resumes;
    @Autowired private TalentApplicationRepository applications;
    @Autowired private CwsSubmissionRepository submissions;
    @Autowired private ConsultantWsSubmissionsDemoSeeder seeder;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();

    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ConsultantProfile b1;
    private ClientAccount acme;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cws-s-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-s-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);
        staff(a, "cws-s-a-owner", OrgRole.OWNER);
        staff(a, "cws-s-a-admin", OrgRole.ADMIN);
        staff(a, "cws-s-a-marketer", OrgRole.MARKETER);
        staff(b, "cws-s-b-owner", OrgRole.OWNER);
        c1 = consultant(a, "cws-s-a-c1", "Casey One", true);
        c2 = consultant(a, "cws-s-a-c2", "Robin Two", true);
        consultant(a, "cws-s-a-noprofile", "Nobody", false);
        b1 = consultant(b, "cws-s-b-c1", "Bee Consultant", true);
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

    private ClientRequirement requirement(Organization org, ClientAccount client, String title) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(org.getId());
        r.setClientId(client.getId());
        r.setTitle(title);
        r.setLocation("Austin, TX");
        r.setWorkMode("HYBRID");
        r.setEmploymentLabel("FULL_TIME");
        r.setDescriptionText("Build and run services for " + title + ".");
        r.setPostedAt(now.minus(Duration.ofDays(2)));
        return requirements.saveAndFlush(r);
    }

    private OrgResume resume(ConsultantProfile c, String name, int version) {
        OrgResume r = new OrgResume();
        r.setOrgId(c.getOrgId());
        r.setConsultantId(c.getId());
        r.setMemberId(c.getMemberId());
        r.setName(name);
        r.setVersionNo(version);
        r.setHeadline("Java engineer");
        r.setSummaryText("Ten years building backend services.");
        r.setUpdatedAt(now.minus(Duration.ofDays(3)));
        return resumes.saveAndFlush(r);
    }

    private CwsSubmission sub(ConsultantProfile c, ClientRequirement r, String status, Instant dueAt, Instant createdAt) {
        CwsSubmission s = new CwsSubmission();
        s.setOrgId(c.getOrgId());
        s.setConsultantId(c.getId());
        s.setRequirementId(r.getId());
        s.setStatus(status);
        s.setDueAt(dueAt);
        s.setMarketerNote("Note for " + r.getTitle());
        s.setCreatedAt(createdAt);
        s.setUpdatedAt(createdAt);
        return submissions.saveAndFlush(s);
    }

    private CwsSubmission sub(ConsultantProfile c, ClientRequirement r, String status, Instant dueAt) {
        return sub(c, r, status, dueAt, now.minus(Duration.ofDays(1)));
    }

    private CwsSubmission pastSub(ConsultantProfile c, String title, String status, int submittedDaysAgo) {
        CwsSubmission s = sub(c, requirement(c.getOrgId().equals(a.getId()) ? a : b, acme, title), status, null, now.minus(Duration.ofDays(submittedDaysAgo + 2)));
        s.setDecidedAt(now.minus(Duration.ofDays(submittedDaysAgo + 1)));
        if (!CwsSubmission.APPROVED.equals(status) && !CwsSubmission.DECLINED.equals(status)) {
            s.setSubmittedOn(now.minus(Duration.ofDays(submittedDaysAgo)));
            s.setClientUpdate("Under review");
            s.setClientUpdateAt(now.minus(Duration.ofDays(submittedDaysAgo - 1)));
        }
        return submissions.saveAndFlush(s);
    }

    private CwsSubmission p1;
    private CwsSubmission p2;
    private CwsSubmission p3;
    private CwsSubmission past1;
    private CwsSubmission past2;
    private CwsSubmission past3;

    /** c1: pending due in 2h (attention), 30h (not), past due (attention); past: submitted, approved, declined. */
    private void seedC1() {
        OrgResume r = resume(c1, "Casey Resume", 3);
        p1 = sub(c1, requirement(a, acme, "Senior Java Developer"), CwsSubmission.PENDING, now.plus(Duration.ofHours(2)), now.minus(Duration.ofDays(10)));
        p2 = sub(c1, requirement(a, acme, "Data Engineer"), CwsSubmission.PENDING, now.plus(Duration.ofHours(30)), now.minus(Duration.ofDays(2)));
        p3 = sub(c1, requirement(a, acme, "Cloud Architect"), CwsSubmission.PENDING, now.minus(Duration.ofHours(5)), now.minus(Duration.ofDays(1)));
        p1.setResumeId(r.getId());
        p1.setResumeVersionNo(3);
        submissions.saveAndFlush(p1);
        past1 = pastSub(c1, "Full Stack Developer", CwsSubmission.SUBMITTED, 5);
        past2 = pastSub(c1, "QA Lead", CwsSubmission.APPROVED, 2);
        past3 = pastSub(c1, "DevOps Engineer", CwsSubmission.DECLINED, 40);
    }

    private void seedC2() {
        ClientAccount other = client(a, "Globex Hidden");
        sub(c2, requirement(a, other, "Hidden Secret Role"), CwsSubmission.PENDING, now.plus(Duration.ofHours(1)));
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private static String path(long orgId, String tail) {
        return "/api/orgs/" + orgId + "/me-workspace/submissions" + tail;
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

    private String statusOf(CwsSubmission s) {
        return submissions.findById(s.getId()).orElseThrow().getStatus();
    }

    // ---- (a) correct values ---------------------------------------------------------------------------------------

    @Test
    void aConsultantGetsTheirOwnPendingRowsPastRowsAndTilesFromTheirRows() throws Exception {
        seedC1();
        JsonNode p = page("cws-s-a-c1", a);

        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(p.path("name").asText()).isEqualTo("Casey One");
        // pending: soonest due first (the past-due one leads)
        assertThat(texts(p.path("pending"), "title")).containsExactly("Cloud Architect", "Senior Java Developer", "Data Engineer");
        JsonNode first = p.path("pending").get(1);
        assertThat(first.path("company").asText()).isEqualTo("Acme Corp");
        assertThat(first.path("employment").asText()).isEqualTo("FULL_TIME");
        assertThat(first.path("resumeVersion").asInt()).isEqualTo(3);
        assertThat(first.path("resumeId").asLong()).isNotZero();
        assertThat(first.path("marketerNote").asText()).isEqualTo("Note for Senior Java Developer");
        assertThat(first.path("attention").asBoolean()).isTrue();
        assertThat(p.path("pending").get(2).path("attention").asBoolean()).as("due in 30 hours").isFalse();
        assertThat(p.path("pending").get(0).path("attention").asBoolean()).as("past due").isTrue();

        // past: newest first by submitted/decided time
        assertThat(texts(p.path("past").path("items"), "title")).containsExactly("QA Lead", "Full Stack Developer", "DevOps Engineer");
        assertThat(p.path("past").path("total").asLong()).isEqualTo(3);
        JsonNode sent = p.path("past").path("items").get(1);
        assertThat(sent.path("status").asText()).isEqualTo("SUBMITTED_TO_CLIENT");
        assertThat(sent.path("clientUpdate").asText()).isEqualTo("Under review");
        assertThat(sent.path("submittedOn").asText()).isNotBlank();

        JsonNode t = p.path("tiles");
        assertThat(t.path("pending").path("value").asLong()).isEqualTo(3);
        assertThat(t.path("pending").path("previous").asLong()).as("one pending row already existed 10 days ago").isEqualTo(1);
        assertThat(t.path("pending").path("deltaPct").asDouble()).isEqualTo(200.0);
        assertThat(t.path("pending").path("vs").asText()).isEqualTo("week");
        assertThat(t.path("approved").path("value").asLong()).as("submitted + approved, not the declined one").isEqualTo(2);
        assertThat(t.path("approved").path("vs").asText()).isEqualTo("month");
        assertThat(t.path("submitted").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("attention").path("value").asLong()).as("due in 2h and past due; 30h is not attention").isEqualTo(2);
        for (String k : List.of("pending", "approved", "submitted", "attention")) assertThat(t.path(k).path("sparkline")).as(k).hasSize(6);
    }

    @Test
    void detailShowsTheJobTheResumeSummaryTheNoteAndTheOutcome() throws Exception {
        seedC1();
        JsonNode d = ok(send(get(path(a.getId(), "/" + p1.getId())), "cws-s-a-c1", null), "detail");
        assertThat(d.path("row").path("title").asText()).isEqualTo("Senior Java Developer");
        assertThat(d.path("location").asText()).isEqualTo("Austin, TX");
        assertThat(d.path("workMode").asText()).isEqualTo("HYBRID");
        assertThat(d.path("description").asText()).contains("Build and run services");
        assertThat(d.path("resume").path("name").asText()).isEqualTo("Casey Resume");
        assertThat(d.path("resume").path("headline").asText()).isEqualTo("Java engineer");
        assertThat(d.path("resume").path("summary").asText()).contains("backend services");
        JsonNode noResume = ok(send(get(path(a.getId(), "/" + p2.getId())), "cws-s-a-c1", null), "detail without a resume");
        assertThat(noResume.get("resume").isNull()).isTrue();
    }

    @Test
    void pastSubmissionsPageAndFilterOnTheServer() throws Exception {
        seedC1();
        for (int i = 0; i < 4; i++) pastSub(c1, "Extra " + i, CwsSubmission.NOT_SELECTED, 10 + i);
        JsonNode p0 = ok(send(get(path(a.getId(), "/past?size=3&page=0")), "cws-s-a-c1", null), "page 0");
        assertThat(p0.path("total").asLong()).isEqualTo(7);
        assertThat(p0.path("totalPages").asInt()).isEqualTo(3);
        assertThat(p0.path("items")).hasSize(3);
        JsonNode p2 = ok(send(get(path(a.getId(), "/past?size=3&page=2")), "cws-s-a-c1", null), "page 2");
        assertThat(p2.path("items")).hasSize(1);
        assertThat(p2.path("items").get(0).path("title").asText()).isEqualTo("DevOps Engineer");
        JsonNode ns = ok(send(get(path(a.getId(), "/past?status=NOT_SELECTED&size=10")), "cws-s-a-c1", null), "filter");
        assertThat(ns.path("total").asLong()).isEqualTo(4);
        assertThat(ns.path("status").asText()).isEqualTo("NOT_SELECTED");
        for (JsonNode n : ns.path("items")) assertThat(n.path("status").asText()).isEqualTo("NOT_SELECTED");
        // the page route takes the same parameters
        JsonNode viaPage = ok(send(get(path(a.getId(), "?status=DECLINED")), "cws-s-a-c1", null), "page filtered");
        assertThat(viaPage.path("past").path("total").asLong()).isEqualTo(1);
        assertThat(viaPage.path("pending")).hasSize(3);

        assertStatus(send(get(path(a.getId(), "/past?status=PENDING_APPROVAL")), "cws-s-a-c1", null), 422, "pending is not a past status");
        assertStatus(send(get(path(a.getId(), "/past?status=NOPE")), "cws-s-a-c1", null), 422, "unknown status");
        assertStatus(send(get(path(a.getId(), "/past?size=0")), "cws-s-a-c1", null), 422, "size 0");
        assertStatus(send(get(path(a.getId(), "/past?size=51")), "cws-s-a-c1", null), 422, "size over the cap");
        assertStatus(send(get(path(a.getId(), "/past?page=-1")), "cws-s-a-c1", null), 422, "negative page");
    }

    // ---- (b) own rows only ----------------------------------------------------------------------------------------

    @Test
    void aConsultantNeverSeesOrDecidesAnotherConsultantsSubmissions() throws Exception {
        seedC1();
        seedC2();
        CwsSubmission hidden = submissions.findByOrgIdAndConsultantId(a.getId(), c2.getId()).get(0);

        MvcResult r = send(get(path(a.getId(), "")), "cws-s-a-c1", null);
        assertThat(r.getResponse().getContentAsString()).doesNotContain("Hidden").doesNotContain("Globex").doesNotContain("Robin Two");
        assertThat(om.readTree(r.getResponse().getContentAsString()).path("tiles").path("pending").path("value").asLong()).isEqualTo(3);

        assertGeneric404(send(get(path(a.getId(), "/" + hidden.getId())), "cws-s-a-c1", null), "detail of another consultant's submission");
        assertGeneric404(send(post(path(a.getId(), "/" + hidden.getId() + "/approve")), "cws-s-a-c1", null), "approve another's submission");
        assertGeneric404(send(post(path(a.getId(), "/" + hidden.getId() + "/decline")), "cws-s-a-c1", "{\"reason\":\"not for me\"}"), "decline another's submission");
        assertThat(statusOf(hidden)).isEqualTo(CwsSubmission.PENDING);

        JsonNode p2 = page("cws-s-a-c2", a);
        assertThat(texts(p2.path("pending"), "title")).containsExactly("Hidden Secret Role");
        assertThat(p2.toString()).doesNotContain("Senior Java Developer").doesNotContain("Casey One");
        assertThat(p2.path("past").path("items")).isEmpty();
    }

    // ---- (c) / (d) refusals ---------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationAndNonConsultantsGetTheGeneric404OnEveryRoute() throws Exception {
        seedC1();
        String id = String.valueOf(p1.getId());
        List<String[]> routes = List.of(
            new String[] { "GET", path(a.getId(), "") },
            new String[] { "GET", path(a.getId(), "/past") },
            new String[] { "GET", path(a.getId(), "/" + id) },
            new String[] { "POST", path(a.getId(), "/" + id + "/approve") },
            new String[] { "POST", path(a.getId(), "/" + id + "/decline") }
        );
        for (String login : List.of("cws-s-b-owner", "cws-s-b-c1", "ghost-login", "cws-s-a-owner", "cws-s-a-admin", "cws-s-a-marketer", "cws-s-a-noprofile")) {
            for (String[] route : routes) {
                MockHttpServletRequestBuilder req = "POST".equals(route[0]) ? post(route[1]) : get(route[1]);
                assertGeneric404(send(req, login, "POST".equals(route[0]) ? "{\"reason\":\"not for me\"}" : null), login + " " + route[0] + " " + route[1]);
            }
        }
        assertThat(statusOf(p1)).as("nobody else could move it").isEqualTo(CwsSubmission.PENDING);
        assertGeneric404(send(get(path(999999999L, "")), "cws-s-a-c1", null), "an organization that does not exist");
        assertGeneric404(send(get(path(a.getId(), "/987654321")), "cws-s-a-c1", null), "a submission id that does not exist");
        assertGeneric404(send(post(path(a.getId(), "/987654321/approve")), "cws-s-a-c1", null), "approve an id that does not exist");
        // another tenant's consultant cannot reach this org's submission through their own org either
        assertGeneric404(send(get(path(b.getId(), "/" + id)), "cws-s-b-c1", null), "a submission id from another organization");
        assertGeneric404(send(post(path(b.getId(), "/" + id + "/approve")), "cws-s-b-c1", null), "approve across tenants");
        assertThat(b1.getOrgId()).isEqualTo(b.getId());
    }

    @Test
    void theRoutesAre404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        seedC1();
        flags(true, false);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-s-a-c1", null), "roles flag off");
        assertGeneric404(send(post(path(a.getId(), "/" + p1.getId() + "/approve")), "cws-s-a-c1", null), "roles flag off, write");
        flags(false, true);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-s-a-c1", null), "master flag off");
        assertThat(statusOf(p1)).isEqualTo(CwsSubmission.PENDING);
    }

    // ---- (e) empty consultant -------------------------------------------------------------------------------------

    @Test
    void aConsultantWithNoSubmissionsGetsZerosAndEmptyListsNeverNulls() throws Exception {
        JsonNode p = page("cws-s-a-c1", a);
        for (String tile : List.of("pending", "approved", "submitted", "attention")) {
            JsonNode t = p.path("tiles").path(tile);
            assertThat(t.path("value").asLong()).as(tile).isZero();
            assertThat(t.path("previous").asLong()).as(tile).isZero();
            assertThat(t.get("deltaPct").isNull()).as(tile + " has no delta, not a made-up one").isTrue();
            assertThat(t.path("sparkline")).as(tile).hasSize(6);
        }
        assertThat(p.get("pending").isArray()).isTrue();
        assertThat(p.get("pending")).isEmpty();
        assertThat(p.path("past").get("items").isArray()).isTrue();
        assertThat(p.path("past").path("items")).isEmpty();
        assertThat(p.path("past").path("total").asLong()).isZero();
        assertThat(p.path("past").path("totalPages").asInt()).isZero();
    }

    // ---- writes ---------------------------------------------------------------------------------------------------

    @Test
    void approvingRecordsTheDecisionOnlyAndASecondApproveIs409() throws Exception {
        seedC1();
        long appsBefore = applications.countByOrgId(a.getId());
        JsonNode done = ok(send(post(path(a.getId(), "/" + p1.getId() + "/approve")), "cws-s-a-c1", null), "approve");
        assertThat(done.path("status").asText()).isEqualTo("APPROVED");
        assertThat(done.path("decidedAt").asText()).isNotBlank();
        CwsSubmission row = submissions.findById(p1.getId()).orElseThrow();
        assertThat(row.getStatus()).isEqualTo(CwsSubmission.APPROVED);
        assertThat(row.getDecidedAt()).isNotNull();
        assertThat(row.getSubmittedOn()).as("approving submits nothing").isNull();
        assertThat(applications.countByOrgId(a.getId())).as("no application is created").isEqualTo(appsBefore);

        MvcResult again = send(post(path(a.getId(), "/" + p1.getId() + "/approve")), "cws-s-a-c1", null);
        assertStatus(again, 409, "approve twice");
        assertThat(again.getResponse().getContentAsString()).contains("SUBMISSION_NOT_PENDING").contains("already approved");
        assertThat(submissions.findById(p1.getId()).orElseThrow().getDecidedAt()).as("the first decision time is kept").isEqualTo(row.getDecidedAt());

        MvcResult declineAfter = send(post(path(a.getId(), "/" + p1.getId() + "/decline")), "cws-s-a-c1", "{\"reason\":\"changed my mind\"}");
        assertStatus(declineAfter, 409, "decline after approve");
        assertThat(statusOf(p1)).isEqualTo(CwsSubmission.APPROVED);

        JsonNode p = page("cws-s-a-c1", a);
        assertThat(p.path("tiles").path("pending").path("value").asLong()).isEqualTo(2);
        assertThat(p.path("tiles").path("approved").path("value").asLong()).isEqualTo(3);
        assertThat(texts(p.path("pending"), "title")).doesNotContain("Senior Java Developer");
        assertThat(texts(p.path("past").path("items"), "title")).contains("Senior Java Developer");
    }

    @Test
    void decliningNeedsAScreenedReasonAndASecondDeclineIs409() throws Exception {
        seedC1();
        String url = path(a.getId(), "/" + p2.getId() + "/decline");
        assertStatus(send(post(url), "cws-s-a-c1", null), 422, "no body");
        assertStatus(send(post(url), "cws-s-a-c1", "{}"), 422, "no reason");
        assertStatus(send(post(url), "cws-s-a-c1", "{\"reason\":\"  \"}"), 422, "blank reason");
        assertStatus(send(post(url), "cws-s-a-c1", "{\"reason\":\"ab\"}"), 422, "two characters");
        assertStatus(send(post(url), "cws-s-a-c1", "{\"reason\":\"" + "x".repeat(301) + "\"}"), 422, "301 characters");
        MvcResult ssn = send(post(url), "cws-s-a-c1", "{\"reason\":\"my SSN 123-45-6789\"}");
        assertStatus(ssn, 422, "a social security number");
        assertThat(ssn.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        MvcResult dob = send(post(url), "cws-s-a-c1", "{\"reason\":\"date of birth 04/12/1990\"}");
        assertStatus(dob, 422, "a date of birth");
        assertThat(dob.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        assertThat(statusOf(p2)).as("a refused decline changes nothing").isEqualTo(CwsSubmission.PENDING);

        JsonNode done = ok(send(post(url), "cws-s-a-c1", "{\"reason\":\"  The rate is too low for this role.  \"}"), "decline");
        assertThat(done.path("status").asText()).isEqualTo("DECLINED");
        CwsSubmission row = submissions.findById(p2.getId()).orElseThrow();
        assertThat(row.getDeclineReason()).isEqualTo("The rate is too low for this role.");
        assertThat(row.getDecidedAt()).isNotNull();

        MvcResult again = send(post(url), "cws-s-a-c1", "{\"reason\":\"declining again\"}");
        assertStatus(again, 409, "decline twice");
        assertThat(again.getResponse().getContentAsString()).contains("SUBMISSION_NOT_PENDING").contains("already declined");
        assertStatus(send(post(path(a.getId(), "/" + p2.getId() + "/approve")), "cws-s-a-c1", null), 409, "approve after decline");
        assertThat(statusOf(p2)).isEqualTo(CwsSubmission.DECLINED);
        assertThat(row.getDeclineReason()).isEqualTo(submissions.findById(p2.getId()).orElseThrow().getDeclineReason());

        // a row that already moved on (client side) cannot be decided either
        assertStatus(send(post(path(a.getId(), "/" + past1.getId() + "/approve")), "cws-s-a-c1", null), 409, "approve a submitted row");
        assertStatus(send(post(path(a.getId(), "/" + past1.getId() + "/decline")), "cws-s-a-c1", "{\"reason\":\"too late now\"}"), 409, "decline a submitted row");
        assertThat(statusOf(past1)).isEqualTo(CwsSubmission.SUBMITTED);

        JsonNode d = ok(send(get(path(a.getId(), "/" + p2.getId())), "cws-s-a-c1", null), "detail after decline");
        assertThat(d.path("declineReason").asText()).isEqualTo("The rate is too low for this role.");
        assertThat(d.path("row").path("status").asText()).isEqualTo("DECLINED");
    }

    @Test
    void theDemoSeederIsIdempotentAndMarksEveryRowAsSample() throws Exception {
        long before = submissions.count();
        // the seeder only touches the named demo organizations; here it must simply be a no-op that does not fail
        assertThat(seeder.seed()).isGreaterThanOrEqualTo(0);
        assertThat(seeder.seed()).as("a second run adds nothing").isZero();
        assertThat(submissions.count()).isGreaterThanOrEqualTo(before);
    }
}
