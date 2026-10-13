package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.consultantws.CwsResumeActivity;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.OrgResumeExperience;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.consultantws.CwsResumeActivityRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
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
 * The Consultant workspace My Resumes through the real chain on real rows: {@code /api/orgs/{orgId}/me-workspace/resumes}. Every
 * number is asserted against rows the test wrote, a consultant only ever sees and changes their own resumes, and every refusal of
 * access is the generic 404 (a value the product never collects is the shared 422 SENSITIVE_CONTENT).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConsultantResumesResourceIT {

    private static final String WHO = "cws-resumes-it";

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
    @Autowired private ConsultantSkillRepository skills;
    @Autowired private OrgResumeRepository resumes;
    @Autowired private OrgResumeExperienceRepository experience;
    @Autowired private CwsResumeActivityRepository activity;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ConsultantProfile cEmpty;
    private ConsultantProfile cb;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cwsr-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cwsr-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);
        staff(a, "cwsr-a-owner", OrgRole.OWNER);
        staff(a, "cwsr-a-marketer", OrgRole.MARKETER);
        staff(b, "cwsr-b-owner", OrgRole.OWNER);
        c1 = consultant(a, "cwsr-a-c1", "Casey One", true);
        c2 = consultant(a, "cwsr-a-c2", "Robin Two", true);
        cEmpty = consultant(a, "cwsr-a-empty", "Empty Person", true);
        consultant(a, "cwsr-a-noprofile", "Nobody", false);
        cb = consultant(b, "cwsr-b-c1", "Bee Consultant", true);
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
        p.setAvailabilitySince(LocalDate.now(ZoneOffset.UTC));
        p.setProfileCompleteness(78);
        return profiles.saveAndFlush(p);
    }

    private OrgResume resume(ConsultantProfile c, String name, boolean primary, String visibility, int version, int createdDaysAgo, int updatedDaysAgo, String headline, String summary) {
        OrgResume r = new OrgResume();
        r.setOrgId(c.getOrgId());
        r.setConsultantId(c.getId());
        r.setMemberId(c.getMemberId());
        r.setName(name);
        r.setTargetRole("Role of " + name);
        r.setPrimaryForOrg(primary);
        r.setVisibility(visibility);
        r.setVersionNo(version);
        r.setHeadline(headline);
        r.setSummaryText(summary);
        r.setCreatedAt(now.minus(Duration.ofDays(createdDaysAgo)));
        r.setUpdatedAt(now.minus(Duration.ofDays(updatedDaysAgo)));
        return resumes.saveAndFlush(r);
    }

    private void exp(OrgResume r, String title, String employer, int order) {
        OrgResumeExperience x = new OrgResumeExperience();
        x.setOrgId(r.getOrgId());
        x.setResumeId(r.getId());
        x.setTitle(title);
        x.setEmployer(employer);
        x.setStartYear(2019);
        x.setSortOrder(order);
        experience.saveAndFlush(x);
    }

    private void act(ConsultantProfile c, OrgResume r, String kind, int daysAgo) {
        CwsResumeActivity e = new CwsResumeActivity();
        e.setOrgId(c.getOrgId());
        e.setConsultantId(c.getId());
        e.setResumeId(r.getId());
        e.setKind(kind);
        e.setOccurredAt(now.minus(Duration.ofDays(daysAgo)));
        activity.saveAndFlush(e);
    }

    private OrgResume r1;
    private OrgResume r2;
    private OrgResume rHidden;

    /** c1: R1 primary public v3 (60 days old, updated yesterday, content), R2 team v2 (5 days old, no headline). 4 views (1 older than 30 days), 1 download. */
    private void seedC1() {
        r1 = resume(c1, "Primary Resume", true, "PUBLIC", 3, 60, 1, "Full Stack", "Builds things.");
        r2 = resume(c1, "Second Resume", false, "INTERNAL", 2, 5, 5, null, null);
        exp(r1, "Lead", "Acme", 0);
        exp(r1, "Dev", "Globex", 1);
        act(c1, r1, "VIEWED", 2);
        act(c1, r1, "VIEWED", 3);
        act(c1, r2, "VIEWED", 4);
        act(c1, r1, "VIEWED", 40);
        act(c1, r1, "DOWNLOADED", 1);
    }

    private void seedC2() {
        rHidden = resume(c2, "Hidden Resume", true, "PUBLIC", 9, 30, 1, "Secret Headline", "Secret summary.");
        act(c2, rHidden, "VIEWED", 1);
        act(c2, rHidden, "SHARED", 1);
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private MvcResult send(String login, MockHttpServletRequestBuilder req) throws Exception {
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private String base(Organization org) {
        return "/api/orgs/" + org.getId() + "/me-workspace/resumes";
    }

    private MvcResult page(String login, Organization org) throws Exception {
        return send(login, get(base(org)));
    }

    private JsonNode pageOk(String login, Organization org) throws Exception {
        MvcResult r = page(login, org);
        assertThat(r.getResponse().getStatus()).as(login + " -> " + r.getResponse().getContentAsString()).isEqualTo(200);
        return om.readTree(r.getResponse().getContentAsString());
    }

    private MvcResult postTo(String login, Organization org, long id, String path, String body) throws Exception {
        MockHttpServletRequestBuilder b2 = post(base(org) + "/" + id + path);
        if (body != null) b2.content(body);
        return send(login, b2);
    }

    private MvcResult patchTo(String login, Organization org, long id, String body) throws Exception {
        return send(login, patch(base(org) + "/" + id).content(body));
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
    void aConsultantGetsTheirTilesResumesStrengthImprovementsAndActivityFromTheirOwnRows() throws Exception {
        seedC1();
        skills(c1, 2);
        JsonNode p = pageOk("cwsr-a-c1", a);

        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(p.path("me").path("consultantId").asLong()).isEqualTo(c1.getId());
        assertThat(p.path("me").path("name").asText()).isEqualTo("Casey One");

        JsonNode t = p.path("tiles");
        assertThat(t.path("totalResumes").path("value").asLong()).isEqualTo(2);
        assertThat(t.path("totalResumes").path("previous").asLong()).as("one existed 30 days ago").isEqualTo(1);
        assertThat(t.path("totalResumes").path("delta").asLong()).isEqualTo(1);
        assertThat(t.path("totalResumes").path("deltaPct").asDouble()).isEqualTo(100.0);
        assertThat(t.path("primary").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("primary").path("title").asText()).isEqualTo("Primary Resume");
        assertThat(t.path("totalViews").path("value").asLong()).isEqualTo(4);
        assertThat(t.path("totalViews").path("previous").asLong()).isEqualTo(1);
        assertThat(t.path("totalViews").path("delta").asLong()).isEqualTo(3);
        assertThat(t.path("totalViews").path("deltaPct").asDouble()).isEqualTo(300.0);
        assertThat(t.path("totalViews").path("sparkline")).hasSize(6);
        assertThat(t.path("totalViews").path("sparkline").get(5).asLong()).isEqualTo(4);
        assertThat(t.path("totalViews").path("sparkline").get(0).asLong()).as("the view 40 days ago is counted in the earliest buckets only").isEqualTo(1);
        assertThat(t.path("totalDownloads").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("totalDownloads").get("deltaPct").isNull()).as("nothing to compare against, so no made-up percentage").isTrue();
        assertThat(t.path("timesShared").path("value").asLong()).isZero();

        JsonNode rows = p.path("resumes");
        assertThat(texts(rows, "title")).containsExactly("Primary Resume", "Second Resume");
        assertThat(rows.get(0).path("primary").asBoolean()).isTrue();
        assertThat(rows.get(0).path("visibility").asText()).isEqualTo("PUBLIC");
        assertThat(rows.get(0).path("versionNo").asInt()).isEqualTo(3);
        assertThat(rows.get(0).path("targetRole").asText()).isEqualTo("Role of Primary Resume");
        assertThat(rows.get(1).path("visibility").asText()).isEqualTo("INTERNAL");
        assertThat(rows.get(1).path("primary").asBoolean()).isFalse();

        JsonNode s = p.path("resumeStrength");
        assertThat(s.path("percent").asInt()).isEqualTo(78);
        assertThat(s.path("hasResume").asBoolean()).isTrue();
        assertThat(s.path("checks")).hasSize(5);
        assertThat(checkDone(s, "contact")).isTrue();
        assertThat(checkDone(s, "experience")).isTrue();
        assertThat(checkDone(s, "skills")).as("only 2 skills").isFalse();
        assertThat(checkDone(s, "certifications")).isFalse();
        assertThat(checkDone(s, "summary")).isTrue();

        assertThat(texts(p.path("improvements"), "key")).containsExactly("skills", "headline", "certifications");
        assertThat(p.path("improvements").get(0).path("action").asText()).isEqualTo("link");
        assertThat(p.path("improvements").get(0).path("href").asText()).isEqualTo("/w/consultant/profile");

        JsonNode recent = p.path("recentActivity");
        assertThat(recent.size()).isLessThanOrEqualTo(6);
        assertThat(texts(recent, "kind").get(0)).as("most recent first: the download yesterday").isIn("DOWNLOADED", "UPDATED");
        assertThat(texts(recent, "kind")).contains("VIEWED", "DOWNLOADED", "UPDATED");
        assertThat(recent.toString()).doesNotContain("Hidden");
    }

    private boolean checkDone(JsonNode strength, String key) {
        for (JsonNode c : strength.path("checks")) if (key.equals(c.path("key").asText())) return c.path("done").asBoolean();
        throw new AssertionError("no check " + key);
    }

    private void skills(ConsultantProfile c, int n) {
        for (int i = 0; i < n; i++) {
            ConsultantSkill s = new ConsultantSkill();
            s.setOrgId(c.getOrgId());
            s.setConsultantId(c.getId());
            s.setSkill("Skill" + i);
            s.setPrimarySkill(i == 0);
            s.setSortOrder(i);
            skills.saveAndFlush(s);
        }
    }

    @Test
    void withoutAPrimaryTheImprovementOffersToChooseOne() throws Exception {
        r1 = resume(c1, "Only Resume", false, "INTERNAL", 1, 10, 10, "H", "S");
        JsonNode p = pageOk("cwsr-a-c1", a);
        JsonNode first = p.path("improvements").get(0);
        assertThat(first.path("key").asText()).isEqualTo("primary");
        assertThat(first.path("action").asText()).isEqualTo("set-primary");
        assertThat(first.path("resumeId").asLong()).isEqualTo(r1.getId());
        assertThat(p.path("tiles").path("primary").path("value").asLong()).isZero();
        assertThat(p.path("tiles").path("primary").get("title").isNull()).isTrue();
    }

    // ---- (b) own rows only ----------------------------------------------------------------------------------------

    @Test
    void aConsultantNeverSeesAnotherConsultantsResumesOrActivityInTheSameOrg() throws Exception {
        seedC1();
        seedC2();
        MvcResult r = page("cwsr-a-c1", a);
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(body).doesNotContain("Hidden").doesNotContain("Secret").doesNotContain("Robin Two");
        assertThat(om.readTree(body).path("tiles").path("timesShared").path("value").asLong()).isZero();

        JsonNode p2 = pageOk("cwsr-a-c2", a);
        assertThat(texts(p2.path("resumes"), "title")).containsExactly("Hidden Resume");
        assertThat(p2.path("tiles").path("timesShared").path("value").asLong()).isEqualTo(1);
        assertThat(p2.toString()).doesNotContain("Primary Resume").doesNotContain("Casey One");
    }

    // ---- refusals -------------------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationNonConsultantsAndConsultantsWithoutAProfileGetTheGeneric404() throws Exception {
        seedC1();
        assertGeneric404(page("cwsr-b-owner", a), "another org's owner");
        assertGeneric404(page("cwsr-b-c1", a), "another org's consultant");
        assertGeneric404(page("ghost-login", a), "unknown login");
        assertGeneric404(send("cwsr-a-c1", get("/api/orgs/999999999/me-workspace/resumes")), "unknown org");
        assertGeneric404(page("cwsr-a-owner", a), "owner lacks opportunities.respond");
        assertGeneric404(page("cwsr-a-marketer", a), "marketer lacks opportunities.respond");
        assertGeneric404(page("cwsr-a-noprofile", a), "consultant seat without a profile");
        // the same wall on every write
        assertGeneric404(postTo("cwsr-a-marketer", a, r1.getId(), "/primary", null), "marketer set primary");
        assertGeneric404(patchTo("cwsr-a-marketer", a, r1.getId(), "{\"name\":\"X\"}"), "marketer rename");
        assertGeneric404(postTo("cwsr-a-owner", a, r1.getId(), "/duplicate", null), "owner duplicate");
        assertGeneric404(postTo("cwsr-b-c1", a, r1.getId(), "/activity", "{\"kind\":\"VIEWED\"}"), "other org consultant activity");
        assertGeneric404(send("cwsr-a-marketer", get(base(a) + "/" + r1.getId() + "/preview")), "marketer preview");
        flags(true, false);
        assertGeneric404(page("cwsr-a-c1", a), "roles flag off");
        flags(false, true);
        assertGeneric404(page("cwsr-a-c1", a), "master flag off");
    }

    // ---- empty consultant -----------------------------------------------------------------------------------------

    @Test
    void aConsultantWithNoResumesGetsZerosAndEmptyListsNeverNulls() throws Exception {
        JsonNode p = pageOk("cwsr-a-empty", a);
        for (String tile : List.of("totalResumes", "totalViews", "totalDownloads", "timesShared")) {
            JsonNode t = p.path("tiles").path(tile);
            assertThat(t.path("value").asLong()).as(tile).isZero();
            assertThat(t.get("deltaPct").isNull()).as(tile).isTrue();
            assertThat(t.path("sparkline")).hasSize(6);
        }
        assertThat(p.path("tiles").path("primary").path("value").asLong()).isZero();
        for (String list : List.of("resumes", "improvements", "recentActivity")) {
            assertThat(p.get(list).isArray()).as(list).isTrue();
        }
        assertThat(p.get("resumes")).isEmpty();
        assertThat(p.get("recentActivity")).isEmpty();
        assertThat(p.path("resumeStrength").path("hasResume").asBoolean()).isFalse();
        assertThat(p.path("resumeStrength").path("checks")).hasSize(5);
        assertThat(cEmpty.getId()).isNotNull();
    }

    // ---- preview --------------------------------------------------------------------------------------------------

    @Test
    void previewReturnsTheStructuredFieldsOfAnOwnResumeOnly() throws Exception {
        seedC1();
        seedC2();
        skills(c1, 3);
        MvcResult r = send("cwsr-a-c1", get(base(a) + "/" + r1.getId() + "/preview"));
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        JsonNode p = om.readTree(r.getResponse().getContentAsString());
        assertThat(p.path("title").asText()).isEqualTo("Primary Resume");
        assertThat(p.path("name").asText()).isEqualTo("Casey One");
        assertThat(p.path("headline").asText()).isEqualTo("Full Stack");
        assertThat(p.path("summary").asText()).isEqualTo("Builds things.");
        assertThat(texts(p.path("skills"), "")).hasSize(3);
        assertThat(p.path("skills").get(0).asText()).as("primary skill first").isEqualTo("Skill0");
        assertThat(texts(p.path("experience"), "title")).containsExactly("Lead", "Dev");
        assertGeneric404(send("cwsr-a-c1", get(base(a) + "/" + rHidden.getId() + "/preview")), "another consultant's resume");
        assertGeneric404(send("cwsr-a-c1", get(base(a) + "/999999999/preview")), "unknown resume");
        OrgResume bRes = resume(cb, "B Resume", true, "PUBLIC", 1, 5, 5, "H", "S");
        assertGeneric404(send("cwsr-a-c1", get(base(a) + "/" + bRes.getId() + "/preview")), "another organization's resume");
    }

    // ---- writes ---------------------------------------------------------------------------------------------------

    @Test
    void settingPrimaryClearsTheOldOneAndOnlyTouchesOwnResumes() throws Exception {
        seedC1();
        seedC2();
        MvcResult r = postTo("cwsr-a-c1", a, r2.getId(), "/primary", null);
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(om.readTree(r.getResponse().getContentAsString()).path("primary").asBoolean()).isTrue();
        resumes.flush();
        assertThat(resumes.findByOrgIdAndId(a.getId(), r2.getId()).orElseThrow().isPrimaryForOrg()).isTrue();
        assertThat(resumes.findByOrgIdAndId(a.getId(), r1.getId()).orElseThrow().isPrimaryForOrg()).isFalse();
        assertThat(resumes.findByOrgIdAndId(a.getId(), rHidden.getId()).orElseThrow().isPrimaryForOrg()).as("another consultant's primary is untouched").isTrue();
        JsonNode p = pageOk("cwsr-a-c1", a);
        assertThat(p.path("tiles").path("primary").path("title").asText()).isEqualTo("Second Resume");
        // doing it again is harmless
        assertThat(postTo("cwsr-a-c1", a, r2.getId(), "/primary", null).getResponse().getStatus()).isEqualTo(200);
        // someone else's resume, another org's resume, an unknown id
        assertGeneric404(postTo("cwsr-a-c1", a, rHidden.getId(), "/primary", null), "another consultant's resume");
        assertGeneric404(postTo("cwsr-a-c1", a, 999999999L, "/primary", null), "unknown resume");
        OrgResume bRes = resume(cb, "B Resume", false, "PUBLIC", 1, 5, 5, "H", "S");
        assertGeneric404(postTo("cwsr-a-c1", a, bRes.getId(), "/primary", null), "another organization's resume");
        assertThat(resumes.findByOrgIdAndId(b.getId(), bRes.getId()).orElseThrow().isPrimaryForOrg()).isFalse();
    }

    @Test
    void renameAndVisibilityAreValidatedScannedForSensitiveDataAndOwnOnly() throws Exception {
        seedC1();
        seedC2();
        MvcResult ok = patchTo("cwsr-a-c1", a, r2.getId(), "{\"name\":\"  Renamed   Resume \",\"visibility\":\"private\"}");
        assertThat(ok.getResponse().getStatus()).as(ok.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode row = om.readTree(ok.getResponse().getContentAsString());
        assertThat(row.path("title").asText()).isEqualTo("Renamed Resume");
        assertThat(row.path("visibility").asText()).isEqualTo("PRIVATE");
        assertThat(row.path("approvalStatus").asText()).as("metadata only: approval does not change").isEqualTo("APPROVED");

        // validation
        assertThat(patchTo("cwsr-a-c1", a, r2.getId(), "{}").getResponse().getStatus()).as("nothing to change").isEqualTo(422);
        assertThat(patchTo("cwsr-a-c1", a, r2.getId(), "{\"visibility\":\"EVERYONE\"}").getResponse().getStatus()).isEqualTo(422);
        assertThat(patchTo("cwsr-a-c1", a, r2.getId(), "{\"name\":\"   \"}").getResponse().getStatus()).isEqualTo(422);
        assertThat(patchTo("cwsr-a-c1", a, r2.getId(), "{\"name\":\"" + "x".repeat(201) + "\"}").getResponse().getStatus()).isEqualTo(422);
        assertThat(patchTo("cwsr-a-c1", a, r2.getId(), "{\"name\":\"<b>x</b>\"}").getResponse().getStatus()).isEqualTo(422);

        // the never-collected values
        MvcResult pii = patchTo("cwsr-a-c1", a, r2.getId(), "{\"name\":\"My SSN 123-45-6789\"}");
        assertThat(pii.getResponse().getStatus()).isEqualTo(422);
        assertThat(pii.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        resumes.flush();
        assertThat(resumes.findByOrgIdAndId(a.getId(), r2.getId()).orElseThrow().getName()).as("nothing was stored").isEqualTo("Renamed Resume");

        // cross-tenant
        assertGeneric404(patchTo("cwsr-a-c1", a, rHidden.getId(), "{\"name\":\"Hijacked\"}"), "another consultant's resume");
        assertThat(resumes.findByOrgIdAndId(a.getId(), rHidden.getId()).orElseThrow().getName()).isEqualTo("Hidden Resume");
        OrgResume bRes = resume(cb, "B Resume", false, "PUBLIC", 1, 5, 5, "H", "S");
        assertGeneric404(patchTo("cwsr-a-c1", a, bRes.getId(), "{\"name\":\"Hijacked\"}"), "another organization's resume");
    }

    @Test
    void recordingActivityFeedsTheTilesAndValidatesTheKind() throws Exception {
        seedC1();
        seedC2();
        long viewsBefore = activity.countByOrgIdAndConsultantId(a.getId(), c1.getId());
        assertThat(postTo("cwsr-a-c1", a, r1.getId(), "/activity", "{\"kind\":\"SHARED\"}").getResponse().getStatus()).isEqualTo(204);
        assertThat(postTo("cwsr-a-c1", a, r1.getId(), "/activity", "{\"kind\":\"viewed\"}").getResponse().getStatus()).isEqualTo(204);
        assertThat(activity.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isEqualTo(viewsBefore + 2);
        JsonNode p = pageOk("cwsr-a-c1", a);
        assertThat(p.path("tiles").path("timesShared").path("value").asLong()).isEqualTo(1);
        assertThat(p.path("tiles").path("totalViews").path("value").asLong()).isEqualTo(5);
        assertThat(p.path("recentActivity").get(0).path("kind").asText()).isIn("SHARED", "VIEWED");

        assertThat(postTo("cwsr-a-c1", a, r1.getId(), "/activity", "{\"kind\":\"DELETED\"}").getResponse().getStatus()).isEqualTo(422);
        assertThat(postTo("cwsr-a-c1", a, r1.getId(), "/activity", "{}").getResponse().getStatus()).isEqualTo(422);
        assertGeneric404(postTo("cwsr-a-c1", a, rHidden.getId(), "/activity", "{\"kind\":\"VIEWED\"}"), "another consultant's resume");
        assertThat(activity.countByOrgIdAndConsultantId(a.getId(), c2.getId())).as("c2's activity is unchanged").isEqualTo(2);
    }

    @Test
    void duplicateMakesAPrivatePendingNonPrimaryCopyAtTheNextVersionWithItsExperience() throws Exception {
        seedC1();
        seedC2();
        MvcResult r = postTo("cwsr-a-c1", a, r1.getId(), "/duplicate", null);
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(201);
        JsonNode row = om.readTree(r.getResponse().getContentAsString());
        assertThat(row.path("title").asText()).isEqualTo("Primary Resume (copy)");
        assertThat(row.path("versionNo").asInt()).isEqualTo(4);
        assertThat(row.path("visibility").asText()).isEqualTo("PRIVATE");
        assertThat(row.path("primary").asBoolean()).isFalse();
        assertThat(row.path("approvalStatus").asText()).isEqualTo("PENDING");
        long newId = row.path("id").asLong();
        assertThat(newId).isNotEqualTo(r1.getId());
        OrgResume copy = resumes.findByOrgIdAndId(a.getId(), newId).orElseThrow();
        assertThat(copy.getConsultantId()).isEqualTo(c1.getId());
        assertThat(copy.getHeadline()).isEqualTo("Full Stack");
        assertThat(copy.getSummaryText()).isEqualTo("Builds things.");
        assertThat(experience.findByOrgIdAndResumeIdOrderBySortOrderAsc(a.getId(), newId)).extracting(OrgResumeExperience::getTitle).containsExactly("Lead", "Dev");
        assertThat(resumes.findByOrgIdAndId(a.getId(), r1.getId()).orElseThrow().isPrimaryForOrg()).as("the source keeps being primary").isTrue();
        assertThat(texts(pageOk("cwsr-a-c1", a).path("resumes"), "title")).hasSize(3);

        assertGeneric404(postTo("cwsr-a-c1", a, rHidden.getId(), "/duplicate", null), "another consultant's resume");
        assertThat(resumes.findByOrgIdAndConsultantId(a.getId(), c2.getId())).hasSize(1);
    }
}
