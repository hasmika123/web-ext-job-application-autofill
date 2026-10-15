package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
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
    @Autowired private ConsultantProfileRepository profiles;
    @Autowired private MarketerAssignmentRepository assignments;
    @Autowired private OrgResumeRepository orgResumes;
    @Autowired private OrgResumeExperienceRepository orgExperience;
    @Autowired private MktResumeEventRepository events;
    @Autowired private ResumeRepository resumes;
    @Autowired private ResumeDocVersionRepository versions;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
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
        flags();
        staff(a, "orb-a-owner", OrgRole.OWNER);
        marketerSeat = staff(a, "orb-a-marketer", OrgRole.MARKETER);
        OrgMember other = staff(a, "orb-a-marketer2", OrgRole.MARKETER);
        staff(b, "orb-b-owner", OrgRole.OWNER);
        c1 = consultant(a, "orb-a-c1", "Casey One", true);
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
    }

    private void flags() {
        for (String key : List.of(EnterpriseSettingKeys.FLAG_ENTERPRISE, EnterpriseSettingKeys.FLAG_ROLES, EnterpriseSettingKeys.FLAG_MARKETING)) {
            settingRows.save(new AppSetting(key, "{\"on\":true}", WHO, Instant.now()));
        }
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
        JsonNode approved = ok(send("orb-a-c1", post(me(a) + "/" + orgResumeId + "/approve")), 200);
        assertThat(approved.path("approvalStatus").asText()).isEqualTo("APPROVED");
        assertThat(approved.path("awaitingMyApproval").asBoolean()).isFalse();
        OrgResume after = orgResumes.findByOrgIdAndId(a.getId(), orgResumeId).orElseThrow();
        assertThat(after.getApprovedByMemberId()).isEqualTo(c1.getMemberId());
        assertThat(after.getApprovedAt()).isNotNull();
        assertThat(events.forResumes(a.getId(), List.of(orgResumeId))).extracting(MktResumeEvent::getKind).endsWith(MktResumeEvent.APPROVED);
        assertThat(ok(send("orb-a-c1", post(me(a) + "/" + orgResumeId + "/approve")), 409).path("code").asText()).isEqualTo("NOT_PENDING");
        assertThat(send("orb-a-c1", post(me(a) + "/" + orgResumeId + "/primary")).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void theConsultantCanSendAMarketersResumeBackAndTheBoardReadsNeedsUpdate() throws Exception {
        JsonNode created = ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"source\":\"scratch\"}")), 201);
        long orgResumeId = created.path("orgResumeId").asLong();

        JsonNode back = ok(send("orb-a-c1", post(me(a) + "/" + orgResumeId + "/request-changes").content("{\"note\":\"Please add my 2019 role\"}")), 200);
        assertThat(back.path("approvalStatus").asText()).isEqualTo("REJECTED");
        assertThat(back.path("awaitingMyApproval").asBoolean()).isFalse();
        JsonNode detail = ok(send("orb-a-marketer", get(mkt(a) + "/" + orgResumeId)), 200);
        assertThat(detail.path("row").path("approval").asText()).isEqualTo("NEEDS_UPDATE");
        assertThat(detail.path("history").get(0).path("kind").asText()).isEqualTo(MktResumeEvent.MARKED_FOR_UPDATE);
        // a note that carries a never-collected value is refused like every free text
        JsonNode second = ok(send("orb-a-marketer", post(mkt(a) + "/consultants/" + c1.getId() + "/built").content("{\"source\":\"scratch\"}")), 201);
        assertThat(send("orb-a-c1", post(me(a) + "/" + second.path("orgResumeId").asLong() + "/request-changes").content("{\"note\":\"my SSN is 078-05-1120\"}")).getResponse().getStatus()).isEqualTo(422);
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
}
