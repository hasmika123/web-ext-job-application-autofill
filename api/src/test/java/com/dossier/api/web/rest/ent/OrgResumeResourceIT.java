package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.OrgResumeExperience;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.OrgResumeExperienceRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Resumes board API (/api/orgs/{orgId}/resumes): scope per permission, the list filters and sorts, honest tiles, the detail preview, the primary
 * rule (one per consultant, only approved), visibility, approval with the self-decision rule, create (idempotent, no sensitive text, no folders in the
 * file name), bulk, exports, and the tenant wall (another organization's ids are the generic 404).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgResumeResourceIT extends MemberItSupport {

    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private ConsultantSkillRepository skills;
    @Autowired private MarketerAssignmentRepository marketerAssignments;
    @Autowired private OrgResumeRepository resumes;
    @Autowired private OrgResumeExperienceRepository experience;

    private ConsultantProfile cp1; // assigned to the specialist
    private ConsultantProfile cp2; // assigned to nobody
    private ConsultantProfile cpB; // organization B
    private OrgResume r1; // cp1, approved, primary, internal, owned by the specialist
    private OrgResume r2; // cp1, pending, public, owned by the specialist
    private OrgResume r3; // cp2, approved, private, owned by the owner
    private OrgResume rb; // organization B

    @BeforeEach
    void talentWorld() {
        cp1 = consultant(a, "Anika Khan", "anika." + p + "@example.org");
        cp2 = consultant(a, "Anita Rao", "anita." + p + "@example.org");
        cpB = consultant(b, "Bea Brown", "bea." + p + "@example.org");
        assign(cp1, mktSpec);
        skill(cp1, "Java", true, 0);
        skill(cp1, "Spring", false, 1);
        r1 = resume(a, cp1, "Anika Khan Resume", "anika_khan_resume.pdf", "Backend Engineer", 3, true, "INTERNAL", "APPROVED", mktSpec, daysAgo(40), daysAgo(2));
        r2 = resume(a, cp1, "Anika Khan Resume (Spring)", "anika_khan_resume_alt.pdf", "Platform Engineer", 1, false, "PUBLIC", "PENDING", mktSpec, daysAgo(3), daysAgo(1));
        r3 = resume(a, cp2, "Anita Rao Resume", "anita_rao_resume.pdf", "Data Analyst", 2, false, "PRIVATE", "APPROVED", owner, daysAgo(90), daysAgo(60));
        rb = resume(b, cpB, "Bea Brown Resume", "bea_brown_resume.pdf", "Designer", 1, true, "INTERNAL", "APPROVED", bOwner, daysAgo(50), daysAgo(10));
        OrgResumeExperience x = new OrgResumeExperience();
        x.setOrgId(a.getId());
        x.setResumeId(r1.getId());
        x.setTitle("Senior Backend Engineer");
        x.setEmployer("Globex");
        x.setStartYear(2020);
        x.setSortOrder(0);
        experience.saveAndFlush(x);
        em.flush();
        em.clear();
    }

    // ---- fixtures ------------------------------------------------------------------------------------------------------

    private static Instant daysAgo(int d) {
        return Instant.now().minus(d, ChronoUnit.DAYS);
    }

    private ConsultantProfile consultant(Organization org, String name, String email) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(org.getId());
        c.setDisplayName(name);
        c.setEmail(email);
        c.setJobTitle("Engineer");
        c.setCreatedAt(daysAgo(120));
        c.setUpdatedAt(daysAgo(120));
        return consultants.saveAndFlush(c);
    }

    private void assign(ConsultantProfile c, OrgMember marketer) {
        MarketerAssignment m = new MarketerAssignment();
        m.setOrgId(c.getOrgId());
        m.setConsultantId(c.getId());
        m.setMarketerMemberId(marketer.getId());
        marketerAssignments.saveAndFlush(m);
    }

    private void skill(ConsultantProfile c, String name, boolean primary, int order) {
        ConsultantSkill s = new ConsultantSkill();
        s.setOrgId(c.getOrgId());
        s.setConsultantId(c.getId());
        s.setSkill(name);
        s.setPrimarySkill(primary);
        s.setSortOrder(order);
        skills.saveAndFlush(s);
    }

    private OrgResume resume(Organization org, ConsultantProfile c, String name, String file, String role, int version, boolean primary, String visibility, String approval, OrgMember owner, Instant created, Instant updated) {
        OrgResume r = new OrgResume();
        r.setOrgId(org.getId());
        r.setConsultantId(c.getId());
        r.setName(name);
        r.setFileName(file);
        r.setTargetRole(role);
        r.setVersionNo(version);
        r.setPrimaryForOrg(primary);
        r.setVisibility(visibility);
        r.setApprovalStatus(approval);
        r.setOwnerMemberId(owner.getId());
        r.setHeadline(role);
        r.setSummaryText("Builds dependable services for client engagements.");
        r.setFileSizeKb(512);
        r.setCreatedAt(created);
        r.setUpdatedAt(updated);
        if ("APPROVED".equals(approval)) {
            r.setApprovedAt(created.plus(1, ChronoUnit.DAYS));
            r.setApprovedByMemberId(owner.getId());
        }
        r = resumes.saveAndFlush(r);
        // updated_at is stamped on update by the entity; write the wanted value directly
        em.createNativeQuery("update org_resume set updated_at = ?1 where id = ?2").setParameter(1, java.sql.Timestamp.from(updated)).setParameter(2, r.getId()).executeUpdate();
        return r;
    }

    private static String url(Organization o) {
        return "/api/orgs/" + o.getId() + "/resumes";
    }

    private OrgResume fresh(OrgResume r) {
        em.flush();
        em.clear();
        return resumes.findByOrgIdAndId(r.getOrgId(), r.getId()).orElseThrow();
    }

    private static List<Long> itemIds(JsonNode page) {
        java.util.ArrayList<Long> out = new java.util.ArrayList<>();
        for (JsonNode n : page.path("items")) out.add(n.path("id").asLong());
        return out;
    }

    // ---- scope and the tenant wall -------------------------------------------------------------------------------------

    @Test
    void theOwnerSeesEveryResumeOfTheOrganizationAndNeverAnotherOnes() throws Exception {
        MvcResult res = call(login("owner"), get(url(a)));
        assertStatus(res, 200);
        assertThat(itemIds(json(res))).containsExactlyInAnyOrder(r1.getId(), r2.getId(), r3.getId());
        assertThat(res.getResponse().getHeader("X-Total-Count")).isEqualTo("3");
        JsonNode first = json(res).path("items").get(0);
        assertThat(first.path("consultant").path("name").asText()).isNotBlank();
        assertThat(first.path("owner").path("name").asText()).isNotBlank();
        assertThat(res.getResponse().getContentAsString()).doesNotContain("phone").doesNotContain("dateOfBirth");
    }

    @Test
    void aMarketingSpecialistSeesOnlyTheirAssignedConsultantsResumes() throws Exception {
        MvcResult res = call(login("spec"), get(url(a)));
        assertStatus(res, 200);
        assertThat(itemIds(json(res))).containsExactlyInAnyOrder(r1.getId(), r2.getId());
        assertGeneric404(call(login("spec"), get(url(a) + "/" + r3.getId())), "a resume outside the scope");
        assertStatus(call(login("spec"), get(url(a) + "/" + r1.getId())), 200);
    }

    @Test
    void aRoleWithoutTheViewKeyGetsTheGeneric404EverywhereAndOtherOrganizationsToo() throws Exception {
        assertGeneric404(call(login("hr"), get(url(a))), "list without the key");
        assertGeneric404(call(login("hr"), get(url(a) + "/counts")), "counts without the key");
        assertGeneric404(call(login("hr"), get(url(a) + "/" + r1.getId())), "detail without the key");
        assertGeneric404(call(login("hr"), get(url(a) + "/" + r1.getId() + "/export")), "export without the key");
        assertGeneric404(call(login("hr"), put(url(a) + "/" + r1.getId() + "/visibility"), "{\"visibility\":\"PUBLIC\"}"), "write without the key");
        // another organization's owner, on A's URL and on his own with A's ids
        assertGeneric404(call(login("bowner"), get(url(a))), "foreign list");
        assertGeneric404(call(login("bowner"), get(url(a) + "/" + r1.getId())), "foreign detail");
        assertGeneric404(call(login("bowner"), get(url(b) + "/" + r1.getId())), "A's id under B's org");
        assertGeneric404(call(login("bowner"), put(url(b) + "/" + r1.getId() + "/primary"), "{\"primary\":false}"), "A's id written under B's org");
        assertThat(fresh(r1).isPrimaryForOrg()).isTrue();
        assertStatus(call(login("bowner"), get(url(b) + "/" + rb.getId())), 200);
    }

    // ---- list: filters, tabs, sort ---------------------------------------------------------------------------------------

    @Test
    void tabsSearchFiltersAndSortWorkOnTheServer() throws Exception {
        String o = login("owner");
        assertThat(itemIds(json(call(o, get(url(a) + "?tab=pending"))))).containsExactly(r2.getId());
        assertThat(itemIds(json(call(o, get(url(a) + "?tab=recent"))))).containsExactlyInAnyOrder(r1.getId(), r2.getId());
        assertThat(itemIds(json(call(o, get(url(a) + "?q=java"))))).as("a skill of the consultant").containsExactlyInAnyOrder(r1.getId(), r2.getId());
        assertThat(itemIds(json(call(o, get(url(a)).param("q", "data analyst"))))).containsExactly(r3.getId());
        assertThat(itemIds(json(call(o, get(url(a) + "?visibility=PRIVATE"))))).containsExactly(r3.getId());
        assertThat(itemIds(json(call(o, get(url(a) + "?status=PENDING"))))).containsExactly(r2.getId());
        assertThat(itemIds(json(call(o, get(url(a) + "?primary=true"))))).containsExactly(r1.getId());
        assertThat(itemIds(json(call(o, get(url(a) + "?ownerId=" + owner.getId()))))).containsExactly(r3.getId());
        assertThat(itemIds(json(call(o, get(url(a) + "?consultantId=" + cp1.getId()))))).containsExactlyInAnyOrder(r1.getId(), r2.getId());
        assertThat(itemIds(json(call(o, get(url(a) + "?sort=name,asc"))))).containsExactly(r1.getId(), r2.getId(), r3.getId());
        assertThat(itemIds(json(call(o, get(url(a) + "?sort=modified,desc"))))).containsExactly(r2.getId(), r1.getId(), r3.getId());
        JsonNode paged = json(call(o, get(url(a) + "?size=2&page=1&sort=modified,desc")));
        assertThat(itemIds(paged)).containsExactly(r3.getId());
        assertThat(paged.path("total").asInt()).isEqualTo(3);
        assertThat(paged.path("hasNext").asBoolean()).isFalse();
    }

    @Test
    void badQueriesAre400Or422WithACodeNotAGuess() throws Exception {
        String o = login("owner");
        assertCode(call(o, get(url(a) + "?sort=salary,asc")), 400, "SORT_INVALID");
        assertStatus(call(o, get(url(a) + "?size=500")), 422);
        assertStatus(call(o, get(url(a) + "?tab=bogus")), 422);
        assertStatus(call(o, get(url(a) + "?visibility=SECRET")), 422);
        assertStatus(call(o, get(url(a) + "?q=a")), 422);
    }

    // ---- tiles -------------------------------------------------------------------------------------------------------------

    @Test
    void theTilesAreRebuiltFromRowsAndSayNothingWhereNoHistoryExists() throws Exception {
        JsonNode c = json(call(login("owner"), get(url(a) + "/counts")));
        assertThat(c.path("total").path("value").asInt()).isEqualTo(3);
        assertThat(c.path("total").path("previous").asInt()).as("created before 30 days ago").isEqualTo(2);
        assertThat(c.path("total").path("series")).hasSize(8);
        assertThat(c.path("primary").path("value").asInt()).isEqualTo(1);
        assertThat(c.path("primary").path("previous").isNull()).as("the primary flag is not versioned: no delta").isTrue();
        assertThat(c.path("primary").path("deltaPercent").isNull()).isTrue();
        assertThat(c.path("needsApproval").path("value").asInt()).isEqualTo(1);
        assertThat(c.path("needsApproval").path("previous").asInt()).as("r2 did not exist 30 days ago").isZero();
        assertThat(c.path("updatedThisWeek").path("value").asInt()).isEqualTo(2);
        assertThat(c.path("updatedThisWeek").path("previous").asInt()).isZero();
        // the specialist's tiles cover only their consultants
        JsonNode s = json(call(login("spec"), get(url(a) + "/counts")));
        assertThat(s.path("total").path("value").asInt()).isEqualTo(2);
        // approving the pending one moves the series' last point (needs approval 1 -> 0)
        assertStatus(call(login("owner"), post(url(a) + "/" + r2.getId() + "/decision"), "{\"decision\":\"APPROVE\"}"), 200);
        JsonNode after = json(call(login("owner"), get(url(a) + "/counts")));
        assertThat(after.path("needsApproval").path("value").asInt()).isZero();
    }

    // ---- detail -----------------------------------------------------------------------------------------------------------

    @Test
    void theDetailCarriesThePreviewDataAndWhatTheCallerMayDo() throws Exception {
        JsonNode d = json(call(login("owner"), get(url(a) + "/" + r1.getId())));
        assertThat(d.path("row").path("consultant").path("name").asText()).isEqualTo("Anika Khan");
        assertThat(d.path("preview").path("skills").get(0).asText()).as("primary skills first").isEqualTo("Java");
        assertThat(d.path("preview").path("experience").get(0).path("employer").asText()).isEqualTo("Globex");
        assertThat(d.path("preview").path("headline").asText()).isEqualTo("Backend Engineer");
        assertThat(d.path("actions").path("setPrimary").asBoolean()).isTrue();
        assertThat(d.path("actions").path("decide").asBoolean()).as("r1 is already approved but the owner may decide in principle").isTrue();
        JsonNode own = json(call(login("spec"), get(url(a) + "/" + r2.getId())));
        assertThat(own.path("actions").path("decide").asBoolean()).as("a specialist holds no approval key").isFalse();
        assertThat(own.path("actions").path("setPrimary").asBoolean()).isTrue();
    }

    // ---- primary ------------------------------------------------------------------------------------------------------------

    @Test
    void settingANewPrimaryClearsTheOldOneAndOnlyAnApprovedResumeQualifies() throws Exception {
        String o = login("owner");
        assertCode(call(o, put(url(a) + "/" + r2.getId() + "/primary"), "{\"primary\":true}"), 409, "NOT_APPROVED");
        assertStatus(call(o, post(url(a) + "/" + r2.getId() + "/decision"), "{\"decision\":\"APPROVE\"}"), 200);
        long before = auditCount(a, "RESUME_PRIMARY");
        MvcResult res = call(o, put(url(a) + "/" + r2.getId() + "/primary"), "{\"primary\":true}");
        assertStatus(res, 200);
        assertThat(json(res).path("previousPrimaryId").asLong()).isEqualTo(r1.getId());
        assertThat(json(res).path("detail").path("row").path("primary").asBoolean()).isTrue();
        assertThat(auditCount(a, "RESUME_PRIMARY") - before).isEqualTo(1);
        assertThat(fresh(r1).isPrimaryForOrg()).isFalse();
        assertThat(fresh(r2).isPrimaryForOrg()).isTrue();
        assertThat(resumes.findByOrgIdAndConsultantId(a.getId(), cp1.getId()).stream().filter(OrgResume::isPrimaryForOrg)).hasSize(1);
        // the same call again changes nothing and writes nothing
        assertStatus(call(o, put(url(a) + "/" + r2.getId() + "/primary"), "{\"primary\":true}"), 200);
        assertThat(auditCount(a, "RESUME_PRIMARY") - before).isEqualTo(1);
        // Undo: give the old one back
        assertStatus(call(o, put(url(a) + "/" + r1.getId() + "/primary"), "{\"primary\":true}"), 200);
        assertThat(fresh(r1).isPrimaryForOrg()).isTrue();
        assertThat(fresh(r2).isPrimaryForOrg()).isFalse();
        assertStatus(call(o, put(url(a) + "/" + r1.getId() + "/primary"), "{}"), 422);
    }

    @Test
    void aSpecialistMaySetPrimaryOnlyInsideTheirScope() throws Exception {
        assertStatus(call(login("spec"), put(url(a) + "/" + r1.getId() + "/primary"), "{\"primary\":false}"), 200);
        assertGeneric404(call(login("spec"), put(url(a) + "/" + r3.getId() + "/primary"), "{\"primary\":true}"), "outside the scope");
        assertThat(fresh(r3).isPrimaryForOrg()).isFalse();
    }

    // ---- visibility ---------------------------------------------------------------------------------------------------------

    @Test
    void visibilityChangesAreAuditedAndUndoable() throws Exception {
        String o = login("owner");
        long before = auditCount(a, "RESUME_VISIBILITY");
        MvcResult res = call(o, put(url(a) + "/" + r1.getId() + "/visibility"), "{\"visibility\":\"private\"}");
        assertStatus(res, 200);
        assertThat(json(res).path("previous").asText()).isEqualTo("INTERNAL");
        assertThat(fresh(r1).getVisibility()).isEqualTo("PRIVATE");
        assertThat(auditCount(a, "RESUME_VISIBILITY") - before).isEqualTo(1);
        assertStatus(call(o, put(url(a) + "/" + r1.getId() + "/visibility"), "{\"visibility\":\"INTERNAL\"}"), 200);
        assertThat(fresh(r1).getVisibility()).isEqualTo("INTERNAL");
        assertStatus(call(o, put(url(a) + "/" + r1.getId() + "/visibility"), "{\"visibility\":\"EVERYONE\"}"), 422);
        assertThat(auditCount(a, "RESUME_VISIBILITY") - before).isEqualTo(2);
    }

    // ---- approval ------------------------------------------------------------------------------------------------------------

    @Test
    void approvalNeedsTheKeyAndSomeoneOtherThanThePreparer() throws Exception {
        assertGeneric404(call(login("spec"), post(url(a) + "/" + r2.getId() + "/decision"), "{\"decision\":\"APPROVE\"}"), "no approval key");
        assertThat(fresh(r2).getApprovalStatus()).isEqualTo("PENDING");
        // the owner prepared r4 and so cannot approve it, the administrator can
        MvcResult created = call(login("owner"), post(url(a)), "{\"consultantId\":" + cp2.getId() + ",\"name\":\"Anita Rao Resume v2\"}", null, key());
        assertStatus(created, 201);
        long r4 = json(created).path("row").path("id").asLong();
        assertCode(call(login("owner"), post(url(a) + "/" + r4 + "/decision"), "{\"decision\":\"APPROVE\"}"), 422, "SELF_DECISION");
        MvcResult ok = call(login("admin"), post(url(a) + "/" + r4 + "/decision"), "{\"decision\":\"APPROVE\",\"note\":\"Looks right\"}");
        assertStatus(ok, 200);
        assertThat(json(ok).path("previous").asText()).isEqualTo("PENDING");
        OrgResume row = resumes.findByOrgIdAndId(a.getId(), r4).orElseThrow();
        assertThat(row.getApprovalStatus()).isEqualTo("APPROVED");
        assertThat(row.getApprovedByMemberId()).isEqualTo(admin.getId());
        assertThat(auditCount(a, "RESUME_APPROVE")).isEqualTo(1);
        assertCode(call(login("admin"), post(url(a) + "/" + r4 + "/decision"), "{\"decision\":\"REJECT\"}"), 409, "NOT_PENDING");
        // Undo = REOPEN; a reopened primary loses its flag
        assertStatus(call(login("admin"), post(url(a) + "/" + r1.getId() + "/decision"), "{\"decision\":\"REOPEN\"}"), 200);
        OrgResume reopened = fresh(r1);
        assertThat(reopened.getApprovalStatus()).isEqualTo("PENDING");
        assertThat(reopened.isPrimaryForOrg()).isFalse();
        assertThat(reopened.getApprovedAt()).isNull();
        assertStatus(call(login("admin"), post(url(a) + "/" + r2.getId() + "/decision"), "{\"decision\":\"REJECT\"}"), 200);
        assertThat(fresh(r2).getApprovalStatus()).isEqualTo("REJECTED");
        assertStatus(call(login("admin"), post(url(a) + "/" + r2.getId() + "/decision"), "{\"decision\":\"MAYBE\"}"), 422);
    }

    // ---- create -------------------------------------------------------------------------------------------------------------

    @Test
    void createRecordsMetadataIdempotentlyAndNeverSensitiveText() throws Exception {
        String body = "{\"consultantId\":" + cp1.getId() + ",\"name\":\"Anika Khan - Platform\",\"fileName\":\"anika_platform.pdf\",\"targetRole\":\"Platform Engineer\"," +
            "\"headline\":\"Platform Engineer\",\"summary\":\"Runs build platforms.\",\"visibility\":\"PUBLIC\"," +
            "\"experience\":[{\"title\":\"Platform Engineer\",\"employer\":\"Initech\",\"startYear\":2021,\"endYear\":null}]}";
        String k = key();
        long before = resumes.countByOrgId(a.getId());
        MvcResult one = call(login("spec"), post(url(a)), body, null, k);
        assertStatus(one, 201);
        MvcResult again = call(login("spec"), post(url(a)), body, null, k);
        assertStatus(again, 201);
        assertThat(again.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(resumes.countByOrgId(a.getId()) - before).as("the same key creates once").isEqualTo(1);
        JsonNode row = json(one).path("row");
        assertThat(row.path("approvalStatus").asText()).isEqualTo("PENDING");
        assertThat(row.path("version").asInt()).isEqualTo(1);
        assertThat(row.path("primary").asBoolean()).isFalse();
        assertThat(row.path("owner").path("memberId").asLong()).isEqualTo(mktSpec.getId());
        assertThat(json(one).path("preview").path("experience")).hasSize(1);
        assertThat(auditCount(a, "RESUME_CREATE")).isEqualTo(1);

        assertCode(call(login("spec"), post(url(a)), body, null, null), 400, "IDEMPOTENCY_KEY_MISSING");
        String ssn = body.replace("Runs build platforms.", "SSN 123-45-6789");
        assertCode(call(login("spec"), post(url(a)), ssn, null, key()), 422, "SENSITIVE_CONTENT");
        assertStatus(call(login("spec"), post(url(a)), body.replace("anika_platform.pdf", "../etc/passwd"), null, key()), 422);
        assertStatus(call(login("spec"), post(url(a)), body.replace("Anika Khan - Platform", "<script>x</script>"), null, key()), 422);
        assertStatus(call(login("spec"), post(url(a)), body.replace("\"name\":\"Anika Khan - Platform\",", ""), null, key()), 422);
        assertThat(resumes.countByOrgId(a.getId()) - before).isEqualTo(1);
    }

    @Test
    void createRespectsTheConsultantScopeAndTheTenantWall() throws Exception {
        String forCp2 = "{\"consultantId\":" + cp2.getId() + ",\"name\":\"Nope\"}";
        assertGeneric404(call(login("spec"), post(url(a)), forCp2, null, key()), "consultant outside the scope");
        String forB = "{\"consultantId\":" + cpB.getId() + ",\"name\":\"Nope\"}";
        assertGeneric404(call(login("owner"), post(url(a)), forB, null, key()), "another organization's consultant");
        assertGeneric404(call(login("hr"), post(url(a)), forCp2, null, key()), "no key");
        assertThat(resumes.countByOrgId(a.getId())).isEqualTo(3);
    }

    @Test
    void thePickerListsOnlyConsultantsTheCallerMayAddFor() throws Exception {
        JsonNode all = json(call(login("owner"), get(url(a) + "/consultants")));
        assertThat(all).hasSize(2);
        JsonNode mine = json(call(login("spec"), get(url(a) + "/consultants")));
        assertThat(mine).hasSize(1);
        assertThat(mine.get(0).path("name").asText()).isEqualTo("Anika Khan");
        assertGeneric404(call(login("hr"), get(url(a) + "/consultants")), "no key");
    }

    // ---- bulk ---------------------------------------------------------------------------------------------------------------

    @Test
    void bulkAppliesWhatItCanSkipsTheRestAndReportsHowToUndo() throws Exception {
        String o = login("owner");
        MvcResult res = call(o, post(url(a) + "/bulk"), "{\"ids\":[" + r1.getId() + "," + r3.getId() + "," + rb.getId() + "],\"action\":\"VISIBILITY\",\"visibility\":\"PUBLIC\"}", null, key());
        assertStatus(res, 200);
        JsonNode j = json(res);
        assertThat(j.path("applied").asInt()).isEqualTo(2);
        assertThat(j.path("skipped").asInt()).isEqualTo(1);
        assertThat(j.path("results").get(0).path("previous").asText()).isEqualTo("INTERNAL");
        assertThat(j.path("results").get(2).path("reason").asText()).as("another organization's id is just not found").isEqualTo("NOT_FOUND");
        assertThat(fresh(r1).getVisibility()).isEqualTo("PUBLIC");
        assertThat(fresh(r3).getVisibility()).isEqualTo("PUBLIC");
        assertThat(fresh(rb).getVisibility()).as("B's row is untouched").isEqualTo("INTERNAL");
        assertThat(auditCount(a, "RESUME_BULK")).isEqualTo(1);

        MvcResult approve = call(login("admin"), post(url(a) + "/bulk"), "{\"ids\":[" + r2.getId() + "," + r1.getId() + "],\"action\":\"APPROVE\"}", null, key());
        assertStatus(approve, 200);
        assertThat(json(approve).path("applied").asInt()).isEqualTo(1);
        assertThat(json(approve).path("results").get(1).path("reason").asText()).isEqualTo("NOT_PENDING");
        assertThat(fresh(r2).getApprovalStatus()).isEqualTo("APPROVED");
        assertCode(call(o, post(url(a) + "/bulk"), "{\"ids\":[" + r1.getId() + "],\"action\":\"VISIBILITY\",\"visibility\":\"PUBLIC\"}", null, null), 400, "IDEMPOTENCY_KEY_MISSING");
        assertStatus(call(o, post(url(a) + "/bulk"), "{\"ids\":[],\"action\":\"APPROVE\"}", null, key()), 422);
        assertGeneric404(call(login("spec"), post(url(a) + "/bulk"), "{\"ids\":[" + r2.getId() + "],\"action\":\"APPROVE\"}", null, key()), "no approval key");
    }

    // ---- exports ------------------------------------------------------------------------------------------------------------

    @Test
    void downloadAndPrintAreGeneratedFromTheStructuredResumeAndAudited() throws Exception {
        long before = auditCount(a, "RESUME_EXPORT");
        MvcResult txt = call(login("spec"), get(url(a) + "/" + r1.getId() + "/export?format=txt"));
        assertStatus(txt, 200);
        assertThat(txt.getResponse().getContentType()).startsWith("text/plain");
        assertThat(txt.getResponse().getHeader("Content-Disposition")).contains("attachment").contains("anika_khan_resume.txt");
        String text = txt.getResponse().getContentAsString();
        assertThat(text).contains("Anika Khan").contains("KEY SKILLS").contains("Java, Spring").contains("Senior Backend Engineer, Globex (2020 - Present)");
        MvcResult html = call(login("spec"), get(url(a) + "/" + r1.getId() + "/export?format=html"));
        assertStatus(html, 200);
        assertThat(html.getResponse().getContentType()).startsWith("text/html");
        assertThat(html.getResponse().getContentAsString()).contains("<h1>Anika Khan</h1>").doesNotContain("<script");
        assertThat(html.getResponse().getHeader("Content-Security-Policy")).contains("sandbox");
        assertThat(auditCount(a, "RESUME_EXPORT") - before).isEqualTo(2);
        assertGeneric404(call(login("spec"), get(url(a) + "/" + r3.getId() + "/export")), "outside the scope");
        assertGeneric404(call(login("bowner"), get(url(b) + "/" + r1.getId() + "/export")), "another organization's resume");
        assertStatus(call(login("spec"), get(url(a) + "/" + r1.getId() + "/export?format=pdf")), 422);
    }

    @Test
    void filterOptionsListDepartmentsAndOwnersInScope() throws Exception {
        JsonNode f = json(call(login("owner"), get(url(a) + "/filters")));
        assertThat(f.path("owners")).hasSize(2);
        assertThat(f.path("departments")).isEmpty();
        assertThat(json(call(login("spec"), get(url(a) + "/filters"))).path("owners")).hasSize(1);
    }
}
