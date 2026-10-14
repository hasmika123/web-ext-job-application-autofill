package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.consultantws.CwsCertification;
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
import com.dossier.api.repository.ent.consultantws.CwsCertificationRepository;
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
 * My Career Profile through the real chain on real rows: {@code /api/orgs/{orgId}/me-workspace/profile/**}. Own data is correct,
 * a second consultant's data never leaks, every refusal is the generic 404, and every write is checked for success, validation,
 * PII rejection and cross-tenant / cross-consultant 404.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConsultantProfileResourceIT {

    private static final String WHO = "cws-profile-it";

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
    @Autowired private CwsCertificationRepository certs;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private final LocalDate today = LocalDate.now(ZoneOffset.UTC);

    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ConsultantProfile bc;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cwp-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cwp-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);

        staff(a, "cwp-a-owner", OrgRole.OWNER);
        staff(a, "cwp-a-marketer", OrgRole.MARKETER);
        staff(b, "cwp-b-owner", OrgRole.OWNER);

        c1 = consultant(a, "cwp-a-c1", "Casey One", true);
        c2 = consultant(a, "cwp-a-c2", "Robin Two", true);
        consultant(a, "cwp-a-noprofile", "Nobody", false);
        bc = consultant(b, "cwp-b-c1", "Bee Consultant", true);
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
        p.setYearsExperience(8);
        p.setLocationLabel("Austin, TX");
        p.setProfileCompleteness(78);
        return profiles.saveAndFlush(p);
    }

    private void skill(ConsultantProfile c, String name, int order) {
        ConsultantSkill s = new ConsultantSkill();
        s.setOrgId(c.getOrgId());
        s.setConsultantId(c.getId());
        s.setSkill(name);
        s.setPrimarySkill(true);
        s.setSortOrder(order);
        skills.saveAndFlush(s);
    }

    private OrgResume resume(ConsultantProfile c, String name, boolean primary, String summary) {
        OrgResume r = new OrgResume();
        r.setOrgId(c.getOrgId());
        r.setConsultantId(c.getId());
        r.setName(name);
        r.setPrimaryForOrg(primary);
        r.setSummaryText(summary);
        return resumes.saveAndFlush(r);
    }

    private void exp(OrgResume r, String title, String employer, int start, Integer end, int order) {
        OrgResumeExperience e = new OrgResumeExperience();
        e.setOrgId(r.getOrgId());
        e.setResumeId(r.getId());
        e.setTitle(title);
        e.setEmployer(employer);
        e.setStartYear(start);
        e.setEndYear(end);
        e.setSortOrder(order);
        experience.saveAndFlush(e);
    }

    private CwsCertification cert(ConsultantProfile c, String name, LocalDate on) {
        CwsCertification x = new CwsCertification();
        x.setOrgId(c.getOrgId());
        x.setConsultantId(c.getId());
        x.setName(name);
        x.setIssuer("Issuer");
        x.setIssuedOn(on);
        return certs.saveAndFlush(x);
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private static String path(long orgId, String tail) {
        return "/api/orgs/" + orgId + "/me-workspace/profile" + tail;
    }

    private MvcResult send(MockHttpServletRequestBuilder req, String login, String body) throws Exception {
        if (body != null) req = req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private MvcResult getAs(String login, long orgId) throws Exception {
        return send(get(path(orgId, "")), login, null);
    }

    private JsonNode ok(MvcResult r, String what) throws Exception {
        assertThat(r.getResponse().getStatus()).as(what + " -> " + r.getResponse().getContentAsString()).isEqualTo(200);
        return om.readTree(r.getResponse().getContentAsString());
    }

    private JsonNode profile(String login, Organization org) throws Exception {
        return ok(getAs(login, org.getId()), login);
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("denied");
    }

    private void assertInvalid(MvcResult r, String what) throws Exception {
        assertThat(r.getResponse().getStatus()).as(what + " -> " + r.getResponse().getContentAsString()).isEqualTo(422);
    }

    private void assertPii(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(422);
        assertThat(body).as(what).contains("SENSITIVE_CONTENT");
    }

    private static List<String> texts(JsonNode array, String field) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : array) out.add(n.path(field).asText());
        return out;
    }

    private static String json(String... kv) {
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < kv.length; i += 2) sb.append(i > 0 ? "," : "").append('"').append(kv[i]).append("\":").append(kv[i + 1]);
        return sb.append('}').toString();
    }

    private static String q(String s) {
        return "\"" + s + "\"";
    }

    // ---- (a) own data is correct ----------------------------------------------------------------------------------

    @Test
    void aConsultantSeesTheirOwnProfileBuiltFromTheirRows() throws Exception {
        skill(c1, "Java", 1);
        skill(c1, "Spring Boot", 2);
        OrgResume r = resume(c1, "Casey Resume", true, "Seasoned engineer.");
        resume(c1, "Other", false, "Other summary.");
        exp(r, "Senior Java Developer", "TechCorp", 2021, null, 0);
        exp(r, "Java Developer", "InnovateTech", 2018, 2020, 1);
        cert(c1, "AWS SAA", LocalDate.of(2023, 3, 1));
        cert(c1, "CSM", LocalDate.of(2020, 8, 1));

        JsonNode p = profile("cwp-a-c1", a);
        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(p.path("me").path("consultantId").asLong()).isEqualTo(c1.getId());
        assertThat(p.path("me").path("name").asText()).isEqualTo("Casey One");
        assertThat(p.path("me").path("jobTitle").asText()).isEqualTo("Senior Engineer");
        assertThat(p.path("me").path("yearsExperience").asInt()).isEqualTo(8);
        assertThat(p.path("me").path("location").asText()).isEqualTo("Austin, TX");
        assertThat(p.path("availability").path("status").asText()).isEqualTo("AVAILABLE");
        assertThat(p.path("strength").path("percent").asInt()).as("the stored profile_completeness").isEqualTo(78);
        assertThat(p.path("summary").path("text").asText()).isEqualTo("Seasoned engineer.");
        assertThat(p.path("summary").path("source").asText()).isEqualTo("RESUME");
        assertThat(texts(p.path("skills"), "skill")).containsExactly("Java", "Spring Boot");
        assertThat(texts(p.path("certifications"), "name")).containsExactly("AWS SAA", "CSM");
        assertThat(p.path("certifications").get(0).path("issuedOn").asText()).isEqualTo("2023-03-01");
        assertThat(p.path("experience").path("resumeName").asText()).isEqualTo("Casey Resume");
        assertThat(texts(p.path("experience").path("items"), "title")).containsExactly("Senior Java Developer", "Java Developer");
        assertThat(p.path("experience").path("items").get(0).path("endYear").isNull()).isTrue();
        assertThat(p.path("experience").path("items").get(1).path("endYear").asInt()).isEqualTo(2020);

        List<String> missing = texts(p.path("strength").path("missing"), "key");
        assertThat(missing).as("only what is really missing").containsExactly("skills", "roles", "locations", "employment", "authorization", "goals");
    }

    @Test
    void theLegacyHasCertificationsFlagStillCountsAsACertificationUntilAWriteReconcilesIt() throws Exception {
        c1.setHasCertifications(true);
        profiles.saveAndFlush(c1);
        assertThat(texts(profile("cwp-a-c1", a).path("strength").path("missing"), "key")).doesNotContain("certifications");
        JsonNode after = ok(send(post(path(a.getId(), "/prefs")), "cwp-a-c1", json("kind", q("ROLE"), "value", q("Architect"))), "add pref");
        assertThat(texts(after.path("strength").path("missing"), "key")).as("no rows behind the flag").contains("certifications");
        assertThat(profiles.findById(c1.getId()).orElseThrow().isHasCertifications()).isFalse();
    }

    // ---- (b) own rows only ----------------------------------------------------------------------------------------

    @Test
    void aConsultantNeverSeesAnotherConsultantsProfileRows() throws Exception {
        skill(c1, "Java", 1);
        skill(c2, "HiddenSkill", 1);
        cert(c2, "Hidden Cert", LocalDate.of(2022, 1, 1));
        OrgResume hr = resume(c2, "Hidden Resume", true, "Hidden summary text");
        exp(hr, "Hidden Title", "HiddenCo", 2019, null, 0);
        ok(send(post(path(a.getId(), "/prefs")), "cwp-a-c2", json("kind", q("ROLE"), "value", q("Hidden Role"))), "c2 pref");
        ok(send(put(path(a.getId(), "/career-goals")), "cwp-a-c2", json("text", q("Hidden goals"))), "c2 goals");

        MvcResult r = getAs("cwp-a-c1", a.getId());
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(body).doesNotContain("Hidden").doesNotContain("Robin Two");

        JsonNode p2 = profile("cwp-a-c2", a);
        assertThat(p2.path("me").path("consultantId").asLong()).isEqualTo(c2.getId());
        assertThat(texts(p2.path("skills"), "skill")).containsExactly("HiddenSkill");
        assertThat(p2.toString()).doesNotContain("Casey One").doesNotContain("\"Java\"");
    }

    // ---- (c) / (d) refusals ---------------------------------------------------------------------------------------

    @Test
    void everyoneWhoIsNotTheConsultantGetsTheGeneric404() throws Exception {
        assertGeneric404(getAs("cwp-b-owner", a.getId()), "another org's owner");
        assertGeneric404(getAs("cwp-b-c1", a.getId()), "another org's consultant with a profile");
        assertGeneric404(getAs("ghost-login", a.getId()), "unknown login");
        assertGeneric404(getAs("cwp-a-c1", 999999999L), "unknown organization");
        assertGeneric404(getAs("cwp-a-owner", a.getId()), "owner lacks opportunities.respond");
        assertGeneric404(getAs("cwp-a-marketer", a.getId()), "marketer lacks opportunities.respond");
        assertGeneric404(getAs("cwp-a-noprofile", a.getId()), "consultant seat without a consultant_profile");
        // writes are walled the same way
        assertGeneric404(send(put(path(a.getId(), "/availability")), "cwp-b-c1", json("status", q("NOTICE"))), "write from another org");
        assertGeneric404(send(post(path(a.getId(), "/skills")), "cwp-a-owner", json("skill", q("Java"))), "write by a non-consultant");
        assertGeneric404(send(post(path(a.getId(), "/certifications")), "cwp-a-noprofile", json("name", q("X"))), "write without a profile");
        assertThat(skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(a.getId(), c1.getId())).isEmpty();
        assertThat(bc.getOrgId()).isEqualTo(b.getId());
    }

    @Test
    void theRouteIs404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        flags(true, false);
        assertGeneric404(getAs("cwp-a-c1", a.getId()), "roles flag off");
        flags(false, true);
        assertGeneric404(getAs("cwp-a-c1", a.getId()), "master flag off");
    }

    // ---- (e) empty consultant -------------------------------------------------------------------------------------

    @Test
    void aConsultantWithNothingGetsEmptyListsAndHonestMissingDetails() throws Exception {
        c1.setProfileCompleteness(0);
        profiles.saveAndFlush(c1);
        JsonNode p = profile("cwp-a-c1", a);
        for (String list : List.of("skills", "certifications")) assertThat(p.get(list).isArray() && p.get(list).isEmpty()).as(list).isTrue();
        assertThat(p.path("experience").get("items").isEmpty()).isTrue();
        assertThat(p.path("experience").get("resumeName").isNull()).isTrue();
        assertThat(p.path("preferences").path("roles").isEmpty()).isTrue();
        assertThat(p.path("preferences").path("locations").isEmpty()).isTrue();
        assertThat(p.path("preferences").path("employmentTypes").isEmpty()).isTrue();
        assertThat(p.get("workAuthorization").isNull()).isTrue();
        assertThat(p.get("careerGoals").isNull()).isTrue();
        assertThat(p.path("summary").get("text").isNull()).isTrue();
        assertThat(p.path("summary").path("source").asText()).isEqualTo("NONE");
        assertThat(p.path("summary").path("hasResume").asBoolean()).isFalse();
        assertThat(p.path("strength").path("percent").asInt()).isZero();
        assertThat(p.path("strength").path("missing")).hasSize(9);
    }

    // ---- writes ---------------------------------------------------------------------------------------------------

    @Test
    void availabilityIsSetAndValidated() throws Exception {
        c1.setAvailabilitySince(today.minusDays(90));
        profiles.saveAndFlush(c1);
        JsonNode p = ok(send(put(path(a.getId(), "/availability")), "cwp-a-c1", json("status", q("notice"))), "availability");
        assertThat(p.path("availability").path("status").asText()).isEqualTo("NOTICE");
        assertThat(p.path("availability").path("since").asText()).isEqualTo(today.toString());
        assertThat(profiles.findById(c1.getId()).orElseThrow().getAvailabilityStatus()).isEqualTo("NOTICE");
        assertInvalid(send(put(path(a.getId(), "/availability")), "cwp-a-c1", json("status", q("BUSY"))), "bad status");
        assertInvalid(send(put(path(a.getId(), "/availability")), "cwp-a-c1", "{}"), "missing status");
        assertThat(profile("cwp-a-c2", a).path("availability").path("status").asText()).as("the other consultant is untouched").isEqualTo("AVAILABLE");
    }

    @Test
    void skillsAreAddedDedupedLimitedAndRemovedOnlyByTheirOwner() throws Exception {
        JsonNode p = ok(send(post(path(a.getId(), "/skills")), "cwp-a-c1", json("skill", q("  Kubernetes "))), "add");
        assertThat(texts(p.path("skills"), "skill")).containsExactly("Kubernetes");
        ok(send(post(path(a.getId(), "/skills")), "cwp-a-c1", json("skill", q("kubernetes"))), "duplicate is a no-op");
        p = ok(send(post(path(a.getId(), "/skills")), "cwp-a-c1", json("skill", q("Docker"))), "add 2");
        assertThat(texts(p.path("skills"), "skill")).containsExactly("Kubernetes", "Docker");
        long dockerId = p.path("skills").get(1).path("id").asLong();

        assertInvalid(send(post(path(a.getId(), "/skills")), "cwp-a-c1", json("skill", q("  "))), "blank");
        assertInvalid(send(post(path(a.getId(), "/skills")), "cwp-a-c1", json("skill", q("x".repeat(61)))), "too long");
        assertInvalid(send(post(path(a.getId(), "/skills")), "cwp-a-c1", json("skill", q("<script>"))), "angle brackets");

        // another consultant (same org) and another org's consultant cannot delete it; both get the generic 404
        assertGeneric404(send(delete(path(a.getId(), "/skills/" + dockerId)), "cwp-a-c2", null), "other consultant deletes my skill");
        assertGeneric404(send(delete(path(a.getId(), "/skills/" + dockerId)), "cwp-b-c1", null), "other org deletes my skill");
        assertGeneric404(send(delete(path(a.getId(), "/skills/999999999")), "cwp-a-c1", null), "unknown skill");
        assertThat(skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(a.getId(), c1.getId())).hasSize(2);

        p = ok(send(delete(path(a.getId(), "/skills/" + dockerId)), "cwp-a-c1", null), "owner deletes");
        assertThat(texts(p.path("skills"), "skill")).containsExactly("Kubernetes");
    }

    @Test
    void skillLimitIsEnforced() throws Exception {
        for (int i = 0; i < 30; i++) skill(c1, "S" + i, i);
        assertInvalid(send(post(path(a.getId(), "/skills")), "cwp-a-c1", json("skill", q("One too many"))), "31st skill");
    }

    @Test
    void certificationsAreAddedValidatedAndKeepHasCertificationsHonest() throws Exception {
        assertThat(profiles.findById(c1.getId()).orElseThrow().isHasCertifications()).isFalse();
        JsonNode p = ok(send(post(path(a.getId(), "/certifications")), "cwp-a-c1", json("name", q("AWS Certified Solutions Architect"), "issuer", q("Amazon Web Services"), "issuedOn", q("2023-03"))), "add");
        assertThat(texts(p.path("certifications"), "name")).containsExactly("AWS Certified Solutions Architect");
        assertThat(p.path("certifications").get(0).path("issuedOn").asText()).isEqualTo("2023-03-01");
        assertThat(p.path("certifications").get(0).path("issuer").asText()).isEqualTo("Amazon Web Services");
        assertThat(profiles.findById(c1.getId()).orElseThrow().isHasCertifications()).isTrue();
        assertThat(texts(p.path("strength").path("missing"), "key")).doesNotContain("certifications");
        long id = p.path("certifications").get(0).path("id").asLong();

        ok(send(post(path(a.getId(), "/certifications")), "cwp-a-c1", json("name", q("No dates"))), "name only is fine");
        assertInvalid(send(post(path(a.getId(), "/certifications")), "cwp-a-c1", json("name", q(""))), "blank name");
        assertInvalid(send(post(path(a.getId(), "/certifications")), "cwp-a-c1", json("name", q("X"), "issuedOn", q("March 2023"))), "bad month");
        assertInvalid(send(post(path(a.getId(), "/certifications")), "cwp-a-c1", json("name", q("X"), "issuedOn", q("2999-01"))), "future month");
        assertInvalid(send(post(path(a.getId(), "/certifications")), "cwp-a-c1", json("name", q("x".repeat(161)))), "too long");

        assertGeneric404(send(delete(path(a.getId(), "/certifications/" + id)), "cwp-a-c2", null), "other consultant deletes");
        assertGeneric404(send(delete(path(a.getId(), "/certifications/" + id)), "cwp-b-c1", null), "other org deletes");
        assertThat(certs.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isEqualTo(2);

        p = ok(send(delete(path(a.getId(), "/certifications/" + id)), "cwp-a-c1", null), "owner deletes");
        assertThat(p.path("certifications")).hasSize(1);
        CwsCertification rest = certs.findByOrgIdAndConsultantIdOrderByIssuedOnDescIdDesc(a.getId(), c1.getId()).get(0);
        ok(send(delete(path(a.getId(), "/certifications/" + rest.getId())), "cwp-a-c1", null), "delete last");
        assertThat(profiles.findById(c1.getId()).orElseThrow().isHasCertifications()).as("no rows left, flag follows").isFalse();
    }

    @Test
    void preferredRolesAndLocationsAreAddedDedupedAndRemovedOnlyByTheirOwner() throws Exception {
        JsonNode p = ok(send(post(path(a.getId(), "/prefs")), "cwp-a-c1", json("kind", q("ROLE"), "value", q("Backend Developer"))), "role");
        ok(send(post(path(a.getId(), "/prefs")), "cwp-a-c1", json("kind", q("ROLE"), "value", q("backend developer"))), "dup role");
        p = ok(send(post(path(a.getId(), "/prefs")), "cwp-a-c1", json("kind", q("LOCATION"), "value", q("Remote"))), "location");
        assertThat(texts(p.path("preferences").path("roles"), "value")).containsExactly("Backend Developer");
        assertThat(texts(p.path("preferences").path("locations"), "value")).containsExactly("Remote");
        assertThat(profiles.findById(c1.getId()).orElseThrow().isHasPreferences()).isTrue();
        long roleId = p.path("preferences").path("roles").get(0).path("id").asLong();

        assertInvalid(send(post(path(a.getId(), "/prefs")), "cwp-a-c1", json("kind", q("EMPLOYMENT_TYPE"), "value", q("X"))), "employment types are a fixed set");
        assertInvalid(send(post(path(a.getId(), "/prefs")), "cwp-a-c1", json("kind", q("ROLE"), "value", q(" "))), "blank");
        assertInvalid(send(post(path(a.getId(), "/prefs")), "cwp-a-c1", json("kind", q("ROLE"), "value", q("y".repeat(81)))), "too long");
        assertInvalid(send(post(path(a.getId(), "/prefs")), "cwp-a-c1", json("kind", q("NOPE"), "value", q("X"))), "bad kind");

        assertGeneric404(send(delete(path(a.getId(), "/prefs/" + roleId)), "cwp-a-c2", null), "other consultant");
        assertGeneric404(send(delete(path(a.getId(), "/prefs/" + roleId)), "cwp-b-c1", null), "other org");
        p = ok(send(delete(path(a.getId(), "/prefs/" + roleId)), "cwp-a-c1", null), "owner");
        assertThat(p.path("preferences").path("roles")).isEmpty();
    }

    @Test
    void employmentTypesAreReplacedAsASet() throws Exception {
        JsonNode p = ok(send(put(path(a.getId(), "/employment-types")), "cwp-a-c1", json("values", "[\"CONTRACT\",\"contract_to_hire\"]")), "set");
        assertThat(om.convertValue(p.path("preferences").path("employmentTypes"), List.class)).containsExactly("CONTRACT", "CONTRACT_TO_HIRE");
        p = ok(send(put(path(a.getId(), "/employment-types")), "cwp-a-c1", json("values", "[\"FULL_TIME\",\"CONTRACT\"]")), "replace");
        assertThat(om.convertValue(p.path("preferences").path("employmentTypes"), List.class)).containsExactlyInAnyOrder("CONTRACT", "FULL_TIME");
        assertInvalid(send(put(path(a.getId(), "/employment-types")), "cwp-a-c1", json("values", "[\"FREELANCE\"]")), "unknown type");
        p = ok(send(put(path(a.getId(), "/employment-types")), "cwp-a-c1", json("values", "[]")), "clear");
        assertThat(p.path("preferences").path("employmentTypes")).isEmpty();
        assertThat(profile("cwp-a-c2", a).path("preferences").path("employmentTypes")).as("other consultant untouched").isEmpty();
    }

    @Test
    void workAuthorizationIsAStatusChoiceNeverFreeText() throws Exception {
        JsonNode p = ok(send(put(path(a.getId(), "/work-authorization")), "cwp-a-c1", json("value", q("authorized_no_sponsorship"))), "set");
        assertThat(p.path("workAuthorization").asText()).isEqualTo("AUTHORIZED_NO_SPONSORSHIP");
        assertThat(texts(p.path("strength").path("missing"), "key")).doesNotContain("authorization");
        assertInvalid(send(put(path(a.getId(), "/work-authorization")), "cwp-a-c1", json("value", q("Visa number 123456789"))), "free text is refused");
        assertInvalid(send(put(path(a.getId(), "/work-authorization")), "cwp-a-c1", json("value", q("H1B"))), "not a listed choice");
        p = ok(send(put(path(a.getId(), "/work-authorization")), "cwp-a-c1", json("value", "null")), "clear");
        assertThat(p.get("workAuthorization").isNull()).isTrue();
    }

    @Test
    void summaryIsSavedOnThePrimaryResumeOrOnTheProfileWhenThereIsNoResume() throws Exception {
        // no resume: kept on the profile
        JsonNode p = ok(send(put(path(a.getId(), "/summary")), "cwp-a-c1", json("text", q("  Hands-on engineer. "))), "no resume");
        assertThat(p.path("summary").path("text").asText()).isEqualTo("Hands-on engineer.");
        assertThat(p.path("summary").path("source").asText()).isEqualTo("PROFILE");
        // with a primary resume: the resume's own field, and it wins from then on
        OrgResume primary = resume(c1, "Main", true, "Old summary");
        OrgResume secondary = resume(c1, "Second", false, "Second summary");
        p = ok(send(put(path(a.getId(), "/summary")), "cwp-a-c1", json("text", q("New summary"))), "with resume");
        assertThat(p.path("summary").path("source").asText()).isEqualTo("RESUME");
        assertThat(resumes.findById(primary.getId()).orElseThrow().getSummaryText()).isEqualTo("New summary");
        assertThat(resumes.findById(secondary.getId()).orElseThrow().getSummaryText()).as("only the primary resume changes").isEqualTo("Second summary");
        assertThat(profile("cwp-a-c2", a).path("summary").path("text").isNull()).isTrue();
        assertInvalid(send(put(path(a.getId(), "/summary")), "cwp-a-c1", json("text", q("s".repeat(2001)))), "too long");
        p = ok(send(put(path(a.getId(), "/summary")), "cwp-a-c1", json("text", q(""))), "clear");
        assertThat(p.path("summary").path("source").asText()).as("blank clears the resume summary; the older profile text shows").isEqualTo("PROFILE");
    }

    @Test
    void careerGoalsAreSavedAndValidated() throws Exception {
        JsonNode p = ok(send(put(path(a.getId(), "/career-goals")), "cwp-a-c1", json("text", q("Lead a platform team."))), "set");
        assertThat(p.path("careerGoals").asText()).isEqualTo("Lead a platform team.");
        assertThat(texts(p.path("strength").path("missing"), "key")).doesNotContain("goals");
        assertInvalid(send(put(path(a.getId(), "/career-goals")), "cwp-a-c1", json("text", q("g".repeat(1001)))), "too long");
        p = ok(send(put(path(a.getId(), "/career-goals")), "cwp-a-c1", json("text", "null")), "clear");
        assertThat(p.get("careerGoals").isNull()).isTrue();
    }

    @Test
    void everyFreeTextFieldRejectsSensitivePersonalData() throws Exception {
        String ssn = "My SSN is 123-45-6789";
        assertPii(send(put(path(a.getId(), "/summary")), "cwp-a-c1", json("text", q(ssn))), "summary");
        assertPii(send(put(path(a.getId(), "/career-goals")), "cwp-a-c1", json("text", q(ssn))), "career goals");
        assertPii(send(post(path(a.getId(), "/skills")), "cwp-a-c1", json("skill", q("SSN 123-45-6789"))), "skill");
        assertPii(send(post(path(a.getId(), "/certifications")), "cwp-a-c1", json("name", q("Cert"), "issuer", q("SSN 123-45-6789"))), "certification issuer");
        assertPii(send(post(path(a.getId(), "/certifications")), "cwp-a-c1", json("name", q("SSN 123-45-6789"))), "certification name");
        assertPii(send(post(path(a.getId(), "/prefs")), "cwp-a-c1", json("kind", q("ROLE"), "value", q("SSN 123-45-6789"))), "role");
        assertPii(send(post(path(a.getId(), "/prefs")), "cwp-a-c1", json("kind", q("LOCATION"), "value", q("SSN 123-45-6789"))), "location");
        JsonNode p = profile("cwp-a-c1", a);
        assertThat(p.path("skills")).isEmpty();
        assertThat(p.path("certifications")).isEmpty();
        assertThat(p.path("preferences").path("roles")).isEmpty();
        assertThat(p.get("careerGoals").isNull()).isTrue();
    }

    @Test
    void completenessIsRecomputedByWritesFromWhatIsActuallyThere() throws Exception {
        // 9 checks. Fill: summary, 3 skills, certification, role, location, employment, authorization, goals (no resume experience) = 8 of 9
        ok(send(put(path(a.getId(), "/summary")), "cwp-a-c1", json("text", q("A summary"))), "summary");
        for (String s : List.of("Java", "SQL", "AWS")) ok(send(post(path(a.getId(), "/skills")), "cwp-a-c1", json("skill", q(s))), s);
        ok(send(post(path(a.getId(), "/certifications")), "cwp-a-c1", json("name", q("CSM"))), "cert");
        ok(send(post(path(a.getId(), "/prefs")), "cwp-a-c1", json("kind", q("ROLE"), "value", q("Dev"))), "role");
        ok(send(post(path(a.getId(), "/prefs")), "cwp-a-c1", json("kind", q("LOCATION"), "value", q("Remote"))), "location");
        ok(send(put(path(a.getId(), "/employment-types")), "cwp-a-c1", json("values", "[\"CONTRACT\"]")), "types");
        ok(send(put(path(a.getId(), "/work-authorization")), "cwp-a-c1", json("value", q("AUTHORIZED_NO_SPONSORSHIP"))), "auth");
        JsonNode p = ok(send(put(path(a.getId(), "/career-goals")), "cwp-a-c1", json("text", q("Goals"))), "goals");
        assertThat(p.path("strength").path("percent").asInt()).isEqualTo(89);
        assertThat(texts(p.path("strength").path("missing"), "key")).containsExactly("experience");
        assertThat(profiles.findById(c1.getId()).orElseThrow().getProfileCompleteness()).isEqualTo(89);
        assertThat(profiles.findById(c2.getId()).orElseThrow().getProfileCompleteness()).as("another consultant's number is untouched").isEqualTo(78);
    }
}
