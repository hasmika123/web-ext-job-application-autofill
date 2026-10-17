package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.domain.ent.mkt.MktResumeEvent;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeDocVersionRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.repository.ent.mkt.MktResumeEventRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.OrgResumeExperienceRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.resume.ResumeActAs;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Resume Builder inside the organization workspaces (Track B2, docs/HANDOFF-ENT-RESUME-BUILDER-IN-ORG.md) through the real chain on real rows:
 * a consultant creates a resume in the builder and it appears in their list and on the assigned marketer's board with no manual linking; the
 * organization license caps it (personal behaviour untouched); a marketer prepares a resume for an ASSIGNED consultant in act-for mode, it lands
 * PENDING under the consultant's account with the marketer as author, and only the consultant approves it; strangers get the generic 404; a
 * parsed upload carrying a value the product never collects is refused (and a clean one is projected into the directory).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgResumeBuilderIT {

    private static final String WHO = "org-resume-builder-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgRoleRepository roleRows;
    @Autowired private OrgMemberRoleRepository memberRoles;
    @Autowired private OrgRoleService roleService;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private OrgSettingRepository orgSettings;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private TenantResolver resolver;
    @Autowired private ConsultantProfileRepository profiles;
    @Autowired private MarketerAssignmentRepository assignments;
    @Autowired private OrgResumeRepository orgResumes;
    @Autowired private OrgResumeExperienceRepository orgExperience;
    @Autowired private MktResumeEventRepository events;
    @Autowired private ResumeRepository resumes;
    @Autowired private ResumeDocVersionRepository versions;
    @Autowired private ResumeDocRepository docRows;
    @Autowired private com.dossier.api.repository.ResumeDocRepository resumeDocs;
    @Autowired private com.dossier.api.repository.ResumeAccessRepository accessRows;
    @Autowired private com.dossier.api.repository.org.OrgAuditEventRepository audit;
    @Autowired private com.dossier.api.service.storage.FileStorage storage;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private String host;
    private OrgMember marketerSeat;
    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ConsultantProfile c0;
    private ConsultantProfile cb;

    private static final String STRUCTURED =
        "{\"summary\":\"Backend engineer.\",\"skills\":[\"Java\",\"SQL\"],\"experience\":[" +
        "{\"company\":\"Acme\",\"title\":\"Engineer\",\"location\":\"NYC\",\"startDate\":\"Jan 2020\",\"endDate\":\"Present\",\"current\":true,\"bullets\":[\"Built things\"]}," +
        "{\"company\":\"Globex\",\"title\":\"Intern\",\"location\":\"\",\"startDate\":\"2018\",\"endDate\":\"2019\",\"current\":false,\"bullets\":[\"Learned\"]}]," +
        "\"education\":[{\"school\":\"MIT\",\"degree\":\"BS\",\"field\":\"CS\",\"startDate\":\"2014\",\"endDate\":\"2018\",\"gpa\":\"\",\"location\":\"\"}],\"languages\":[],\"projects\":[]}";

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("orb-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("orb-b-" + n, OrgStatus.ACTIVE);
        a.setSubdomain("orb-" + n);
        a.setSubdomainEnabled(true);
        orgs.saveAndFlush(a);
        host = "orb-" + n + ".kiwiply.com";
        flags();
        staff(a, "orb-a-owner", OrgRole.OWNER);
        marketerSeat = staff(a, "orb-a-marketer", OrgRole.MARKETER);
        OrgMember other = staff(a, "orb-a-marketer2", OrgRole.MARKETER);
        staff(b, "orb-b-owner", OrgRole.OWNER);
        named("orb-a-marketer", "Sarah", "Chen");
        c1 = consultant(a, "orb-a-c1", "Casey One", true);
        named("orb-a-c1", "Casey", "One");
        c2 = consultant(a, "orb-a-c2", "Robin Two", true);
        c0 = consultant(a, "orb-a-c0", "Seatless Person", true);
        cb = consultant(b, "orb-b-c1", "Bee Consultant", true);
        c0.setMemberId(null); // a consultant with no sign-in
        profiles.saveAndFlush(c0);
        assign(c1, marketerSeat);
        assign(c0, marketerSeat);
        assign(c2, other);
    }

    @AfterEach
    void clean() {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        cache.invalidate();
        resolver.invalidate();
    }

    private void flags() {
        for (String key : List.of(EnterpriseSettingKeys.FLAG_ENTERPRISE, EnterpriseSettingKeys.FLAG_DOMAINS, EnterpriseSettingKeys.FLAG_ROLES, EnterpriseSettingKeys.FLAG_MARKETING)) {
            settingRows.save(new AppSetting(key, "{\"on\":true}", WHO, Instant.now()));
        }
        cache.invalidate();
        resolver.invalidate();
    }

    // ---- fixtures -------------------------------------------------------------------------------------------------

    private OrgMember staff(Organization org, String login, OrgRole role) {
        OrgMember m = fx.active(org, login, role);
        m.setJoinedAt(now.minus(Duration.ofDays(100)));
        members.saveAndFlush(m);
        roleService.syncFromLegacy(m);
        return m;
    }

    /** The separate-accounts model (decision O4): the consultant's sign-in is an ENTERPRISE account of the organization (org_id set), not a personal one. */
    private void enterpriseAccountOf(Organization org, String login) {
        User u = users.findOneByLogin(login).orElseThrow();
        u.setOrgId(org.getId());
        users.saveAndFlush(u);
    }

    private void named(String login, String first, String last) {
        User u = users.findOneByLogin(login).orElseThrow();
        u.setFirstName(first);
        u.setLastName(last);
        users.saveAndFlush(u);
    }

    private ConsultantProfile consultant(Organization org, String login, String name, boolean withProfile) {
        OrgMember m = fx.seat(org, login, LegacyRoleMirror.toEnum(RoleTemplates.CONSULTANT).orElse(OrgRole.MEMBER), OrgMemberStatus.ACTIVE);
        enterpriseAccountOf(org, login);
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
        ConsultantProfile p = new ConsultantProfile();
        p.setOrgId(org.getId());
        p.setMemberId(m.getId());
        p.setDisplayName(name);
        p.setEmail(login + "@example.org");
        p.setJobTitle("Senior Engineer");
        return profiles.saveAndFlush(p);
    }

    private void assign(ConsultantProfile c, OrgMember marketer) {
        MarketerAssignment m = new MarketerAssignment();
        m.setOrgId(c.getOrgId());
        m.setConsultantId(c.getId());
        m.setMarketerMemberId(marketer.getId());
        m.setStatus("ACTIVE");
        assignments.saveAndFlush(m);
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private MvcResult send(String login, MockHttpServletRequestBuilder req) throws Exception {
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private String me(Organization org) {
        return "/api/orgs/" + org.getId() + "/me-workspace/resumes";
    }

    private String mkt(Organization org) {
        return "/api/orgs/" + org.getId() + "/mkt/resumes";
    }

    private JsonNode ok(MvcResult r, int status) throws Exception {
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(status);
        return om.readTree(r.getResponse().getContentAsString());
    }

    private JsonNode consultantCreates(String login, String body) throws Exception {
        return ok(send(login, post(me(a) + "/built").content(body)), 201);
    }

    private JsonNode page(String login) throws Exception {
        return ok(send(login, get(me(a))), 200);
    }

    private JsonNode board(String login) throws Exception {
        return ok(send(login, get(mkt(a) + "?size=100")), 200);
    }

    private static boolean hasRow(JsonNode items, long orgResumeId) {
        for (JsonNode i : items) if (i.path("id").asLong() == orgResumeId) return true;
        return false;
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission");
    }

    private User userOf(String login) {
        return users.findOneByLogin(login).orElseThrow();
    }

    // ---- the consultant's own flow ---------------------------------------------------------------------------------

    @Test
    void aConsultantCreatesAResumeAndItAppearsInTheirListAndOnTheAssignedMarketersBoardWithNoLinking() throws Exception {
        JsonNode created = consultantCreates("orb-a-c1", "{\"label\":\"Java Backend\",\"target\":\"Backend Engineer\",\"source\":\"scratch\"}");
        long orgResumeId = created.path("orgResumeId").asLong();
        long resumeId = created.path("resumeId").asLong();

        JsonNode row = created.path("row");
        assertThat(row.path("title").asText()).isEqualTo("Java Backend");
        assertThat(row.path("targetRole").asText()).isEqualTo("Backend Engineer");
        assertThat(row.path("approvalStatus").asText()).as("the consultant attests their own words").isEqualTo("APPROVED");
        assertThat(row.path("resumeId").asLong()).isEqualTo(resumeId);
        assertThat(row.path("awaitingMyApproval").asBoolean()).isFalse();

        // it is the consultant's own resume (their account owns it) and the editor's document routes work for them
        Resume entity = resumes.findById(resumeId).orElseThrow();
        assertThat(entity.getUser().getLogin()).isEqualTo("orb-a-c1");
        assertThat(entity.getCreatedByLogin()).isEqualTo("orb-a-c1");
        assertThat(ok(send("orb-a-c1", get("/api/profile/resumes/" + resumeId + "/doc")), 200).path("label").asText()).isEqualTo("Java Backend");
        // and nobody else's: another consultant, the marketer and a member of another organization all get the plain 404
        assertThat(send("orb-a-c2", get("/api/profile/resumes/" + resumeId + "/doc")).getResponse().getStatus()).isEqualTo(404);
        assertThat(send("orb-a-marketer", get("/api/profile/resumes/" + resumeId + "/doc")).getResponse().getStatus()).isEqualTo(404);

        // the consultant's page and the assigned marketer's board list it; the marketer who is not assigned to Casey never sees it
        assertThat(hasRow(page("orb-a-c1").path("resumes"), orgResumeId)).isTrue();
        assertThat(page("orb-a-c1").path("tiles").path("totalResumes").path("value").asLong()).isEqualTo(1);
        assertThat(hasRow(board("orb-a-marketer").path("items"), orgResumeId)).isTrue();
        assertThat(hasRow(board("orb-a-marketer2").path("items"), orgResumeId)).isFalse();
        assertThat(hasRow(board("orb-a-owner").path("items"), orgResumeId)).isTrue();
        // ... and the change log says the consultant added it
        MktResumeEvent first = events.forResumes(a.getId(), List.of(orgResumeId)).get(0);
        assertThat(first.getKind()).isEqualTo(MktResumeEvent.CREATED);
        assertThat(first.getActorMemberId()).isEqualTo(c1.getMemberId());
    }

    @Test
    void aParsedUploadIsProjectedIntoTheDirectoryAndEditsAndRenamesFollowTheBuilder() throws Exception {
        String body = "{\"label\":\"Ada CV\",\"source\":{\"kind\":\"upload\",\"fileName\":\"Ada CV.pdf\",\"structured\":" + STRUCTURED + "}}";
        JsonNode created = consultantCreates("orb-a-c1", body);
        long orgResumeId = created.path("orgResumeId").asLong();
        long resumeId = created.path("resumeId").asLong();

        OrgResume row = orgResumes.findByOrgIdAndId(a.getId(), orgResumeId).orElseThrow();
        assertThat(row.getSummaryText()).isEqualTo("Backend engineer.");
        var exp = orgExperience.findByOrgIdAndResumeIdOrderBySortOrderAsc(a.getId(), orgResumeId);
        assertThat(exp).extracting(x -> x.getEmployer()).containsExactly("Acme", "Globex");
        assertThat(exp).extracting(x -> x.getStartYear()).containsExactly(2020, 2018);
        assertThat(exp.get(0).getEndYear()).as("a current role has no end year").isNull();
        assertThat(exp.get(1).getEndYear()).isEqualTo(2019);

        // rename through the builder's own route: the directory row follows
        assertThat(send("orb-a-c1", org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/profile/resumes/" + resumeId + "/meta").content("{\"name\":\"Ada, renamed\"}")).getResponse().getStatus()).isEqualTo(200);
        assertThat(orgResumes.findByOrgIdAndId(a.getId(), orgResumeId).orElseThrow().getName()).isEqualTo("Ada, renamed");

        // edit the document (the editor's autosave): headline and summary follow, one "updated" line per editing session
        MvcResult doc = send("orb-a-c1", get("/api/profile/resumes/" + resumeId + "/doc"));
        String etag = doc.getResponse().getHeader("ETag");
        ObjectNode full = (ObjectNode) om.readTree(doc.getResponse().getContentAsString());
        ObjectNode docNode = (ObjectNode) full.get("doc");
        ((ObjectNode) docNode.get("basics")).put("headline", "Staff backend engineer");
        ObjectNode save = om.createObjectNode();
        save.set("doc", docNode);
        MvcResult saved = send("orb-a-c1", put("/api/profile/resumes/" + resumeId + "/doc").header("If-Match", etag).content(om.writeValueAsString(save)));
        assertThat(saved.getResponse().getStatus()).as(saved.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(orgResumes.findByOrgIdAndId(a.getId(), orgResumeId).orElseThrow().getHeadline()).isEqualTo("Staff backend engineer");
        assertThat(orgResumes.findByOrgIdAndId(a.getId(), orgResumeId).orElseThrow().getApprovalStatus()).as("the consultant's own edits never change approval").isEqualTo("APPROVED");
        // X7.4: ... and the pin moves with the consultant's own words, so the approved version is never reported stale
        OrgResume pinned = orgResumes.findByOrgIdAndId(a.getId(), orgResumeId).orElseThrow();
        assertThat(pinned.getApprovedContentHash()).isNotNull().isEqualTo(resumeDocs.findContentHashByResumeId(resumeId).orElseThrow());
        assertThat(pinned.getApprovedVersionNo()).isEqualTo(pinned.getVersionNo());
        long updates = events.forResumes(a.getId(), List.of(orgResumeId)).stream().filter(e -> MktResumeEvent.UPDATED.equals(e.getKind())).count();
        assertThat(updates).isLessThanOrEqualTo(1);
    }

    @Test
    void aNeverCollectedValueInAnUploadIsRefusedAndNothingIsCreatedOrLinked() throws Exception {
        String dirty = STRUCTURED.replace("\"Learned\"", "\"My SSN is 078-05-1120 on file\"");
        long before = resumes.count();
        long rowsBefore = orgResumes.countByOrgIdAndConsultantId(a.getId(), c1.getId());
        MvcResult r = send("orb-a-c1", post(me(a) + "/built").content("{\"source\":{\"kind\":\"upload\",\"fileName\":\"x.pdf\",\"structured\":" + dirty + "}}"));
        JsonNode body = ok(r, 422);
        assertThat(body.path("code").asText()).isEqualTo("SENSITIVE_CONTENT");
        assertThat(body.path("path").asText()).startsWith("structured.experience[1]");
        assertThat(resumes.count()).isEqualTo(before);
        assertThat(orgResumes.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isEqualTo(rowsBefore);
        // the same through the marketer's act-for create
        MvcResult m = send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"source\":{\"kind\":\"upload\",\"fileName\":\"x.pdf\",\"structured\":" + dirty + "}}"));
        assertThat(ok(m, 422).path("code").asText()).isEqualTo("SENSITIVE_CONTENT");
        assertThat(resumes.count()).isEqualTo(before);
    }

    // ---- the organization license's cap ------------------------------------------------------------------------------

    @Test
    void theOrganizationLicenseCapsAConsultantAndPersonalCapsDoNotApplyThere() throws Exception {
        OrgSetting cap = new OrgSetting();
        cap.setOrgId(a.getId());
        cap.setSettingKey(EnterpriseSettingKeys.ORG_LICENSE_RESUMES_MAX);
        cap.setValueJson("5");
        cap.setUpdatedBy(WHO);
        orgSettings.saveAndFlush(cap);

        // five resumes fit although the personal Free cap is three: the license decides inside the organization
        for (int i = 0; i < 5; i++) consultantCreates("orb-a-c1", "{\"label\":\"Resume " + i + "\",\"source\":\"scratch\"}");
        MvcResult over = send("orb-a-c1", post(me(a) + "/built").content("{\"label\":\"One too many\",\"source\":\"scratch\"}"));
        JsonNode body = ok(over, 402);
        assertThat(body.path("code").asText()).isEqualTo("RESUME_LIMIT");
        assertThat(body.path("plan").asText()).isEqualTo("ORGANIZATION");
        assertThat(body.path("limit").asInt()).isEqualTo(5);
        assertThat(page("orb-a-c1").path("resumes")).hasSize(5);
        // another consultant of the organization has a cap of their own
        consultantCreates("orb-a-c2", "{\"label\":\"Robin's\",\"source\":\"scratch\"}");
    }

    @Test
    void aPersonalRequestIsNeverCappedOrLinkedByTheOrganization() throws Exception {
        OrgSetting cap = new OrgSetting();
        cap.setOrgId(a.getId());
        cap.setSettingKey(EnterpriseSettingKeys.ORG_LICENSE_RESUMES_MAX);
        cap.setValueJson("1");
        cap.setUpdatedBy(WHO);
        orgSettings.saveAndFlush(cap);
        consultantCreates("orb-a-c1", "{\"label\":\"In the organization\",\"source\":\"scratch\"}");
        // the same account on the personal builder route (no organization host): not capped by the organization's 1, not linked into the directory
        MvcResult personal = send("orb-a-c1", post("/api/profile/resumes/built").content("{\"label\":\"Personal one\"}"));
        JsonNode body = ok(personal, 201);
        assertThat(orgResumes.findFirstByOrgIdAndResumeIdOrderByIdAsc(a.getId(), body.path("resume").path("id").asLong())).isEmpty();
    }

    // ---- the marketer prepares a resume for an assigned consultant (act-for) --------------------------------------------

    @Test
    void aMarketerPreparesAResumeForAnAssignedConsultantItLandsPendingAndOnlyTheConsultantApprovesIt() throws Exception {
        JsonNode picker = ok(send("orb-a-marketer", get(mkt(a) + "/consultants")), 200);
        assertThat(picker).extracting(n -> n.path("name").asText()).containsExactlyInAnyOrder("Casey One", "Seatless Person");
        for (JsonNode c : picker) assertThat(c.path("hasAccount").asBoolean()).isEqualTo(!"Seatless Person".equals(c.path("name").asText()));

        JsonNode created = ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"label\":\"Prepared for Casey\",\"source\":\"scratch\"}")), 201);
        long orgResumeId = created.path("orgResumeId").asLong();
        long resumeId = created.path("resumeId").asLong();
        assertThat(created.path("detail").path("row").path("approval").asText()).isEqualTo("PENDING");

        // it is the CONSULTANT's resume; the marketer is the author on every record
        Resume entity = resumes.findById(resumeId).orElseThrow();
        assertThat(entity.getUser().getLogin()).isEqualTo("orb-a-c1");
        assertThat(entity.getCreatedByLogin()).isEqualTo("orb-a-marketer");
        assertThat(entity.getUpdatedByLogin()).isEqualTo("orb-a-marketer");
        assertThat(versions.findByResumeIdAndUserIdOrderByVersionNoDesc(resumeId, userOf("orb-a-c1").getId())).isNotEmpty().allSatisfy(v -> assertThat(v.getCreatedByLogin()).isEqualTo("orb-a-marketer"));
        OrgResume row = orgResumes.findByOrgIdAndId(a.getId(), orgResumeId).orElseThrow();
        assertThat(row.getKind()).isEqualTo("ORG_MANAGED");
        assertThat(row.getApprovalStatus()).isEqualTo("PENDING");
        assertThat(row.getConsultantId()).isEqualTo(c1.getId());
        List<MktResumeEvent> log = events.forResumes(a.getId(), List.of(orgResumeId));
        assertThat(log).extracting(MktResumeEvent::getKind).containsExactly(MktResumeEvent.CREATED, MktResumeEvent.APPROVAL_REQUESTED);
        assertThat(log).allSatisfy(e -> assertThat(e.getActorMemberId()).isEqualTo(marketerSeat.getId()));
        // the marketer can not open the consultant's document through the personal routes (no share link, no impersonation outside the one create)
        assertThat(send("orb-a-marketer", get("/api/profile/resumes/" + resumeId + "/doc")).getResponse().getStatus()).isEqualTo(404);

        // the consultant sees it waiting for them
        JsonNode mine = page("orb-a-c1");
        JsonNode mineRow = null;
        for (JsonNode r : mine.path("resumes")) if (r.path("id").asLong() == orgResumeId) mineRow = r;
        assertThat(mineRow).isNotNull();
        assertThat(mineRow.path("awaitingMyApproval").asBoolean()).isTrue();
        // ... and it can not be made primary until approved
        assertThat(send("orb-a-c1", post(me(a) + "/" + orgResumeId + "/primary")).getResponse().getStatus()).isEqualTo(422);

        // the org owner (who holds resumes.approve_request) can not approve it for the consultant, and nobody else can either
        MvcResult owner = send("orb-a-owner", post(mkt(a) + "/" + orgResumeId + "/approve"));
        assertThat(ok(owner, 409).path("code").asText()).isEqualTo("CONSULTANT_APPROVAL_REQUIRED");
        assertGeneric404(send("orb-a-c2", post(me(a) + "/" + orgResumeId + "/approve")), "another consultant approving");
        assertGeneric404(send("orb-a-marketer", post(me(a) + "/" + orgResumeId + "/approve")), "the marketer approving");
        assertThat(orgResumes.findByOrgIdAndId(a.getId(), orgResumeId).orElseThrow().getApprovalStatus()).isEqualTo("PENDING");

        // the consultant approves: approved, approved by their seat, one APPROVED line, and it can become primary
        JsonNode approved = ok(approve("orb-a-c1", orgResumeId), 200);
        assertThat(approved.path("approvalStatus").asText()).isEqualTo("APPROVED");
        assertThat(approved.path("awaitingMyApproval").asBoolean()).isFalse();
        OrgResume after = orgResumes.findByOrgIdAndId(a.getId(), orgResumeId).orElseThrow();
        assertThat(after.getApprovedByMemberId()).isEqualTo(c1.getMemberId());
        assertThat(after.getApprovedAt()).isNotNull();
        assertThat(events.forResumes(a.getId(), List.of(orgResumeId))).extracting(MktResumeEvent::getKind).contains(MktResumeEvent.APPROVED);
        assertThat(ok(send("orb-a-c1", post(me(a) + "/" + orgResumeId + "/approve")), 409).path("code").asText()).isEqualTo("NOT_PENDING");
        assertThat(send("orb-a-c1", post(me(a) + "/" + orgResumeId + "/primary")).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void theConsultantCanSendAMarketersResumeBackAndTheBoardReadsNeedsUpdate() throws Exception {
        JsonNode created = ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"source\":\"scratch\"}")), 201);
        long orgResumeId = created.path("orgResumeId").asLong();

        JsonNode back = ok(send("orb-a-c1", post(me(a) + "/" + orgResumeId + "/request-changes").content(reviewed("orb-a-c1", orgResumeId, "Please add my 2019 role"))), 200);
        assertThat(back.path("approvalStatus").asText()).isEqualTo("REJECTED");
        assertThat(back.path("awaitingMyApproval").asBoolean()).isFalse();
        JsonNode detail = ok(send("orb-a-marketer", get(mkt(a) + "/" + orgResumeId)), 200);
        assertThat(detail.path("row").path("approval").asText()).isEqualTo("NEEDS_UPDATE");
        assertThat(detail.path("history").get(0).path("kind").asText()).isEqualTo(MktResumeEvent.MARKED_FOR_UPDATE);
        // a note that carries a never-collected value is refused like every free text
        JsonNode second = ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"source\":\"scratch\"}")), 201);
        assertThat(send("orb-a-c1", post(me(a) + "/" + second.path("orgResumeId").asLong() + "/request-changes").content(reviewed("orb-a-c1", second.path("orgResumeId").asLong(), "my SSN is 078-05-1120"))).getResponse().getStatus()).isEqualTo(422);
    }

    @Test
    void theMarketerGateIsTheGenericNotFoundForStrangersAndAnAccountlessConsultantIsAConflict() throws Exception {
        long before = resumes.count();
        String body = "{\"label\":\"Nope\",\"source\":\"scratch\"}";
        // a marketer who is not assigned to Casey, an assigned marketer naming a consultant of another organization or an unknown id, a consultant, a member of another organization
        assertGeneric404(send("orb-a-marketer2", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content(body)), "unassigned marketer");
        assertGeneric404(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c2.getId() + "/built").content(body)), "consultant assigned to another marketer");
        assertGeneric404(send("orb-a-marketer", post(mkt(a) + "/consultants/" + cb.getId() + "/built").content(body)), "another organization's consultant");
        assertGeneric404(send("orb-a-marketer", post(mkt(a) + "/consultants/999999999/built").content(body)), "unknown consultant");
        assertGeneric404(send("orb-a-c1", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content(body)), "a consultant");
        assertGeneric404(send("orb-b-owner", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content(body)), "another organization's owner");
        assertGeneric404(send("orb-a-marketer2", get(mkt(a) + "/consultants/" + c1.getId() + "/sources")), "sources of an unassigned consultant");
        assertThat(resumes.count()).isEqualTo(before);
        // assigned but without a sign-in: nobody could approve the result
        assertThat(ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c0.getId() + "/built").content(body)), 409).path("code").asText()).isEqualTo("CONSULTANT_HAS_NO_ACCOUNT");
        assertThat(resumes.count()).isEqualTo(before);
    }

    @Test
    void theMarketerCreateUsesTheConsultantsCapAndTheirProfileAndResumesAsSources() throws Exception {
        consultantCreates("orb-a-c1", "{\"label\":\"Casey's own\",\"source\":\"scratch\"}");
        JsonNode sources = ok(send("orb-a-marketer", get(mkt(a) + "/consultants/" + c1.getId() + "/sources")), 200);
        assertThat(sources.path("name").asText()).isEqualTo("Casey One");
        assertThat(sources.path("resumes")).hasSize(1);
        assertThat(sources.path("resumes").get(0).path("name").asText()).isEqualTo("Casey's own");
        long theirs = sources.path("resumes").get(0).path("id").asLong();

        // copy of the consultant's own resume works; a copy of anyone else's does not
        ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"source\":{\"kind\":\"copy\",\"fromResumeId\":" + theirs + "}}")), 201);
        JsonNode otherResume = consultantCreates("orb-a-c2", "{\"label\":\"Robin's\",\"source\":\"scratch\"}");
        MvcResult stolen = send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"source\":{\"kind\":\"copy\",\"fromResumeId\":" + otherResume.path("resumeId").asLong() + "}}"));
        assertThat(stolen.getResponse().getStatus()).as("a resume that is not the consultant's").isEqualTo(404);

        // the cap is the consultant's, counted on their account
        OrgSetting cap = new OrgSetting();
        cap.setOrgId(a.getId());
        cap.setSettingKey(EnterpriseSettingKeys.ORG_LICENSE_RESUMES_MAX);
        cap.setValueJson("2");
        cap.setUpdatedBy(WHO);
        orgSettings.saveAndFlush(cap);
        MvcResult over = send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"source\":\"scratch\"}"));
        assertThat(ok(over, 402).path("code").asText()).isEqualTo("RESUME_LIMIT");
    }

    @Test
    void aMarketersMetadataEditOfABuilderResumeIsRefusedItIsEditedInTheBuilder() throws Exception {
        JsonNode created = consultantCreates("orb-a-c1", "{\"label\":\"Casey's own\",\"source\":\"scratch\"}");
        MvcResult edit = send("orb-a-marketer", org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(mkt(a) + "/" + created.path("orgResumeId").asLong()).content("{\"headline\":\"x\"}"));
        assertThat(ok(edit, 409).path("code").asText()).isEqualTo("EDIT_IN_BUILDER");
    }

    // ---- the one builder's capabilities, enforced by the API as well as shown ------------------------------------------

    private MvcResult onHost(String login, MockHttpServletRequestBuilder req) throws Exception {
        return send(login, req.header("X-Kiwiply-Host", host));
    }

    private MvcResult actFor(String login, long orgResumeId, MockHttpServletRequestBuilder req) throws Exception {
        return actForWithTid(login, a.getId(), orgResumeId, req);
    }

    /** An act-for request whose token carries {@code tid} (null = a token with no tenant), the way a host-only session does. */
    private MvcResult actForWithTid(String login, Long tid, long orgResumeId, MockHttpServletRequestBuilder req) throws Exception {
        return mockMvc
            .perform(
                req
                    .with(jwt().jwt(j -> {
                        j.subject(login);
                        if (tid != null) j.claim("tid", tid);
                    }).authorities(new SimpleGrantedAuthority("ROLE_USER")))
                    .header("X-Kiwiply-Host", host)
                    .header("X-Kiwiply-Act-For", String.valueOf(orgResumeId))
                    .contentType(MediaType.APPLICATION_JSON)
            )
            .andReturn();
    }

    /** The decision body the consultant's page sends: the version they were shown (versionNo and contentHash of their row). */
    private String reviewed(String login, long orgResumeId, String note) throws Exception {
        JsonNode row = null;
        for (JsonNode r : page(login).path("resumes")) if (r.path("id").asLong() == orgResumeId) row = r;
        assertThat(row).as("the row the consultant reviews").isNotNull();
        ObjectNode b = om.createObjectNode();
        b.put("versionNo", row.path("versionNo").asInt());
        b.put("contentHash", row.path("contentHash").asText());
        if (note != null) b.put("note", note);
        return om.writeValueAsString(b);
    }

    private MvcResult approve(String login, long orgResumeId) throws Exception {
        return send(login, post(me(a) + "/" + orgResumeId + "/approve").content(reviewed(login, orgResumeId, null)));
    }

    @Test
    void theConsultantsBuilderHasOrganizationCapabilitiesAndTheApiRefusesWhatItHides() throws Exception {
        JsonNode created = consultantCreates("orb-a-c1", "{\"label\":\"Casey's own\",\"source\":\"scratch\"}");
        long id = created.path("resumeId").asLong();
        String base = "/api/profile/resumes/" + id;

        JsonNode personal = ok(send("orb-a-c1", get("/api/profile/resume-builder/config")), 200).path("capabilities");
        assertThat(personal.path("mode").asText()).isEqualTo("personal");
        assertThat(personal.path("shareLinks").asBoolean()).isTrue();

        JsonNode caps = ok(onHost("orb-a-c1", get("/api/profile/resume-builder/config")), 200);
        assertThat(caps.path("capabilities").path("mode").asText()).isEqualTo("consultant");
        assertThat(caps.path("capabilities").path("shareLinks").asBoolean()).isFalse();
        assertThat(caps.path("capabilities").path("deleteResume").asBoolean()).isFalse();
        assertThat(caps.path("capabilities").path("setPrimary").asBoolean()).isFalse();
        assertThat(caps.path("capabilities").path("rename").asBoolean()).isTrue();
        assertThat(caps.path("aiAllowed").asBoolean()).isFalse();

        // the API refuses the same things the editor hides
        assertThat(onHost("orb-a-c1", post(base + "/access/link").content("{}")).getResponse().getStatus()).as("a public share link in an organization is the plain 404 of a resume that is not shareable").isEqualTo(404);
        assertThat(ok(onHost("orb-a-c1", org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(base)), 409).path("code").asText()).isEqualTo("MANAGED_BY_ORGANIZATION");
        assertThat(ok(onHost("orb-a-c1", org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(base + "/meta").content("{\"archived\":true}")), 409).path("code").asText()).isEqualTo("MANAGED_BY_ORGANIZATION");
        assertThat(ok(onHost("orb-a-c1", org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(base + "/meta").content("{\"primary\":true}")), 409).path("code").asText()).isEqualTo("MANAGED_BY_ORGANIZATION");
        assertThat(ok(onHost("orb-a-c1", post("/api/profile/resumes/" + id + "/ai/rewrite").content("{\"refs\":[],\"mode\":\"shorter\",\"consent\":true}")), 402).path("code").asText()).isEqualTo("FEATURE_NOT_LICENSED");
        // a rename is allowed and the directory follows
        assertThat(onHost("orb-a-c1", org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(base + "/meta").content("{\"name\":\"Renamed in the org\"}")).getResponse().getStatus()).isEqualTo(200);
        assertThat(orgResumes.findByOrgIdAndId(a.getId(), created.path("orgResumeId").asLong()).orElseThrow().getName()).isEqualTo("Renamed in the org");
    }

    @Test
    void aMarketerEditsAConsultantsResumeThroughTheSameRoutesInActForModeAndTheApiEnforcesTheAllowList() throws Exception {
        JsonNode created = ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"label\":\"Prepared for Casey\",\"source\":\"scratch\"}")), 201);
        long orgResumeId = created.path("orgResumeId").asLong();
        long resumeId = created.path("resumeId").asLong();
        String base = "/api/profile/resumes/" + resumeId;
        // approve it first, so the marketer's edit has something to send back to PENDING
        ok(approve("orb-a-c1", orgResumeId), 200);

        // the builder tells the editor what an acting marketer may do
        JsonNode caps = ok(actFor("orb-a-marketer", orgResumeId, get("/api/profile/resume-builder/config")), 200).path("capabilities");
        assertThat(caps.path("mode").asText()).isEqualTo("marketer-act-for");
        assertThat(caps.path("approvalNotice").asText()).isEqualTo("Pending consultant approval");
        for (String off : List.of("shareLinks", "deleteResume", "archiveResume", "setPrimary", "rename", "duplicate", "versionRestore", "downloadOriginal", "ai", "tailor")) assertThat(caps.path(off).asBoolean()).as(off).isFalse();

        String approvedHash = orgResumes.findByOrgIdAndId(a.getId(), orgResumeId).orElseThrow().getApprovedContentHash();
        assertThat(approvedHash).as("X7.4: approving pins the fingerprint of the approved text").isNotNull().isEqualTo(resumeDocs.findContentHashByResumeId(resumeId).orElseThrow());
        // read and save the document: the consultant's document, the marketer as author, back to PENDING with a log line
        MvcResult doc = actFor("orb-a-marketer", orgResumeId, get(base + "/doc"));
        JsonNode body = ok(doc, 200);
        assertThat(body.path("label").asText()).isEqualTo("Prepared for Casey");
        ObjectNode docNode = (ObjectNode) body.get("doc");
        ((ObjectNode) docNode.get("basics")).put("headline", "Written by the marketer");
        ObjectNode save = om.createObjectNode();
        save.set("doc", docNode);
        MvcResult saved = actFor("orb-a-marketer", orgResumeId, put(base + "/doc").header("If-Match", doc.getResponse().getHeader("ETag")).content(om.writeValueAsString(save)));
        assertThat(saved.getResponse().getStatus()).as(saved.getResponse().getContentAsString()).isEqualTo(200);
        OrgResume row = orgResumes.findByOrgIdAndId(a.getId(), orgResumeId).orElseThrow();
        assertThat(row.getApprovalStatus()).as("what a marketer wrote waits for the consultant").isEqualTo("PENDING");
        assertThat(row.getKind()).isEqualTo("ORG_MANAGED");
        assertThat(row.getApprovedContentHash()).as("X7.4: the pin keeps naming what the consultant approved, not what the marketer wrote").isEqualTo(approvedHash);
        assertThat(resumeDocs.findContentHashByResumeId(resumeId).orElseThrow()).isNotEqualTo(approvedHash);
        assertThat(row.getHeadline()).isEqualTo("Written by the marketer");
        assertThat(resumes.findById(resumeId).orElseThrow().getUpdatedByLogin()).isEqualTo("orb-a-marketer");
        assertThat(versions.findFirstByResumeIdAndUserIdOrderByVersionNoDesc(resumeId, userOf("orb-a-c1").getId()).orElseThrow().getCreatedByLogin()).isEqualTo("orb-a-marketer");
        assertThat(events.forResumes(a.getId(), List.of(orgResumeId))).extracting(MktResumeEvent::getKind).contains(MktResumeEvent.UPDATED);
        assertThat(actFor("orb-a-marketer", orgResumeId, get(base + "/meta")).getResponse().getStatus()).isEqualTo(200);
        assertThat(actFor("orb-a-marketer", orgResumeId, get(base + "/doc/pdf-status")).getResponse().getStatus()).isEqualTo(200);

        // who last modified it, shown everywhere as the REAL actor: the marketer, by name and role, never the consultant whose account owns the document
        JsonNode meta = ok(onHost("orb-a-c1", get(base + "/meta")), 200);
        assertThat(meta.path("updatedBy").path("label").asText()).isEqualTo("Sarah Chen (marketer)");
        assertThat(meta.path("createdBy").path("label").asText()).isEqualTo("Sarah Chen (marketer)");
        JsonNode mine = null;
        for (JsonNode r : ok(onHost("orb-a-c1", get(me(a))), 200).path("resumes")) if (r.path("id").asLong() == orgResumeId) mine = r;
        assertThat(mine).isNotNull();
        assertThat(mine.path("updatedBy").asText()).isEqualTo("Sarah Chen (marketer)");
        JsonNode boardRow = null;
        for (JsonNode r : ok(onHost("orb-a-owner", get("/api/orgs/" + a.getId() + "/resumes?size=100")), 200).path("items")) if (r.path("id").asLong() == orgResumeId) boardRow = r;
        assertThat(boardRow).isNotNull();
        assertThat(boardRow.path("updatedBy").asText()).isEqualTo("Sarah Chen (marketer)");
        // the version history says the same for each version the marketer wrote
        JsonNode history = ok(onHost("orb-a-c1", get(base + "/doc/versions")), 200);
        assertThat(history.toString()).contains("Sarah Chen (marketer)").doesNotContain("ent#");

        // everything that is not acting-for material is the generic 404, however it is asked
        assertGeneric404(actFor("orb-a-marketer", orgResumeId, post(base + "/access/link").content("{}")), "a public share link");
        assertGeneric404(actFor("orb-a-marketer", orgResumeId, org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(base)), "delete");
        assertGeneric404(actFor("orb-a-marketer", orgResumeId, org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(base + "/meta").content("{\"primary\":true}")), "set primary");
        assertGeneric404(actFor("orb-a-marketer", orgResumeId, post(base + "/doc/checkpoint").content("{}")), "a checkpoint");
        assertGeneric404(actFor("orb-a-marketer", orgResumeId, post(base + "/doc/duplicate").content("{}")), "a duplicate");
        assertGeneric404(actFor("orb-a-marketer", orgResumeId, post(base + "/doc/versions/1/restore")), "a restore");
        assertGeneric404(actFor("orb-a-marketer", orgResumeId, post(base + "/ai/rewrite").content("{\"refs\":[],\"mode\":\"shorter\",\"consent\":true}")), "AI");
        assertGeneric404(actFor("orb-a-marketer", orgResumeId, get(base + "/original")), "the original file");
        assertThat(orgResumes.findByOrgIdAndId(a.getId(), orgResumeId).orElseThrow().getApprovalStatus()).isEqualTo("PENDING");

        // strangers and mismatches
        assertGeneric404(actFor("orb-a-marketer2", orgResumeId, get(base + "/doc")), "a marketer who is not assigned to Casey");
        assertGeneric404(actFor("orb-a-c2", orgResumeId, get(base + "/doc")), "another consultant");
        assertGeneric404(actFor("orb-a-c1", orgResumeId, get(base + "/doc")), "the consultant acting for themself");
        assertGeneric404(actFor("orb-b-owner", orgResumeId, get(base + "/doc")), "another organization's owner");
        assertGeneric404(actFor("orb-a-marketer", orgResumeId, get("/api/profile/resumes/" + (resumeId + 1) + "/doc")), "a different resume than the row names");
        assertGeneric404(actFor("orb-a-marketer", 999999999L, get(base + "/doc")), "an unknown row");
        // no organization host: the header means nothing, the resume is simply not the marketer's
        assertGeneric404(send("orb-a-marketer", get(base + "/doc").header("X-Kiwiply-Act-For", String.valueOf(orgResumeId))), "no organization host");
        // and nobody is left acting for anybody afterwards
        assertThat(send("orb-a-marketer", get("/api/profile/resumes/" + resumeId + "/doc")).getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void everyChangeToAResumeLeavesWhoAndWhenTheConsultantsOwnActionsAreTheirs() throws Exception {
        JsonNode created = consultantCreates("orb-a-c1", "{\"label\":\"Casey's own\",\"source\":\"scratch\"}");
        long orgResumeId = created.path("orgResumeId").asLong();
        assertThat(created.path("row").path("updatedBy").asText()).isEqualTo("Casey One");

        // primary, rename and visibility are recorded in the change log with the real actor, and the row reads "by Casey One"
        assertThat(send("orb-a-c1", post(me(a) + "/" + orgResumeId + "/primary")).getResponse().getStatus()).isEqualTo(200);
        assertThat(send("orb-a-c1", org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(me(a) + "/" + orgResumeId).content("{\"visibility\":\"PRIVATE\"}")).getResponse().getStatus()).isEqualTo(200);
        List<MktResumeEvent> log = events.forResumes(a.getId(), List.of(orgResumeId));
        assertThat(log).extracting(MktResumeEvent::getKind).contains(MktResumeEvent.CREATED, "PRIMARY_SET", "DETAILS_CHANGED");
        assertThat(log).allSatisfy(e -> assertThat(e.getActorMemberId()).isEqualTo(c1.getMemberId()));
        assertThat(log).allSatisfy(e -> assertThat(e.getOccurredAt()).isNotNull());
        assertThat(page("orb-a-c1").path("resumes").get(0).path("updatedBy").asText()).isEqualTo("Casey One");

        // the admin board's actions are attributed the same way: the owner makes it non-primary again by moving the decision, and the row reads "by" them
        MvcResult reopen = send("orb-a-owner", org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/orgs/" + a.getId() + "/resumes/" + orgResumeId + "/visibility").content("{\"visibility\":\"INTERNAL\"}"));
        assertThat(reopen.getResponse().getStatus()).as(reopen.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(events.forResumes(a.getId(), List.of(orgResumeId)).stream().filter(e -> "DETAILS_CHANGED".equals(e.getKind())).count()).isEqualTo(2);
        JsonNode viaBoard = null;
        for (JsonNode r : ok(send("orb-a-owner", get("/api/orgs/" + a.getId() + "/resumes?size=100")), 200).path("items")) if (r.path("id").asLong() == orgResumeId) viaBoard = r;
        assertThat(viaBoard).isNotNull();
        assertThat(viaBoard.path("updatedBy").asText()).as("the owner is the newest actor, shown by name").isNotBlank().doesNotContain("ent#");
    }
    // ---- D10 (2026-10-16 audit): the chooser reads the organization's records ---------------------------------------------------

    @Autowired private com.dossier.api.repository.ent.talent.ConsultantSkillRepository skillRows;

    private OrgResume record(ConsultantProfile c, String name, boolean primary) {
        OrgResume r = new OrgResume();
        r.setOrgId(c.getOrgId());
        r.setConsultantId(c.getId());
        r.setMemberId(c.getMemberId());
        r.setName(name);
        r.setApprovalStatus("APPROVED");
        r.setPrimaryForOrg(primary);
        r.setSummaryText("Backend engineer who ships.");
        r = orgResumes.saveAndFlush(r);
        int order = 0;
        for (String[] e : new String[][] { { "Staff Engineer", "Globex Corp", "2021" }, { "Engineer", "Initech", "2017" } }) {
            com.dossier.api.domain.ent.talent.OrgResumeExperience x = new com.dossier.api.domain.ent.talent.OrgResumeExperience();
            x.setOrgId(c.getOrgId());
            x.setResumeId(r.getId());
            x.setTitle(e[0]);
            x.setEmployer(e[1]);
            x.setStartYear(Integer.parseInt(e[2]));
            x.setSortOrder(order++);
            orgExperience.saveAndFlush(x);
        }
        return r;
    }

    private void skill(ConsultantProfile c, String name, boolean primary, int order) {
        com.dossier.api.domain.ent.talent.ConsultantSkill s = new com.dossier.api.domain.ent.talent.ConsultantSkill();
        s.setOrgId(c.getOrgId());
        s.setConsultantId(c.getId());
        s.setSkill(name);
        s.setPrimarySkill(primary);
        s.setSortOrder(order);
        skillRows.saveAndFlush(s);
    }

    @Test
    void theChooserCountsTheCareerProfileAndListsEveryApprovedResumeNotOnlyBuilderDocuments() throws Exception {
        skill(c1, "Java", true, 0);
        skill(c1, "SQL", false, 1);
        OrgResume record = record(c1, "Imported CV", true);

        JsonNode src = ok(send("orb-a-c1", get(me(a) + "/sources")), 200);
        assertThat(src.path("profile").path("roles").asInt()).as("the work history of the primary resume").isEqualTo(2);
        assertThat(src.path("profile").path("skills").asInt()).isEqualTo(2);
        assertThat(src.path("profile").path("itemCount").asInt()).as("not the empty-profile state").isGreaterThan(0);
        assertThat(src.path("resumes")).hasSize(1);
        assertThat(src.path("resumes").get(0).path("id").asLong()).isEqualTo(record.getId());
        assertThat(src.path("resumes").get(0).path("resumeId").isNull()).as("a record with no builder document").isTrue();

        // "Use my profile" builds from that career profile
        JsonNode fromProfile = consultantCreates("orb-a-c1", "{\"label\":\"From my profile\",\"source\":\"profile\"}");
        String doc = ok(send("orb-a-c1", get("/api/profile/resumes/" + fromProfile.path("resumeId").asLong() + "/doc")), 200).toString();
        assertThat(doc).contains("Globex Corp").contains("Initech").contains("Java");

        // a record is copied into the builder as a new, editable resume
        JsonNode copied = consultantCreates("orb-a-c1", "{\"label\":\"Imported CV (copy)\",\"source\":{\"kind\":\"directory\",\"orgResumeId\":" + record.getId() + "}}");
        assertThat(copied.path("row").path("approvalStatus").asText()).isEqualTo("APPROVED");
        assertThat(ok(send("orb-a-c1", get("/api/profile/resumes/" + copied.path("resumeId").asLong() + "/doc")), 200).toString()).contains("Globex Corp").contains("Backend engineer who ships.");

        // the sources now list the built resumes by their builder id
        JsonNode again = ok(send("orb-a-c1", get(me(a) + "/sources")), 200);
        assertThat(again.path("resumes")).hasSize(3);

        // another consultant's record, another organization's, and a stranger are all the generic 404
        OrgResume theirs = record(c2, "Robin's CV", false);
        assertGeneric404(send("orb-a-c1", post(me(a) + "/built").content("{\"source\":{\"kind\":\"directory\",\"orgResumeId\":" + theirs.getId() + "}}")), "another consultant's record");
        assertGeneric404(send("orb-a-c1", post(me(a) + "/built").content("{\"source\":{\"kind\":\"directory\",\"orgResumeId\":999999999}}")), "unknown record");
        assertGeneric404(send("orb-a-marketer", get(me(a) + "/sources")), "a marketer has no consultant sources");
        assertGeneric404(send("orb-b-owner", get(me(a) + "/sources")), "another organization's owner");
    }

    @Test
    void aConsultantsFirstResumeIsTheirPrimaryOneAndALaterOneIsNot() throws Exception {
        JsonNode first = consultantCreates("orb-a-c1", "{\"label\":\"First\",\"source\":\"scratch\"}");
        assertThat(first.path("row").path("primary").asBoolean()).as("the personal flag already makes the first resume the default").isTrue();
        JsonNode second = consultantCreates("orb-a-c1", "{\"label\":\"Second\",\"source\":\"scratch\"}");
        assertThat(second.path("row").path("primary").asBoolean()).isFalse();
        assertThat(orgResumes.findByOrgIdAndConsultantId(a.getId(), c1.getId()).stream().filter(OrgResume::isPrimaryForOrg).count()).isEqualTo(1);

    }

    @Test
    void aResumeAMarketerMadeBecomesThePrimaryOneWhenTheConsultantApprovesItAndHasNone() throws Exception {
        JsonNode made = ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"label\":\"For Casey\",\"source\":\"scratch\"}")), 201);
        long orgResumeId = made.path("orgResumeId").asLong();
        assertThat(orgResumes.findByOrgIdAndId(a.getId(), orgResumeId).orElseThrow().isPrimaryForOrg()).as("pending, so not primary yet").isFalse();
        assertThat(ok(approve("orb-a-c1", orgResumeId), 200).path("primary").asBoolean()).isTrue();
        assertThat(events.forResumes(a.getId(), List.of(orgResumeId))).extracting(MktResumeEvent::getKind).contains("PRIMARY_SET");
    }

    // ---- security review of the act-for mechanism (2026-10-15) ----------------------------------------------------------

    private static final String ORIGINAL_KEY = "resume-originals/%d/%d-0000-original.pdf";
    private static final String PHOTO_KEY = "resume-photos/%d/%d-0000-photo.png";

    /** Gives the stored document of a resume an uploaded original and a photo (both server-written, both naming objects only the owner may fetch). */
    private String[] seedStorageKeys(long resumeId) throws Exception {
        ResumeDoc d = docRows.findById(resumeId).orElseThrow();
        long uid = d.getUser().getId();
        String original = ORIGINAL_KEY.formatted(uid, resumeId);
        String photo = PHOTO_KEY.formatted(uid, resumeId);
        ObjectNode doc = (ObjectNode) om.readTree(d.getDocJson());
        ((ObjectNode) doc.get("meta")).put("originalFileKey", original);
        ObjectNode ph = ((ObjectNode) doc.get("basics")).putObject("photo");
        ph.put("key", photo);
        ph.put("updatedAt", now.toString());
        d.setDocJson(om.writeValueAsString(doc));
        docRows.saveAndFlush(d);
        return new String[] { original, photo };
    }

    @Test
    void anActingMarketerNeverSeesAStorageKeyInAnyResponseAndASaveKeepsThePhotoAndTheOriginal() throws Exception {
        JsonNode created = ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"label\":\"Prepared for Casey\",\"source\":\"scratch\"}")), 201);
        long orgResumeId = created.path("orgResumeId").asLong();
        long resumeId = created.path("resumeId").asLong();
        String base = "/api/profile/resumes/" + resumeId;
        String[] keys = seedStorageKeys(resumeId);

        // the owner still gets her document whole
        String ownerView = onHost("orb-a-c1", get(base + "/doc")).getResponse().getContentAsString();
        assertThat(ownerView).contains(keys[0]).contains(keys[1]);

        // the acting marketer: no key on GET, none on a save's response, template, theme or a 409 body
        MvcResult doc = actFor("orb-a-marketer", orgResumeId, get(base + "/doc"));
        String got = doc.getResponse().getContentAsString();
        assertThat(doc.getResponse().getStatus()).isEqualTo(200);
        assertThat(got).doesNotContain("originalFileKey\":\"").doesNotContain("resume-originals").doesNotContain("resume-photos").doesNotContain(keys[0]).doesNotContain(keys[1]);
        JsonNode body = om.readTree(got);
        assertThat(body.path("doc").path("meta").has("originalFileKey")).isFalse();
        assertThat(body.path("doc").path("basics").path("photo").has("key")).as("the photo object stays (the editor knows there is one), its key does not").isFalse();
        assertThat(body.path("doc").path("basics").has("photo")).isTrue();

        ObjectNode docNode = (ObjectNode) body.get("doc");
        ((ObjectNode) docNode.get("basics")).put("headline", "Edited by the marketer");
        // a client that tries to point the photo elsewhere, or to set the original, changes nothing: the stored ones stay
        ((ObjectNode) docNode.get("basics")).putObject("photo").put("key", "resume-photos/999999/1-evil.png");
        ((ObjectNode) docNode.get("meta")).put("originalFileKey", "resume-originals/999999/1-evil.pdf");
        ObjectNode save = om.createObjectNode();
        save.set("doc", docNode);
        MvcResult saved = actFor("orb-a-marketer", orgResumeId, put(base + "/doc").header("If-Match", doc.getResponse().getHeader("ETag")).content(om.writeValueAsString(save)));
        assertThat(saved.getResponse().getStatus()).as(saved.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(saved.getResponse().getContentAsString()).doesNotContain("resume-originals").doesNotContain("resume-photos").doesNotContain("evil");
        ResumeDoc stored = docRows.findById(resumeId).orElseThrow();
        JsonNode storedDoc = om.readTree(stored.getDocJson());
        assertThat(storedDoc.path("meta").path("originalFileKey").asText()).isEqualTo(keys[0]);
        assertThat(storedDoc.path("basics").path("photo").path("key").asText()).isEqualTo(keys[1]);
        assertThat(storedDoc.path("basics").path("headline").asText()).isEqualTo("Edited by the marketer");

        // a stale save: the 409 carries the server's document, scrubbed the same way
        MvcResult stale = actFor("orb-a-marketer", orgResumeId, put(base + "/doc").header("If-Match", "1").content(om.writeValueAsString(save)));
        assertThat(stale.getResponse().getStatus()).isEqualTo(409);
        assertThat(stale.getResponse().getContentAsString()).doesNotContain("resume-originals").doesNotContain("resume-photos");

        MvcResult template = actFor("orb-a-marketer", orgResumeId, org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(base + "/doc/template").content("{\"templateId\":\"modern\"}"));
        assertThat(template.getResponse().getStatus()).isEqualTo(200);
        assertThat(template.getResponse().getContentAsString()).doesNotContain("resume-originals").doesNotContain("resume-photos");
        MvcResult theme = actFor("orb-a-marketer", orgResumeId, org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(base + "/doc/theme").content("{\"theme\":{\"accent\":\"#336699\"}}"));
        assertThat(theme.getResponse().getContentAsString()).doesNotContain("resume-originals").doesNotContain("resume-photos");
        // the owner still has both keys after all that
        assertThat(onHost("orb-a-c1", get(base + "/doc")).getResponse().getContentAsString()).contains(keys[0]).contains(keys[1]);
    }

    @Test
    void aMarketerCannotCopyAResumeTheOrganizationDirectoryDoesNotLinkForThatConsultant() throws Exception {
        // Casey's PERSONAL resume: created on the personal route (no organization host), so it is NOT linked into the directory
        JsonNode personal = ok(send("orb-a-c1", post("/api/profile/resumes/built").content("{\"label\":\"Private to Casey\",\"source\":\"scratch\"}")), 201);
        long unlinked = personal.path("resume").path("id").asLong();
        assertThat(orgResumes.findFirstByOrgIdAndResumeIdOrderByIdAsc(a.getId(), unlinked)).isEmpty();
        long before = resumes.count();
        MvcResult copy = send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"source\":{\"kind\":\"copy\",\"fromResumeId\":" + unlinked + "}}"));
        assertGeneric404(copy, "copy of an unlinked resume");
        // however the kind is spelled
        assertGeneric404(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"source\":{\"kind\":\" COPY \",\"fromResumeId\":" + unlinked + "}}")), "copy, other spelling");
        assertGeneric404(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"source\":{\"kind\":\"copy\"}}")), "copy with no source");
        assertThat(resumes.count()).isEqualTo(before);
        // a LINKED one of the same consultant still works
        JsonNode linked = consultantCreates("orb-a-c1", "{\"label\":\"Casey in the org\",\"source\":\"scratch\"}");
        ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"source\":{\"kind\":\"copy\",\"fromResumeId\":" + linked.path("resumeId").asLong() + "}}")), 201);
    }

    @Test
    void aConsultantWhoseAccountIsPersonalIsNeverActedForOrPreparedFor() throws Exception {
        // a consultant of a legacy SHARED seat: an ACTIVE seat and a profile, but the sign-in is a PERSONAL account (org_id null)
        ConsultantProfile shared = consultant(a, "orb-a-shared", "Shared Person", true);
        User personalUser = users.findOneByLogin("orb-a-shared").orElseThrow();
        personalUser.setOrgId(null);
        users.saveAndFlush(personalUser);
        assign(shared, marketerSeat);
        JsonNode linkedPersonal = ok(send("orb-a-shared", post(me(a) + "/built").content("{\"label\":\"Shared one\",\"source\":\"scratch\"}")), 201);
        long personalRow = linkedPersonal.path("orgResumeId").asLong();
        long personalResume = linkedPersonal.path("resumeId").asLong();
        // make it a marketer-edited row so it would be act-for material but for the account model
        OrgResume row = orgResumes.findByOrgIdAndId(a.getId(), personalRow).orElseThrow();
        row.setKind("ORG_MANAGED");
        orgResumes.saveAndFlush(row);

        assertGeneric404(actFor("orb-a-marketer", personalRow, get("/api/profile/resumes/" + personalResume + "/doc")), "act-for on a personal account");
        long before = resumes.count();
        assertThat(ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + shared.getId() + "/built").content("{\"source\":\"scratch\"}")), 409).path("code").asText()).isEqualTo("CONSULTANT_HAS_NO_ACCOUNT");
        assertThat(ok(send("orb-a-marketer", get(mkt(a) + "/consultants/" + shared.getId() + "/sources")), 409).path("code").asText()).isEqualTo("CONSULTANT_HAS_NO_ACCOUNT");
        assertThat(resumes.count()).isEqualTo(before);
        for (JsonNode c : ok(send("orb-a-marketer", get(mkt(a) + "/consultants")), 200)) {
            if ("Shared Person".equals(c.path("name").asText())) assertThat(c.path("hasAccount").asBoolean()).isFalse();
        }
        // an enterprise account of ANOTHER organization is no better
        User other = users.findOneByLogin("orb-a-shared").orElseThrow();
        other.setOrgId(b.getId());
        users.saveAndFlush(other);
        assertGeneric404(actFor("orb-a-marketer", personalRow, get("/api/profile/resumes/" + personalResume + "/doc")), "act-for on another organization's account");
        assertThat(ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + shared.getId() + "/built").content("{\"source\":\"scratch\"}")), 409).path("code").asText()).isEqualTo("CONSULTANT_HAS_NO_ACCOUNT");
    }

    @Test
    void theActForGateAlsoNeedsAnActiveConsultantAnActivatedAccountAndATokenBoundToThisOrganization() throws Exception {
        JsonNode created = ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"label\":\"Prepared\",\"source\":\"scratch\"}")), 201);
        long orgResumeId = created.path("orgResumeId").asLong();
        String doc = "/api/profile/resumes/" + created.path("resumeId").asLong() + "/doc";
        assertThat(actFor("orb-a-marketer", orgResumeId, get(doc)).getResponse().getStatus()).as("the baseline works").isEqualTo(200);

        // a token with no tid, or bound to another organization
        assertGeneric404(actForWithTid("orb-a-marketer", null, orgResumeId, get(doc)), "a token with no tid");
        assertGeneric404(actForWithTid("orb-a-marketer", b.getId(), orgResumeId, get(doc)), "a token bound to another organization");

        // a consultant profile that is no longer ACTIVE
        c1.setStatus("INACTIVE");
        profiles.saveAndFlush(c1);
        assertGeneric404(actFor("orb-a-marketer", orgResumeId, get(doc)), "an inactive consultant profile");
        c1.setStatus("ACTIVE");
        profiles.saveAndFlush(c1);
        assertThat(actFor("orb-a-marketer", orgResumeId, get(doc)).getResponse().getStatus()).isEqualTo(200);

        // an account that is not activated
        User owner = users.findOneByLogin("orb-a-c1").orElseThrow();
        owner.setActivated(false);
        users.saveAndFlush(owner);
        assertGeneric404(actFor("orb-a-marketer", orgResumeId, get(doc)), "an account that is not activated");
        owner.setActivated(true);
        users.saveAndFlush(owner);

        // a seat that is no longer ACTIVE (suspended, offboarded, erased: the account is disabled with it)
        OrgMember seat = members.findByOrgIdAndId(a.getId(), c1.getMemberId()).orElseThrow();
        seat.setStatus(OrgMemberStatus.SUSPENDED);
        members.saveAndFlush(seat);
        assertGeneric404(actFor("orb-a-marketer", orgResumeId, get(doc)), "a suspended seat");
    }

    @Test
    void anActForRequestLeavesNobodyActingOnThisThreadNotOnSuccessNotOnRefusalNotOnAnError() throws Exception {
        JsonNode created = ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"label\":\"Prepared\",\"source\":\"scratch\"}")), 201);
        long orgResumeId = created.path("orgResumeId").asLong();
        String base = "/api/profile/resumes/" + created.path("resumeId").asLong();
        assertThat(ResumeActAs.current()).as("after the create").isEmpty();

        assertThat(actFor("orb-a-marketer", orgResumeId, get(base + "/doc")).getResponse().getStatus()).isEqualTo(200);
        assertThat(ResumeActAs.current()).as("after a successful act-for request").isEmpty();
        var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth == null || !"orb-a-c1".equals(auth.getName())).as("the consultant's identity is not left on the thread").isTrue();
        // a refused route inside the window, a handler error (a stale If-Match is a 409 from inside the handler) and a bad save
        assertThat(actFor("orb-a-marketer", orgResumeId, get(base + "/original")).getResponse().getStatus()).isEqualTo(404);
        assertThat(ResumeActAs.current()).as("after a refusal").isEmpty();
        assertThat(actFor("orb-a-marketer", orgResumeId, put(base + "/doc").header("If-Match", "1").content("{\"doc\":{}}")).getResponse().getStatus()).isGreaterThanOrEqualTo(400);
        assertThat(ResumeActAs.current()).as("after a handler error").isEmpty();
        // and the very next ordinary request on this thread is its own caller, not the consultant
        assertThat(send("orb-a-marketer", get(base + "/doc")).getResponse().getStatus()).as("the marketer is just the marketer again").isEqualTo(404);
    }

    @Test
    void aConsultantsDecisionNamesTheVersionTheyReviewedAndAStaleOneIsAConflict() throws Exception {
        JsonNode created = ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"label\":\"Prepared\",\"source\":\"scratch\"}")), 201);
        long orgResumeId = created.path("orgResumeId").asLong();
        long resumeId = created.path("resumeId").asLong();
        String base = "/api/profile/resumes/" + resumeId;

        // the consultant opens the page: the row carries the version they are asked to approve
        String shown = reviewed("orb-a-c1", orgResumeId, null);
        // ... and meanwhile the marketer saves again
        MvcResult doc = actFor("orb-a-marketer", orgResumeId, get(base + "/doc"));
        ObjectNode docNode = (ObjectNode) om.readTree(doc.getResponse().getContentAsString()).get("doc");
        ((ObjectNode) docNode.get("basics")).put("headline", "Changed after the consultant looked");
        ObjectNode save = om.createObjectNode();
        save.set("doc", docNode);
        assertThat(actFor("orb-a-marketer", orgResumeId, put(base + "/doc").header("If-Match", doc.getResponse().getHeader("ETag")).content(om.writeValueAsString(save))).getResponse().getStatus()).isEqualTo(200);

        // approving the version she saw is refused: it is no longer the current one
        assertThat(ok(send("orb-a-c1", post(me(a) + "/" + orgResumeId + "/approve").content(shown)), 409).path("code").asText()).isEqualTo("RESUME_CHANGED");
        assertThat(ok(send("orb-a-c1", post(me(a) + "/" + orgResumeId + "/request-changes").content(shown)), 409).path("code").asText()).isEqualTo("RESUME_CHANGED");
        assertThat(orgResumes.findByOrgIdAndId(a.getId(), orgResumeId).orElseThrow().getApprovalStatus()).isEqualTo("PENDING");
        // a decision that names no version at all, or only half of it, is refused as well: there is no way to approve "whatever is there now"
        assertThat(send("orb-a-c1", post(me(a) + "/" + orgResumeId + "/approve")).getResponse().getStatus()).isEqualTo(422);
        assertThat(send("orb-a-c1", post(me(a) + "/" + orgResumeId + "/approve").content("{\"versionNo\":1}")).getResponse().getStatus()).isEqualTo(422);
        assertThat(orgResumes.findByOrgIdAndId(a.getId(), orgResumeId).orElseThrow().getApprovalStatus()).isEqualTo("PENDING");
        // reload, review the new version, and it goes through
        ok(approve("orb-a-c1", orgResumeId), 200);
        assertThat(orgResumes.findByOrgIdAndId(a.getId(), orgResumeId).orElseThrow().getApprovalStatus()).isEqualTo("APPROVED");
    }

    @Test
    void aConsultantInTheOrganizationCannotArchiveOrMakePrimaryALinkedResumeThroughTheProfileRoute() throws Exception {
        JsonNode created = consultantCreates("orb-a-c1", "{\"label\":\"Casey's own\",\"source\":\"scratch\"}");
        String route = "/api/profile/resumes/" + created.path("resumeId").asLong();
        assertThat(ok(onHost("orb-a-c1", put(route).content("{\"archived\":true}")), 409).path("code").asText()).isEqualTo("MANAGED_BY_ORGANIZATION");
        assertThat(ok(onHost("orb-a-c1", put(route).content("{\"defaultResume\":true}")), 409).path("code").asText()).isEqualTo("MANAGED_BY_ORGANIZATION");
        Resume r = resumes.findById(created.path("resumeId").asLong()).orElseThrow();
        assertThat(r.getArchived()).isNotEqualTo(true);
        // a label change is not archive or primary: still allowed; and the personal product (no organization host) is untouched
        assertThat(onHost("orb-a-c1", put(route).content("{\"starred\":true}")).getResponse().getStatus()).isEqualTo(200);
        assertThat(send("orb-a-c1", put(route).content("{\"archived\":true}")).getResponse().getStatus()).isEqualTo(200);
    }

    // ---- consultant share links: an org setting, default off ---------------------------------------------------------------

    private String policy(Organization org) {
        return "/api/orgs/" + org.getId() + "/resume-policy";
    }

    private JsonNode capabilitiesOf(String login) throws Exception {
        return ok(onHost(login, get("/api/profile/resume-builder/config")), 200).path("capabilities");
    }

    @Test
    void consultantShareLinksAreAnOrgSettingThatIsOffByDefaultAndOnlyTheOrgAdminTurnsItOn() throws Exception {
        long id = consultantCreates("orb-a-c1", "{\"label\":\"Casey's own\",\"source\":\"scratch\"}").path("resumeId").asLong();
        String link = "/api/profile/resumes/" + id + "/access/link";
        String access = "/api/profile/resumes/" + id + "/access";

        // ANOTHER organization turning it on changes nothing here, and the platform default is off
        OrgSetting other = new OrgSetting();
        other.setOrgId(b.getId());
        other.setSettingKey(EnterpriseSettingKeys.ORG_RESUMES_CONSULTANT_SHARE_LINKS);
        other.setValueJson("true");
        orgSettings.saveAndFlush(other);

        assertThat(capabilitiesOf("orb-a-c1").path("shareLinks").asBoolean()).as("off by default").isFalse();
        assertThat(onHost("orb-a-c1", post(link).content("{}")).getResponse().getStatus()).as("create a link, off").isEqualTo(404);
        assertThat(onHost("orb-a-c1", post(access).content("{\"email\":\"someone@example.org\"}")).getResponse().getStatus()).as("name a person, off").isEqualTo(404);
        JsonNode off = ok(onHost("orb-a-owner", get(policy(a))), 200);
        assertThat(off.path("consultantShareLinks").asBoolean()).isFalse();
        assertThat(off.path("overridden").asBoolean()).isFalse();

        // only the org admin changes it: a consultant, another organization's owner and a bad body are all refused
        assertGeneric404(onHost("orb-a-c1", put(policy(a)).content("{\"consultantShareLinks\":true}")), "a consultant turning it on");
        assertGeneric404(onHost("orb-b-owner", put(policy(a)).content("{\"consultantShareLinks\":true}")), "another organization's owner");
        assertThat(onHost("orb-a-owner", put(policy(a)).content("{\"consultantShareLinks\":\"yes\"}")).getResponse().getStatus()).isBetween(400, 422);
        assertThat(onHost("orb-a-owner", put(policy(a)).content("{}")).getResponse().getStatus()).isEqualTo(422);
        assertThat(capabilitiesOf("orb-a-c1").path("shareLinks").asBoolean()).isFalse();

        // the org admin turns it on: the capability shows and the consultant manages links on their own org resume
        JsonNode on = ok(onHost("orb-a-owner", put(policy(a)).content("{\"consultantShareLinks\":true}")), 200);
        assertThat(on.path("consultantShareLinks").asBoolean()).isTrue();
        assertThat(on.path("overridden").asBoolean()).isTrue();
        JsonNode caps = capabilitiesOf("orb-a-c1");
        assertThat(caps.path("mode").asText()).isEqualTo("consultant");
        assertThat(caps.path("shareLinks").asBoolean()).isTrue();
        assertThat(caps.path("deleteResume").asBoolean() || caps.path("ai").asBoolean()).as("nothing else changes").isFalse();
        MvcResult made = onHost("orb-a-c1", post(link).content("{}"));
        assertThat(made.getResponse().getStatus()).as(made.getResponse().getContentAsString()).isBetween(200, 201);
        long grantId = om.readTree(made.getResponse().getContentAsString()).path("id").asLong();
        assertThat(ok(onHost("orb-a-c1", get(access)), 200).path("links")).hasSize(1);
        assertThat(onHost("orb-a-c1", org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(access + "/" + grantId)).getResponse().getStatus()).isBetween(200, 204);

        // another consultant cannot reach this consultant's resume
        assertThat(onHost("orb-a-c2", post(link).content("{}")).getResponse().getStatus()).as("another consultant's resume").isEqualTo(404);

        // a marketer acting for the consultant can NEVER create a link, even with the setting on
        JsonNode prepared = ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"label\":\"Prepared for Casey\",\"source\":\"scratch\"}")), 201);
        long orgResumeId = prepared.path("orgResumeId").asLong();
        String preparedBase = "/api/profile/resumes/" + prepared.path("resumeId").asLong();
        assertThat(actFor("orb-a-marketer", orgResumeId, get("/api/profile/resume-builder/config")).getResponse().getContentAsString()).contains("\"mode\":\"marketer-act-for\"").contains("\"shareLinks\":false");
        assertGeneric404(actFor("orb-a-marketer", orgResumeId, post(preparedBase + "/access/link").content("{}")), "a link by a marketer, setting on");
        assertGeneric404(actFor("orb-a-marketer", orgResumeId, post(preparedBase + "/access").content("{\"email\":\"someone@example.org\"}")), "a named person by a marketer, setting on");

        // personal accounts are unchanged by the setting
        assertThat(ok(send("orb-a-c1", get("/api/profile/resume-builder/config")), 200).path("capabilities").path("shareLinks").asBoolean()).isTrue();

        // off again: the consultant is back to the plain 404
        ok(onHost("orb-a-owner", put(policy(a)).content("{\"consultantShareLinks\":false}")), 200);
        assertThat(capabilitiesOf("orb-a-c1").path("shareLinks").asBoolean()).isFalse();
        assertThat(onHost("orb-a-c1", post(link).content("{}")).getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void thePlatformValueIsTheStartingPointAndTheOrgsOwnChoiceWins() throws Exception {
        long id = consultantCreates("orb-a-c1", "{\"label\":\"Casey's own\",\"source\":\"scratch\"}").path("resumeId").asLong();
        settingRows.save(new AppSetting(EnterpriseSettingKeys.ORG_RESUMES_CONSULTANT_SHARE_LINKS, "true", WHO, Instant.now()));
        cache.invalidate();
        assertThat(capabilitiesOf("orb-a-c1").path("shareLinks").asBoolean()).as("platform on, no org choice").isTrue();
        assertThat(ok(onHost("orb-a-owner", get(policy(a))), 200).path("overridden").asBoolean()).isFalse();
        ok(onHost("orb-a-owner", put(policy(a)).content("{\"consultantShareLinks\":false}")), 200);
        assertThat(capabilitiesOf("orb-a-c1").path("shareLinks").asBoolean()).as("the org's own choice wins").isFalse();
        assertThat(onHost("orb-a-c1", post("/api/profile/resumes/" + id + "/access/link").content("{}")).getResponse().getStatus()).isEqualTo(404);
    }

    // ---- switching sharing off PAUSES existing links and people (user decision 2026-10-15); switching it on restores them ------------

    private static final byte[] PDF = "%PDF-1.4 pause test".getBytes();
    private static final java.util.concurrent.atomic.AtomicInteger IP = new java.util.concurrent.atomic.AtomicInteger(1);

    private MvcResult publicGet(String path) throws Exception {
        return mockMvc.perform(get(path).with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous()).header("X-Forwarded-For", "203.0.113." + IP.getAndIncrement())).andReturn();
    }

    private static String tokenOf(JsonNode link) {
        String url = link.path("url").asText();
        return url.substring(url.lastIndexOf("/r/") + 3);
    }

    /** A problem body without the echoed request path: everything else must be identical between two refusals. */
    private String sameProblem(MvcResult r) throws Exception {
        String body = r.getResponse().getContentAsString();
        if (body.isBlank()) return "";
        ObjectNode n = (ObjectNode) om.readTree(body);
        n.remove("instance");
        n.remove("path");
        return n.toString();
    }

    private void makeCurrentPdf(long resumeId) {
        com.dossier.api.domain.ResumeDoc d = resumeDocs.findById(resumeId).orElseThrow();
        Resume r = d.getResume();
        String key = storage.objectKeyFor(r.getUser().getId(), resumeId, "resume.pdf");
        storage.store(key, PDF, "application/pdf");
        r.setr2ObjectKey(key);
        resumes.saveAndFlush(r);
        d.setPdfStatus(com.dossier.api.service.resume.ResumePdfState.READY);
        d.setExportedHash(com.dossier.api.service.ResumeDocService.renderHash(d));
        d.setExportedAt(Instant.now());
        resumeDocs.saveAndFlush(d);
    }

    private JsonNode setSharing(boolean on) throws Exception {
        return ok(onHost("orb-a-owner", put(policy(a)).content("{\"consultantShareLinks\":" + on + "}")), 200);
    }

    private void assertSameAsUnknown(String path, String unknownPath, String what) throws Exception {
        MvcResult dead = publicGet(path);
        MvcResult unknown = publicGet(unknownPath);
        assertThat(dead.getResponse().getStatus()).as(what + " status").isEqualTo(404).isEqualTo(unknown.getResponse().getStatus());
        assertThat(sameProblem(dead)).as(what + " body is exactly an unknown link's").isEqualTo(sameProblem(unknown));
    }

    @Test
    void switchingConsultantSharingOffPausesExistingLinksAndPeopleAndSwitchingItOnRestoresThem() throws Exception {
        long id = consultantCreates("orb-a-c1", "{\"label\":\"Casey's own\",\"source\":\"scratch\"}").path("resumeId").asLong();
        String base = "/api/profile/resumes/" + id;
        setSharing(true);
        JsonNode link = ok(onHost("orb-a-c1", post(base + "/access/link").content("{\"allowDownload\":true,\"label\":\"Acme recruiter\"}")), 201);
        String token = tokenOf(link);
        JsonNode person = ok(onHost("orb-a-c1", post(base + "/access").content("{\"email\":\"admin@localhost\"}")), 201);
        makeCurrentPdf(id);
        String unknown = "A".repeat(32);

        // sharing on: everything opens, and the policy counts the two live shares
        assertThat(publicGet("/api/public/resumes/" + token).getResponse().getStatus()).isEqualTo(200);
        assertThat(publicGet("/api/public/resumes/" + token + "/pdf").getResponse().getContentAsByteArray()).isEqualTo(PDF);
        assertThat(send("admin", get("/api/profile/resumes/shared/" + id + "/doc")).getResponse().getStatus()).isEqualTo(200);
        assertThat(ok(send("admin", get("/api/profile/resumes/shared-with-me")), 200).findValuesAsText("name")).contains("Casey's own");
        JsonNode counted = ok(onHost("orb-a-owner", get(policy(a))), 200);
        assertThat(counted.path("activeConsultantLinks").asLong()).isEqualTo(2);
        assertThat(ok(onHost("orb-a-c1", get(base + "/access")), 200).findValuesAsText("paused")).containsOnly("false");

        // OFF: the policy answers with the count, and every serving path is exactly an unknown link's not-found
        JsonNode off = setSharing(false);
        assertThat(off.path("consultantShareLinks").asBoolean()).isFalse();
        assertThat(off.path("activeConsultantLinks").asLong()).as("kept, not deleted").isEqualTo(2);
        assertSameAsUnknown("/api/public/resumes/" + token, "/api/public/resumes/" + unknown, "the page of a paused link");
        assertSameAsUnknown("/api/public/resumes/" + token + "/pdf", "/api/public/resumes/" + unknown + "/pdf", "the PDF of a paused link");
        assertThat(send("admin", get("/api/profile/resumes/shared/" + id + "/doc")).getResponse().getStatus()).as("a named person's document").isEqualTo(404);
        assertThat(send("admin", get("/api/profile/resumes/shared/" + id + "/export?format=pdf")).getResponse().getStatus()).as("a named person's PDF").isEqualTo(404);
        assertThat(ok(send("admin", get("/api/profile/resumes/shared-with-me")), 200).findValuesAsText("name")).as("not listed while paused").doesNotContain("Casey's own");

        // the consultant sees them as paused, can still revoke, and cannot create new ones
        JsonNode overview = ok(onHost("orb-a-c1", get(base + "/access")), 200);
        assertThat(overview.path("links")).hasSize(1);
        assertThat(overview.path("links").get(0).path("paused").asBoolean()).isTrue();
        assertThat(overview.path("grants").get(0).path("paused").asBoolean()).isTrue();
        assertThat(capabilitiesOf("orb-a-c1").path("shareLinks").asBoolean()).isFalse();
        assertThat(onHost("orb-a-c1", post(base + "/access/link").content("{}")).getResponse().getStatus()).isEqualTo(404);
        assertThat(onHost("orb-a-c1", post(base + "/access").content("{\"email\":\"admin@localhost\"}")).getResponse().getStatus()).isEqualTo(404);

        // ON again: both work, nothing needed re-creating, and the details of the audit row say what happened
        JsonNode on = setSharing(true);
        assertThat(on.path("activeConsultantLinks").asLong()).isEqualTo(2);
        assertThat(publicGet("/api/public/resumes/" + token).getResponse().getStatus()).isEqualTo(200);
        assertThat(publicGet("/api/public/resumes/" + token + "/pdf").getResponse().getContentAsByteArray()).isEqualTo(PDF);
        assertThat(send("admin", get("/api/profile/resumes/shared/" + id + "/doc")).getResponse().getStatus()).isEqualTo(200);
        assertThat(ok(onHost("orb-a-c1", get(base + "/access")), 200).findValuesAsText("paused")).containsOnly("false");
        assertThat(person.path("id").asLong()).isPositive();

        List<String> details = audit
            .findByOrgIdAndAction(a.getId(), OrgAuditService.ORG_SETTINGS, org.springframework.data.domain.PageRequest.of(0, 20))
            .map(com.dossier.api.domain.org.OrgAuditEvent::getDetails)
            .toList();
        String key = EnterpriseSettingKeys.ORG_RESUMES_CONSULTANT_SHARE_LINKS;
        assertThat(details).contains(
            "setting=" + key + " old=false new=true linksRestored=2",
            "setting=" + key + " old=true new=false linksPaused=2"
        );
    }

    @Test
    void aLinkRevokedOrExpiredWhilePausedStaysDeadWhenSharingComesBack() throws Exception {
        long id = consultantCreates("orb-a-c1", "{\"label\":\"Casey's own\",\"source\":\"scratch\"}").path("resumeId").asLong();
        String base = "/api/profile/resumes/" + id;
        setSharing(true);
        JsonNode revokedLink = ok(onHost("orb-a-c1", post(base + "/access/link").content("{}")), 201);
        JsonNode expiringLink = ok(onHost("orb-a-c1", post(base + "/access/link").content("{}")), 201);
        JsonNode keptLink = ok(onHost("orb-a-c1", post(base + "/access/link").content("{}")), 201);
        JsonNode person = ok(onHost("orb-a-c1", post(base + "/access").content("{\"email\":\"admin@localhost\"}")), 201);

        setSharing(false);
        // the consultant can still revoke a paused link
        assertThat(onHost("orb-a-c1", org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(base + "/access/" + revokedLink.path("id").asLong())).getResponse().getStatus()).isEqualTo(204);
        // another one runs out its time while paused
        var expiring = accessRows.findById(expiringLink.path("id").asLong()).orElseThrow();
        expiring.setExpiresAt(Instant.now().minusSeconds(60));
        accessRows.saveAndFlush(expiring);
        assertThat(ok(onHost("orb-a-c1", get(base + "/access")), 200).path("links")).as("the revoked one is gone from the list").hasSize(2);

        setSharing(true);
        assertThat(publicGet("/api/public/resumes/" + tokenOf(revokedLink)).getResponse().getStatus()).as("revoked while paused").isEqualTo(404);
        assertThat(publicGet("/api/public/resumes/" + tokenOf(expiringLink)).getResponse().getStatus()).as("expired while paused").isEqualTo(404);
        assertThat(publicGet("/api/public/resumes/" + tokenOf(keptLink)).getResponse().getStatus()).as("untouched, so it is back").isEqualTo(200);
        assertThat(send("admin", get("/api/profile/resumes/shared/" + id + "/doc")).getResponse().getStatus()).isEqualTo(200);
        assertThat(person.path("id").asLong()).isPositive();
    }

    @Test
    void personalResumesAndOtherOrganizationsAreNotPausedByThisOrganizationsSwitch() throws Exception {
        // an organization A resume with a live link, then A switches sharing off
        long aResume = consultantCreates("orb-a-c1", "{\"label\":\"Casey's own\",\"source\":\"scratch\"}").path("resumeId").asLong();
        setSharing(true);
        String aToken = tokenOf(ok(onHost("orb-a-c1", post("/api/profile/resumes/" + aResume + "/access/link").content("{}")), 201));

        // a PERSONAL resume (no organization at all) with a link
        long personal = ok(send("admin", post("/api/profile/resumes/built").content("{\"label\":\"Admin personal\"}")), 201).at("/resume/id").asLong();
        String personalToken = tokenOf(ok(send("admin", post("/api/profile/resumes/" + personal + "/access/link").content("{}")), 201));

        // a resume that organization B links into ITS directory, with a link; B has not turned sharing on (default off)
        long bResume = ok(send("admin", post("/api/profile/resumes/built").content("{\"label\":\"Linked into B\"}")), 201).at("/resume/id").asLong();
        String bToken = tokenOf(ok(send("admin", post("/api/profile/resumes/" + bResume + "/access/link").content("{}")), 201));
        OrgResume linked = new OrgResume();
        linked.setOrgId(b.getId());
        linked.setConsultantId(cb.getId());
        linked.setResumeId(bResume);
        linked.setName("Linked into B");
        orgResumes.saveAndFlush(linked);

        setSharing(false);
        assertThat(publicGet("/api/public/resumes/" + aToken).getResponse().getStatus()).as("A's own link is paused").isEqualTo(404);
        assertThat(publicGet("/api/public/resumes/" + personalToken).getResponse().getStatus()).as("a personal resume is untouched").isEqualTo(200);
        assertThat(publicGet("/api/public/resumes/" + bToken).getResponse().getStatus()).as("B has sharing off by default, so B's link is paused on B's own setting").isEqualTo(404);

        // B turns it on: B's link works while A (off) stays paused, and the count of each organization is its own
        OrgSetting bOn = new OrgSetting();
        bOn.setOrgId(b.getId());
        bOn.setSettingKey(EnterpriseSettingKeys.ORG_RESUMES_CONSULTANT_SHARE_LINKS);
        bOn.setValueJson("true");
        orgSettings.saveAndFlush(bOn);
        assertThat(publicGet("/api/public/resumes/" + bToken).getResponse().getStatus()).as("B's own switch decides B's link").isEqualTo(200);
        assertThat(publicGet("/api/public/resumes/" + aToken).getResponse().getStatus()).as("A stays paused").isEqualTo(404);
        assertThat(ok(onHost("orb-a-owner", get(policy(a))), 200).path("activeConsultantLinks").asLong()).as("A counts only its own resumes").isEqualTo(1);
        assertThat(ok(send("orb-b-owner", get(policy(b))), 200).path("activeConsultantLinks").asLong()).as("B counts only its own resumes").isEqualTo(1);
    }
}
