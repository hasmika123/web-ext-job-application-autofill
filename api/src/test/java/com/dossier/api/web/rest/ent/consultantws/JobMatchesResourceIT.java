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
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.RequirementSkill;
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
import com.dossier.api.domain.ent.consultantws.CwsJobSource;
import com.dossier.api.repository.ent.consultantws.CwsJobSourceRepository;
import com.dossier.api.repository.ent.consultantws.CwsMatchInterestRepository;
import com.dossier.api.repository.ent.consultantws.CwsMatchViewRepository;
import com.dossier.api.repository.ent.consultantws.CwsSavedJobRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
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
 * The Consultant workspace Job Matches page through the real chain on real rows: {@code /api/orgs/{orgId}/me-workspace/matches}.
 * Every number is asserted against rows the test wrote, a consultant only ever sees and changes their own rows, every refusal is the
 * generic 404, and every free-text write goes through the sensitive-data guard.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class JobMatchesResourceIT {

    private static final String WHO = "cws-matches-it";

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
    @Autowired private ConsultantSkillRepository consultantSkills;
    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private RequirementSkillRepository requirementSkills;
    @Autowired private RequirementMatchRepository matches;
    @Autowired private TalentApplicationRepository applications;
    @Autowired private CwsSavedJobRepository saved;
    @Autowired private CwsMatchViewRepository views;
    @Autowired private CwsMatchInterestRepository interests;
    @Autowired private CwsJobSourceRepository jobSources;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private int seq = 0;

    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ConsultantProfile b1;
    private ClientAccount acme;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cws-m-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-m-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);
        staff(a, "cws-m-a-owner", OrgRole.OWNER);
        staff(a, "cws-m-a-admin", OrgRole.ADMIN);
        staff(a, "cws-m-a-marketer", OrgRole.MARKETER);
        staff(b, "cws-m-b-owner", OrgRole.OWNER);
        c1 = consultant(a, "cws-m-a-c1", "Casey One", true);
        c2 = consultant(a, "cws-m-a-c2", "Robin Two", true);
        consultant(a, "cws-m-a-noprofile", "Nobody", false);
        b1 = consultant(b, "cws-m-b-c1", "Bee Consultant", true);
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

    private ClientRequirement requirement(Organization org, ClientAccount client, String title, String level, String... skills) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(org.getId());
        r.setClientId(client.getId());
        r.setTitle(title);
        r.setLocation("Austin, TX");
        r.setWorkMode("HYBRID");
        r.setEmploymentLabel("CONTRACT");
        r.setExperienceLevel(level);
        r.setRateMinMinor(8500L);
        r.setRateMaxMinor(9500L);
        r.setRateUnit("HOUR");
        r.setPostedAt(now.minus(Duration.ofDays(2)));
        requirements.saveAndFlush(r);
        int order = 0;
        for (String s : skills) {
            RequirementSkill rs = new RequirementSkill();
            rs.setOrgId(org.getId());
            rs.setRequirementId(r.getId());
            rs.setSkill(s);
            rs.setSortOrder(order++);
            requirementSkills.saveAndFlush(rs);
        }
        return r;
    }

    private void skill(ConsultantProfile c, String name, boolean primary, int order) {
        ConsultantSkill s = new ConsultantSkill();
        s.setOrgId(c.getOrgId());
        s.setConsultantId(c.getId());
        s.setSkill(name);
        s.setPrimarySkill(primary);
        s.setSortOrder(order);
        consultantSkills.saveAndFlush(s);
    }

    private RequirementMatch match(ConsultantProfile c, ClientRequirement r, String status, int score, Instant createdAt) {
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(c.getOrgId());
        m.setRequirementId(r.getId());
        m.setConsultantId(c.getId());
        m.setScore(score);
        m.setStatus(status);
        m.setReason("Skills align with this role.");
        m.setCreatedAt(createdAt);
        return matches.saveAndFlush(m);
    }

    /** c1: 4 open matches (one dismissed extra), skills Java (primary) + Spring, 3-4 skills on the jobs. */
    private RequirementMatch m1;
    private RequirementMatch m2;
    private RequirementMatch m3;
    private RequirementMatch m4;
    private RequirementMatch dismissed;

    private void seedC1() {
        c1.setYearsExperience(8);
        c1.setWorkMode("HYBRID");
        c1.setProfileCompleteness(90);
        c1.setHasPreferences(true);
        profiles.saveAndFlush(c1);
        skill(c1, "Java", true, 0);
        skill(c1, "spring boot", false, 1);
        skill(c1, "AWS", false, 2);
        ClientRequirement r1 = requirement(a, acme, "Senior Java Developer", "SENIOR", "Kubernetes", "Java", "Spring Boot", "AWS");
        ClientRequirement r2 = requirement(a, acme, "Data Engineer", "LEAD", "Spark", "Kafka");
        ClientRequirement r3 = requirement(a, acme, "Support Analyst", "JUNIOR");
        ClientRequirement r4 = requirement(a, acme, "Cloud Architect", "SENIOR", "AWS");
        ClientRequirement r5 = requirement(a, acme, "Dismissed Req", "MID", "Java");
        m1 = match(c1, r1, "SUGGESTED", 94, now.minus(Duration.ofDays(1)));
        m2 = match(c1, r2, "SUGGESTED", 82, now.minus(Duration.ofDays(3)));
        m3 = match(c1, r3, "SUGGESTED", 70, now.minus(Duration.ofDays(10)));
        m4 = match(c1, r4, "ASSIGNED", 60, now.minus(Duration.ofDays(20)));
        dismissed = match(c1, r5, "DISMISSED", 99, now.minus(Duration.ofDays(2)));
    }

    private void seedC2() {
        ClientAccount other = client(a, "Globex Hidden");
        ClientRequirement hr = requirement(a, other, "Hidden Secret Role", "SENIOR", "Cobol");
        match(c2, hr, "SUGGESTED", 97, now.minus(Duration.ofHours(1)));
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private static String path(long orgId, String tail) {
        return "/api/orgs/" + orgId + "/me-workspace/matches" + tail;
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

    private JsonNode detail(String login, Organization org, long matchId) throws Exception {
        return ok(send(get(path(org.getId(), "/" + matchId)), login, null), "detail " + matchId);
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

    private JsonNode row(JsonNode page, long matchId) {
        for (JsonNode n : page.path("matches")) if (n.path("matchId").asLong() == matchId) return n;
        throw new AssertionError("no row for match " + matchId);
    }

    // ---- (a) correct values ---------------------------------------------------------------------------------------

    @Test
    void aConsultantGetsTheirOwnMatchesTilesAndSkillFitFromTheirRows() throws Exception {
        seedC1();
        JsonNode p = page("cws-m-a-c1", a);

        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(p.path("name").asText()).isEqualTo("Casey One");
        // the dismissed match is not listed; best score first
        assertThat(texts(p.path("matches"), "title")).containsExactly("Senior Java Developer", "Data Engineer", "Support Analyst", "Cloud Architect");
        JsonNode r1 = row(p, m1.getId());
        assertThat(r1.path("score").asInt()).isEqualTo(94);
        assertThat(r1.path("company").asText()).isEqualTo("Acme Corp");
        assertThat(r1.path("location").asText()).isEqualTo("Austin, TX");
        assertThat(r1.path("workMode").asText()).isEqualTo("HYBRID");
        assertThat(r1.path("employment").asText()).isEqualTo("CONTRACT");
        assertThat(r1.path("skillFit").asInt()).as("Java, Spring Boot (case-insensitive) and AWS of 4 listed skills").isEqualTo(75);
        assertThat(row(p, m2.getId()).path("skillFit").asInt()).isZero();
        assertThat(row(p, m3.getId()).path("skillFit").isNull()).as("no skills listed: no fit, not 0 or 100").isTrue();
        assertThat(r1.path("rateMinMinor").asLong()).isEqualTo(8500);
        assertThat(r1.path("rateUnit").asText()).isEqualTo("HOUR");
        assertThat(r1.path("postedAt").asText()).isNotBlank();
        assertThat(r1.path("saved").asBoolean()).isFalse();
        assertThat(r1.path("viewed").asBoolean()).isFalse();
        assertThat(r1.path("interestSent").asBoolean()).isFalse();

        JsonNode t = p.path("tiles");
        assertThat(t.path("total").path("value").asLong()).isEqualTo(4);
        assertThat(t.path("total").path("previous").asLong()).as("two of them existed a week ago").isEqualTo(2);
        assertThat(t.path("total").path("deltaPct").asDouble()).isEqualTo(100.0);
        assertThat(t.path("total").path("sparkline")).hasSize(6);
        assertThat(t.path("high").path("value").asLong()).as("94 and 82 are 80+").isEqualTo(2);
        assertThat(t.path("fresh").path("value").asLong()).as("created in the last 7 days: m1 and m2").isEqualTo(2);
        assertThat(t.path("fresh").path("previous").asLong()).as("the 7 days before: m3 (10 days)").isEqualTo(1);
        assertThat(t.path("fresh").path("deltaPct").asDouble()).isEqualTo(100.0);
        assertThat(t.path("saved").path("value").asLong()).isZero();
        assertThat(t.path("viewed").path("value").asLong()).isZero();
        assertThat(t.path("saved").path("deltaPct").isNull()).isTrue();

        // checklist from the profile
        JsonNode q = p.path("quality");
        assertThat(q.path("percent").asInt()).isEqualTo(90);
        List<String> keys = texts(q.path("checks"), "key");
        assertThat(keys).containsExactly("profile", "skills", "resume", "preferences", "certifications");
        assertThat(q.path("checks").get(0).path("done").asBoolean()).isTrue();
        assertThat(q.path("checks").get(1).path("done").asBoolean()).as("3 skills").isTrue();
        assertThat(q.path("checks").get(2).path("done").asBoolean()).as("no resume").isFalse();
        assertThat(q.path("checks").get(3).path("done").asBoolean()).isTrue();
        assertThat(q.path("checks").get(4).path("done").asBoolean()).isFalse();

        // alerts: 2 new matches in the last 7 days; nothing else happened
        JsonNode alerts = p.path("alerts");
        assertThat(texts(alerts, "kind")).containsExactly("NEW_MATCHES");
        assertThat(alerts.get(0).path("title").asText()).isEqualTo("2 new job matches");
        assertThat(alerts.get(0).path("at").asText()).isNotBlank();
    }

    @Test
    void alertsComeFromRealEventsAnAssignedRoleEditedAndAnApplicationStageChange() throws Exception {
        seedC1();
        ClientRequirement edited = requirements.findByOrgIdAndId(m4.getOrgId(), m4.getRequirementId()).orElseThrow();
        edited.setCreatedAt(now.minus(Duration.ofDays(30)));
        edited.setUpdatedAt(now.minus(Duration.ofHours(5)));
        requirements.saveAndFlush(edited);
        TalentApplication app = new TalentApplication();
        app.setOrgId(a.getId());
        app.setCode("CWS-M-" + System.nanoTime() + "-" + seq++);
        app.setRequirementId(m3.getRequirementId());
        app.setConsultantId(c1.getId());
        app.setClientId(acme.getId());
        app.setStage("UNDER_REVIEW");
        app.setAppliedOn(java.time.LocalDate.now(java.time.ZoneOffset.UTC).minusDays(3));
        app.setStageChangedAt(now.minus(Duration.ofDays(2)));
        applications.saveAndFlush(app);

        JsonNode alerts = page("cws-m-a-c1", a).path("alerts");
        assertThat(texts(alerts, "kind")).containsExactly("ROLE_UPDATED", "NEW_MATCHES", "APPLICATION_UPDATE");
        assertThat(alerts.get(0).path("detail").asText()).isEqualTo("Cloud Architect at Acme Corp");
        assertThat(alerts.get(2).path("detail").asText()).isEqualTo("Support Analyst is now under review");
        assertThat(applications.findByOrgIdAndConsultantId(a.getId(), c1.getId())).as("no application is created by reading").hasSize(1);
    }

    @Test
    void detailShowsSkillAlignmentPresentOrMissingTheExplanationAndAreasToImprove() throws Exception {
        seedC1();
        JsonNode d = detail("cws-m-a-c1", a, m1.getId());
        assertThat(d.path("match").path("title").asText()).isEqualTo("Senior Java Developer");
        assertThat(d.path("reason").asText()).isEqualTo("Skills align with this role.");

        // primary skill first, then the job's own order; present = 100, missing = 0
        JsonNode skills = d.path("skills");
        assertThat(texts(skills, "skill")).containsExactly("Java", "Kubernetes", "Spring Boot", "AWS");
        assertThat(skills.get(0).path("present").asBoolean()).isTrue();
        assertThat(skills.get(0).path("primary").asBoolean()).isTrue();
        assertThat(skills.get(0).path("percent").asInt()).isEqualTo(100);
        assertThat(skills.get(1).path("present").asBoolean()).isFalse();
        assertThat(skills.get(1).path("percent").asInt()).isZero();
        assertThat(skills.get(2).path("present").asBoolean()).as("case-insensitive match").isTrue();

        JsonNode why = d.path("explanation");
        assertThat(texts(why, "key")).containsExactly("skills", "experience", "mode");
        assertThat(why.get(0).path("text").asText()).startsWith("You have 3 of the 4 skills");
        assertThat(why.get(1).path("ok").asBoolean()).as("8 years vs senior (5+)").isTrue();
        assertThat(why.get(2).path("ok").asBoolean()).as("hybrid vs hybrid").isTrue();

        JsonNode imp = d.path("improvements");
        assertThat(imp.get(0).path("tag").asText()).isEqualTo("GAP");
        assertThat(imp.get(0).path("title").asText()).isEqualTo("Kubernetes");
        assertThat(texts(imp, "tag")).contains("SUGGESTED");
        assertThat(texts(imp, "title")).contains("Certifications", "Latest resume").doesNotContain("Job preferences");
        assertThat(d.path("interestSentAt").isNull()).isTrue();

        // an experience gap is reported honestly
        JsonNode lead = detail("cws-m-a-c1", a, m2.getId());
        assertThat(lead.path("explanation").get(1).path("ok").asBoolean()).as("8 years vs lead (8+)").isTrue();
        c1.setYearsExperience(4);
        profiles.saveAndFlush(c1);
        assertThat(detail("cws-m-a-c1", a, m1.getId()).path("explanation").get(1).path("ok").asBoolean()).as("4 years vs senior (5+)").isFalse();
    }

    private void source(Organization org, long requirementId, String url, String name, String info, boolean sample) {
        CwsJobSource s = new CwsJobSource();
        s.setOrgId(org.getId());
        s.setRequirementId(requirementId);
        s.setSourceUrl(url);
        s.setSourceName(name);
        s.setQuickInfo(info);
        s.setSampleData(sample);
        jobSources.saveAndFlush(s);
    }

    @Test
    void rowsAndDetailCarryTheMarketersSourceLinkAndQuickInfoAndNeverAnUnsafeLink() throws Exception {
        seedC1();
        source(a, m1.getRequirementId(), "https://jobs.example.com/a/" + m1.getRequirementId(), "LinkedIn", "Quick note from the marketer.", true);
        source(a, m2.getRequirementId(), "javascript:alert(1)", "Dice", "Unsafe link row.", false);
        JsonNode p = page("cws-m-a-c1", a);
        JsonNode r1 = row(p, m1.getId());
        assertThat(r1.path("sourceUrl").asText()).isEqualTo("https://jobs.example.com/a/" + m1.getRequirementId());
        assertThat(r1.path("sourceName").asText()).isEqualTo("LinkedIn");
        assertThat(r1.path("quickInfo").asText()).isEqualTo("Quick note from the marketer.");
        assertThat(r1.path("sourceSample").asBoolean()).isTrue();
        JsonNode r2 = row(p, m2.getId());
        assertThat(r2.path("sourceUrl").isNull()).as("a non-https link is never returned").isTrue();
        assertThat(r2.path("quickInfo").asText()).isEqualTo("Unsafe link row.");
        assertThat(r2.path("sourceSample").asBoolean()).isFalse();
        assertThat(row(p, m3.getId()).path("sourceUrl").isNull()).as("no row: no link").isTrue();
        JsonNode d = detail("cws-m-a-c1", a, m1.getId());
        assertThat(d.path("match").path("sourceUrl").asText()).isEqualTo("https://jobs.example.com/a/" + m1.getRequirementId());
        assertThat(d.path("match").path("quickInfo").asText()).isEqualTo("Quick note from the marketer.");
        assertThat(detail("cws-m-a-c1", a, m2.getId()).path("match").path("sourceUrl").isNull()).isTrue();
    }

    // ---- (b) own rows only ----------------------------------------------------------------------------------------

    @Test
    void aConsultantNeverSeesOrTouchesAnotherConsultantsMatches() throws Exception {
        seedC1();
        seedC2();
        RequirementMatch hidden = matches.findByOrgIdAndConsultantIdOrderByScoreDesc(a.getId(), c2.getId()).get(0);

        MvcResult r = send(get(path(a.getId(), "")), "cws-m-a-c1", null);
        assertThat(r.getResponse().getContentAsString()).doesNotContain("Hidden").doesNotContain("Globex").doesNotContain("Robin Two");
        assertThat(om.readTree(r.getResponse().getContentAsString()).path("tiles").path("total").path("value").asLong()).isEqualTo(4);

        assertGeneric404(send(get(path(a.getId(), "/" + hidden.getId())), "cws-m-a-c1", null), "detail of another consultant's match");
        assertGeneric404(send(post(path(a.getId(), "/" + hidden.getId() + "/view")), "cws-m-a-c1", null), "view another's match");
        assertGeneric404(send(put(path(a.getId(), "/" + hidden.getId() + "/save")), "cws-m-a-c1", null), "save another's match");
        assertGeneric404(send(delete(path(a.getId(), "/" + hidden.getId() + "/save")), "cws-m-a-c1", null), "unsave another's match");
        assertGeneric404(send(post(path(a.getId(), "/" + hidden.getId() + "/interest")), "cws-m-a-c1", "{}"), "interest in another's match");
        assertThat(saved.findByOrgIdAndConsultantIdOrderByCreatedAtDesc(a.getId(), c1.getId())).isEmpty();
        assertThat(views.findByOrgIdAndConsultantId(a.getId(), c1.getId())).isEmpty();
        assertThat(interests.findByOrgIdAndConsultantId(a.getId(), c1.getId())).isEmpty();

        // the other consultant sees exactly their own, and c1's saves/views/interests do not show up for them
        assertStatus(send(put(path(a.getId(), "/" + m1.getId() + "/save")), "cws-m-a-c1", null), 200, "c1 saves m1");
        JsonNode p2 = page("cws-m-a-c2", a);
        assertThat(texts(p2.path("matches"), "title")).containsExactly("Hidden Secret Role");
        assertThat(p2.path("tiles").path("saved").path("value").asLong()).isZero();
        assertThat(p2.toString()).doesNotContain("Senior Java Developer").doesNotContain("Casey One");
    }

    // ---- (c) / (d) refusals ---------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationAndNonConsultantsGetTheGeneric404OnEveryRoute() throws Exception {
        seedC1();
        String id = String.valueOf(m1.getId());
        List<String[]> routes = List.of(
            new String[] { "GET", path(a.getId(), "") },
            new String[] { "GET", path(a.getId(), "/" + id) },
            new String[] { "POST", path(a.getId(), "/" + id + "/view") },
            new String[] { "PUT", path(a.getId(), "/" + id + "/save") },
            new String[] { "DELETE", path(a.getId(), "/" + id + "/save") },
            new String[] { "POST", path(a.getId(), "/" + id + "/interest") }
        );
        for (String login : List.of("cws-m-b-owner", "cws-m-b-c1", "ghost-login", "cws-m-a-owner", "cws-m-a-admin", "cws-m-a-marketer", "cws-m-a-noprofile")) {
            for (String[] route : routes) {
                MockHttpServletRequestBuilder req = switch (route[0]) {
                    case "POST" -> post(route[1]);
                    case "PUT" -> put(route[1]);
                    case "DELETE" -> delete(route[1]);
                    default -> get(route[1]);
                };
                assertGeneric404(send(req, login, "POST".equals(route[0]) ? "{}" : null), login + " " + route[0] + " " + route[1]);
            }
        }
        assertGeneric404(send(get(path(999999999L, "")), "cws-m-a-c1", null), "an organization that does not exist");
        assertGeneric404(send(get(path(a.getId(), "/987654321")), "cws-m-a-c1", null), "a match id that does not exist");
        assertGeneric404(send(get(path(a.getId(), "/" + dismissed.getId())), "cws-m-a-c1", null), "a dismissed match");
        assertGeneric404(send(put(path(a.getId(), "/" + dismissed.getId() + "/save")), "cws-m-a-c1", null), "save a dismissed match");
        // another tenant's consultant cannot reach this org's match through their own org either
        assertGeneric404(send(get(path(b.getId(), "/" + m1.getId())), "cws-m-b-c1", null), "a match id from another organization");
        assertThat(b1.getOrgId()).isEqualTo(b.getId());
    }

    @Test
    void theRoutesAre404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        seedC1();
        flags(true, false);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-m-a-c1", null), "roles flag off");
        flags(false, true);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-m-a-c1", null), "master flag off");
    }

    // ---- (e) empty consultant -------------------------------------------------------------------------------------

    @Test
    void aConsultantWithNoMatchesGetsZerosAndEmptyListsNeverNulls() throws Exception {
        JsonNode p = page("cws-m-a-c1", a);
        for (String tile : List.of("total", "high", "fresh", "saved", "viewed")) {
            JsonNode t = p.path("tiles").path(tile);
            assertThat(t.path("value").asLong()).as(tile).isZero();
            assertThat(t.path("previous").asLong()).as(tile).isZero();
            assertThat(t.get("deltaPct").isNull()).as(tile + " has no delta, not a made-up one").isTrue();
            assertThat(t.path("sparkline")).as(tile).hasSize(6);
            for (JsonNode n : t.path("sparkline")) assertThat(n.asLong()).isZero();
        }
        assertThat(p.get("matches").isArray()).isTrue();
        assertThat(p.get("matches")).isEmpty();
        assertThat(p.get("alerts").isArray()).isTrue();
        assertThat(p.get("alerts")).isEmpty();
        assertThat(p.path("quality").path("checks")).hasSize(5);
        for (JsonNode c : p.path("quality").path("checks")) assertThat(c.path("done").asBoolean()).as(c.path("key").asText()).isFalse();
    }

    // ---- writes ---------------------------------------------------------------------------------------------------

    @Test
    void viewingAMatchIsRecordedOnceAndFeedsTheViewedTile() throws Exception {
        seedC1();
        for (int i = 0; i < 2; i++) assertStatus(send(post(path(a.getId(), "/" + m1.getId() + "/view")), "cws-m-a-c1", null), 200, "view " + i);
        assertStatus(send(post(path(a.getId(), "/" + m2.getId() + "/view")), "cws-m-a-c1", null), 200, "view m2");
        assertThat(views.findByOrgIdAndConsultantId(a.getId(), c1.getId())).as("idempotent: one row per match").hasSize(2);
        JsonNode p = page("cws-m-a-c1", a);
        assertThat(p.path("tiles").path("viewed").path("value").asLong()).isEqualTo(2);
        assertThat(row(p, m1.getId()).path("viewed").asBoolean()).isTrue();
        assertThat(row(p, m3.getId()).path("viewed").asBoolean()).isFalse();
    }

    @Test
    void savingAndUnsavingTogglesTheBookmarkAndTheSavedTile() throws Exception {
        seedC1();
        JsonNode s = ok(send(put(path(a.getId(), "/" + m1.getId() + "/save")), "cws-m-a-c1", null), "save");
        assertThat(s.path("saved").asBoolean()).isTrue();
        ok(send(put(path(a.getId(), "/" + m1.getId() + "/save")), "cws-m-a-c1", null), "save again");
        assertThat(saved.countByOrgIdAndConsultantId(a.getId(), c1.getId())).as("idempotent").isEqualTo(1);
        JsonNode p = page("cws-m-a-c1", a);
        assertThat(p.path("tiles").path("saved").path("value").asLong()).isEqualTo(1);
        assertThat(row(p, m1.getId()).path("saved").asBoolean()).isTrue();
        assertThat(detail("cws-m-a-c1", a, m1.getId()).path("match").path("saved").asBoolean()).isTrue();

        JsonNode u = ok(send(delete(path(a.getId(), "/" + m1.getId() + "/save")), "cws-m-a-c1", null), "unsave");
        assertThat(u.path("saved").asBoolean()).isFalse();
        ok(send(delete(path(a.getId(), "/" + m1.getId() + "/save")), "cws-m-a-c1", null), "unsave again");
        assertThat(saved.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isZero();
        assertThat(page("cws-m-a-c1", a).path("tiles").path("saved").path("value").asLong()).isZero();
    }

    @Test
    void expressInterestRecordsTheWishOnlyAndNeverCreatesAnApplication() throws Exception {
        seedC1();
        long appsBefore = applications.countByOrgId(a.getId());
        JsonNode first = ok(send(post(path(a.getId(), "/" + m1.getId() + "/interest")), "cws-m-a-c1", "{\"note\":\"  Very keen on this one.  \"}"), "interest");
        assertThat(first.path("interestSent").asBoolean()).isTrue();
        assertThat(first.path("interestSentAt").asText()).isNotBlank();
        JsonNode again = ok(send(post(path(a.getId(), "/" + m1.getId() + "/interest")), "cws-m-a-c1", "{\"note\":\"changed\"}"), "interest again");
        assertThat(again.path("interestSentAt").asText()).as("idempotent: the first time is kept").isEqualTo(first.path("interestSentAt").asText());
        assertThat(interests.findByOrgIdAndConsultantId(a.getId(), c1.getId())).hasSize(1);
        assertThat(interests.findByOrgIdAndConsultantId(a.getId(), c1.getId()).get(0).getNote()).isEqualTo("Very keen on this one.");
        assertThat(applications.countByOrgId(a.getId())).as("no application is created").isEqualTo(appsBefore);
        assertThat(matches.findByOrgIdAndId(a.getId(), m1.getId()).orElseThrow().getStatus()).as("the match status does not change").isEqualTo("SUGGESTED");

        JsonNode p = page("cws-m-a-c1", a);
        assertThat(row(p, m1.getId()).path("interestSent").asBoolean()).isTrue();
        assertThat(row(p, m2.getId()).path("interestSent").asBoolean()).isFalse();
        JsonNode d = detail("cws-m-a-c1", a, m1.getId());
        assertThat(d.path("interestSentAt").asText()).isEqualTo(first.path("interestSentAt").asText());
        assertThat(d.path("interestNote").asText()).isEqualTo("Very keen on this one.");

        // no body at all is fine too
        ok(send(post(path(a.getId(), "/" + m2.getId() + "/interest")), "cws-m-a-c1", null), "interest without a body");
        assertThat(interests.findByOrgIdAndConsultantId(a.getId(), c1.getId())).hasSize(2);
    }

    @Test
    void theInterestNoteIsValidatedAndScannedForSensitiveData() throws Exception {
        seedC1();
        String id = String.valueOf(m1.getId());
        MvcResult tooLong = send(post(path(a.getId(), "/" + id + "/interest")), "cws-m-a-c1", "{\"note\":\"" + "x".repeat(501) + "\"}");
        assertStatus(tooLong, 422, "a note over 500 characters");
        MvcResult ssn = send(post(path(a.getId(), "/" + id + "/interest")), "cws-m-a-c1", "{\"note\":\"my SSN 123-45-6789\"}");
        assertStatus(ssn, 422, "a social security number");
        assertThat(ssn.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        MvcResult dob = send(post(path(a.getId(), "/" + id + "/interest")), "cws-m-a-c1", "{\"note\":\"date of birth 04/12/1990\"}");
        assertStatus(dob, 422, "a date of birth");
        assertThat(dob.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        assertThat(interests.findByOrgIdAndConsultantId(a.getId(), c1.getId())).as("a refused note stores nothing").isEmpty();
    }
}
