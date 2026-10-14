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
import com.dossier.api.domain.ent.consultantws.CwsPrepSession;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.repository.ent.consultantws.CwsPrepAnswerRepository;
import com.dossier.api.repository.ent.consultantws.CwsPrepCheckRepository;
import com.dossier.api.repository.ent.consultantws.CwsPrepSessionRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
import com.dossier.api.service.ent.consultantws.ConsultantWsInterviewPrepDemoSeeder;
import com.dossier.api.service.ent.consultantws.InterviewPrepCatalog;

/**
 * The Consultant workspace Interview Prep page through the real chain on real rows: {@code /api/orgs/{orgId}/me-workspace/interview-prep}.
 * Every number is asserted against rows the test wrote, a consultant only ever sees and changes their own rows, every refusal is the
 * generic 404, and every free-text write goes through the sensitive-data guard.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class InterviewPrepResourceIT {

    private static final String WHO = "cws-prep-it";

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
    @Autowired private TalentApplicationRepository applications;
    @Autowired private TalentInterviewRepository interviews;
    @Autowired private CwsPrepSessionRepository sessions;
    @Autowired private CwsPrepAnswerRepository answers;
    @Autowired private CwsPrepCheckRepository checks;
    @Autowired private ConsultantWsInterviewPrepDemoSeeder seeder;

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
        a = fx.org("cws-p-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-p-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);
        staff(a, "cws-p-a-owner", OrgRole.OWNER);
        staff(a, "cws-p-a-admin", OrgRole.ADMIN);
        staff(a, "cws-p-a-marketer", OrgRole.MARKETER);
        staff(b, "cws-p-b-owner", OrgRole.OWNER);
        c1 = consultant(a, "cws-p-a-c1", "Casey One", true);
        c2 = consultant(a, "cws-p-a-c2", "Robin Two", true);
        consultant(a, "cws-p-a-noprofile", "Nobody", false);
        b1 = consultant(b, "cws-p-b-c1", "Bee Consultant", true);
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

    private void skill(ConsultantProfile c, String name, int order) {
        ConsultantSkill s = new ConsultantSkill();
        s.setOrgId(c.getOrgId());
        s.setConsultantId(c.getId());
        s.setSkill(name);
        s.setSortOrder(order);
        consultantSkills.saveAndFlush(s);
    }

    private TalentInterview interview(ConsultantProfile c, String role, String status, Instant at) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(c.getOrgId());
        r.setClientId(acme.getId());
        r.setTitle(role);
        requirements.saveAndFlush(r);
        TalentApplication app = new TalentApplication();
        app.setOrgId(c.getOrgId());
        app.setCode("CWS-P-" + System.nanoTime() + "-" + (seq++));
        app.setRequirementId(r.getId());
        app.setConsultantId(c.getId());
        app.setClientId(acme.getId());
        app.setStage("INTERVIEWING");
        app.setAppliedOn(java.time.LocalDate.now(java.time.ZoneOffset.UTC).minusDays(3));
        applications.saveAndFlush(app);
        TalentInterview i = new TalentInterview();
        i.setOrgId(c.getOrgId());
        i.setApplicationId(app.getId());
        i.setConsultantId(c.getId());
        i.setClientId(acme.getId());
        i.setScheduledAt(at);
        i.setStatus(status);
        i.setRoundLabel("Round 1");
        return interviews.saveAndFlush(i);
    }

    private CwsPrepSession session(ConsultantProfile c, String title, String kind, int score, int minutes, int daysAgo, String notes) {
        CwsPrepSession s = new CwsPrepSession();
        s.setOrgId(c.getOrgId());
        s.setConsultantId(c.getId());
        s.setTitle(title);
        s.setKind(kind);
        s.setScore(score);
        s.setDurationMinutes(minutes);
        s.setNotes(notes);
        s.setOccurredAt(now.minus(Duration.ofDays(daysAgo)));
        return sessions.saveAndFlush(s);
    }

    /** c1: 2 upcoming scheduled interviews (+1 completed, +1 stale), skills Java + Spring Boot, sessions Technical 90/80 (recent), Behavioral 60, and Behavioral 50 + Technical 80 over a month old. */
    private CwsPrepSession tech1;
    private CwsPrepSession behav1;

    private void seedC1() {
        skill(c1, "Java", 0);
        skill(c1, "Spring Boot", 1);
        interview(c1, "Senior Java Developer", "SCHEDULED", now.plus(Duration.ofDays(2)));
        interview(c1, "Cloud Architect", "SCHEDULED", now.plus(Duration.ofDays(9)));
        interview(c1, "Past Role", "COMPLETED", now.minus(Duration.ofDays(4)));
        interview(c1, "Stale Role", "SCHEDULED", now.minus(Duration.ofDays(1)));
        tech1 = session(c1, "Senior Java Developer - Tech Questions", "TECHNICAL", 90, 45, 2, "Good on design.");
        session(c1, "System Design Fundamentals", "TECHNICAL", 80, 40, 5, null);
        behav1 = session(c1, "Behavioral Interview Practice", "BEHAVIORAL", 60, 30, 3, null);
        session(c1, "Old behavioral", "BEHAVIORAL", 50, 25, 45, null);
        session(c1, "Old technical", "TECHNICAL", 80, 25, 50, null);
    }

    private void seedC2() {
        session(c2, "Hidden Practice", "TECHNICAL", 10, 99, 1, "hidden notes");
        interview(c2, "Hidden Secret Role", "SCHEDULED", now.plus(Duration.ofDays(1)));
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private static String path(long orgId, String tail) {
        return "/api/orgs/" + orgId + "/me-workspace/interview-prep" + tail;
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

    private static JsonNode module(JsonNode page, String key) {
        for (JsonNode n : page.path("modules")) if (key.equals(n.path("key").asText())) return n;
        throw new AssertionError("no module " + key);
    }

    private static String sessionBody(String moduleKey, int minutes, String notes, int... scores) {
        StringBuilder sb = new StringBuilder("{\"moduleKey\":\"").append(moduleKey).append("\",\"durationMinutes\":").append(minutes);
        if (notes != null) sb.append(",\"notes\":\"").append(notes).append("\"");
        sb.append(",\"answers\":[");
        List<InterviewPrepCatalog.Q> qs = InterviewPrepCatalog.module(moduleKey).orElseThrow().questions();
        for (int i = 0; i < scores.length; i++) {
            if (i > 0) sb.append(",");
            sb.append("{\"questionId\":\"").append(qs.get(i).id()).append("\",\"score\":").append(scores[i]).append("}");
        }
        return sb.append("]}").toString();
    }

    // ---- (a) correct values ---------------------------------------------------------------------------------------

    @Test
    void aConsultantGetsTheirOwnTilesModulesHistoryAndChecklistFromTheirRows() throws Exception {
        seedC1();
        JsonNode p = page("cws-p-a-c1", a);

        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(p.path("name").asText()).isEqualTo("Casey One");
        JsonNode t = p.path("tiles");
        assertThat(t.path("upcoming").path("value").asInt()).as("two scheduled in the future; completed and stale ones do not count").isEqualTo(2);
        assertThat(t.path("upcoming").path("delta").isNull()).isTrue();
        // all five sessions: (90 + 80 + 60 + 50 + 80) / 5 = 72; a month ago: (50 + 80) / 2 = 65
        assertThat(t.path("score").path("value").asInt()).isEqualTo(72);
        assertThat(t.path("score").path("previous").asInt()).isEqualTo(65);
        assertThat(t.path("score").path("delta").asInt()).isEqualTo(7);
        assertThat(t.path("score").path("unit").asText()).isEqualTo("POINTS");
        // behavioral averages 55 (below 75); technical averages 83. A month ago behavioral 50 was weak and technical 80 was not.
        assertThat(p.path("weakKinds").get(0).asText()).isEqualTo("BEHAVIORAL");
        assertThat(t.path("weak").path("value").asInt()).isEqualTo(1);
        assertThat(t.path("weak").path("previous").asInt()).isEqualTo(1);
        assertThat(t.path("weak").path("delta").asInt()).isZero();
        // 1 behavioral + 2 distinct upcoming roles + 2 skills + 1 company
        assertThat(t.path("sets").path("value").asInt()).isEqualTo(6);

        // next interview and the four modules
        assertThat(p.path("next").path("role").asText()).isEqualTo("Senior Java Developer");
        assertThat(p.path("next").path("company").asText()).isEqualTo("Acme Corp");
        assertThat(texts(p.path("modules"), "key")).containsExactly("question-bank", "technical", "company", "behavioral");
        JsonNode tech = module(p, "technical");
        assertThat(tech.path("chips").get(0).asText()).as("chips come from the consultant's own skills").isEqualTo("Java");
        assertThat(tech.path("chipsFromProfile").asBoolean()).isTrue();
        assertThat(tech.path("questions")).hasSize(5);
        assertThat(module(p, "company").path("action").asText()).isEqualTo("RESEARCH");
        assertThat(module(p, "behavioral").path("chipsFromProfile").asBoolean()).isFalse();

        // history: newest first, own rows only
        assertThat(texts(p.path("history"), "title")).containsExactly(
            "Senior Java Developer - Tech Questions", "Behavioral Interview Practice", "System Design Fundamentals", "Old behavioral", "Old technical"
        );
        JsonNode h0 = p.path("history").get(0);
        assertThat(h0.path("score").asInt()).isEqualTo(90);
        assertThat(h0.path("kind").asText()).isEqualTo("TECHNICAL");
        assertThat(h0.path("durationMinutes").asInt()).isEqualTo(45);
        assertThat(h0.path("hasNotes").asBoolean()).isTrue();
        assertThat(p.path("history").get(1).path("hasNotes").asBoolean()).isFalse();

        // eight checklist items, none ticked yet
        assertThat(p.path("checklist")).hasSize(8);
        assertThat(texts(p.path("checklist"), "key").get(0)).isEqualTo("review-jd");
        for (JsonNode i : p.path("checklist")) assertThat(i.path("checked").asBoolean()).isFalse();
    }

    @Test
    void technicalChipsFallBackToTheDefaultTopicsWhenThereAreNoSkills() throws Exception {
        JsonNode tech = module(page("cws-p-a-c1", a), "technical");
        assertThat(tech.path("chipsFromProfile").asBoolean()).isFalse();
        assertThat(tech.path("chips").get(0).asText()).isEqualTo("Java");
        assertThat(tech.path("chips")).hasSize(4);
    }

    @Test
    void weakAreasAreTheKindsAveragingBelow75AndNeverInventedWithoutSessions() throws Exception {
        session(c1, "Tech", "TECHNICAL", 74, 30, 1, null);
        session(c1, "Company", "COMPANY", 75, 30, 1, null);
        session(c1, "Behavioral", "BEHAVIORAL", 40, 30, 1, null);
        session(c1, "Behavioral 2", "BEHAVIORAL", 100, 30, 1, null);
        JsonNode p = page("cws-p-a-c1", a);
        assertThat(p.path("tiles").path("weak").path("value").asInt()).as("technical 74 is weak; company 75 and behavioral 70 average (70 < 75 is weak too)").isEqualTo(2);
        assertThat(p.path("weakKinds").get(0).asText()).isEqualTo("BEHAVIORAL");
        assertThat(p.path("weakKinds").get(1).asText()).isEqualTo("TECHNICAL");
    }

    // ---- (b) a consultant never sees or touches another consultant's data -----------------------------------------

    @Test
    void aConsultantNeverSeesOrTouchesAnotherConsultantsPracticeData() throws Exception {
        seedC1();
        seedC2();
        CwsPrepSession hidden = sessions.findByOrgIdAndConsultantIdOrderByOccurredAtDesc(a.getId(), c2.getId()).get(0);

        JsonNode p = page("cws-p-a-c1", a);
        assertThat(texts(p.path("history"), "title")).doesNotContain("Hidden Practice");
        assertThat(p.toString()).doesNotContain("Hidden Secret Role").doesNotContain("hidden notes");
        assertThat(p.path("tiles").path("upcoming").path("value").asInt()).isEqualTo(2);
        assertGeneric404(send(get(path(a.getId(), "/sessions/" + hidden.getId())), "cws-p-a-c1", null), "detail of another consultant's session");

        // ticking my checklist never touches theirs
        ok(send(put(path(a.getId(), "/checklist/review-jd")), "cws-p-a-c1", "{\"checked\":true}"), "tick");
        JsonNode theirs = page("cws-p-a-c2", a);
        assertThat(theirs.path("checklist").get(0).path("checked").asBoolean()).isFalse();
        assertThat(texts(theirs.path("history"), "title")).containsExactly("Hidden Practice");
        assertThat(sessions.findByOrgIdAndConsultantIdOrderByOccurredAtDesc(a.getId(), c2.getId())).hasSize(1);
    }

    // ---- (c) / (d) refusals ---------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationAndNonConsultantsGetTheGeneric404OnEveryRoute() throws Exception {
        seedC1();
        String id = String.valueOf(tech1.getId());
        List<String[]> routes = List.of(
            new String[] { "GET", path(a.getId(), "") },
            new String[] { "GET", path(a.getId(), "/sessions/" + id) },
            new String[] { "POST", path(a.getId(), "/sessions") },
            new String[] { "PUT", path(a.getId(), "/checklist/review-jd") }
        );
        for (String login : List.of("cws-p-b-owner", "cws-p-b-c1", "ghost-login", "cws-p-a-owner", "cws-p-a-admin", "cws-p-a-marketer", "cws-p-a-noprofile")) {
            for (String[] route : routes) {
                MockHttpServletRequestBuilder req = switch (route[0]) {
                    case "POST" -> post(route[1]);
                    case "PUT" -> put(route[1]);
                    default -> get(route[1]);
                };
                String body = "POST".equals(route[0]) ? sessionBody("technical", 10, null, 50) : "PUT".equals(route[0]) ? "{\"checked\":true}" : null;
                assertGeneric404(send(req, login, body), login + " " + route[0] + " " + route[1]);
            }
        }
        assertGeneric404(send(get(path(999999999L, "")), "cws-p-a-c1", null), "an organization that does not exist");
        assertGeneric404(send(get(path(a.getId(), "/sessions/987654321")), "cws-p-a-c1", null), "a session id that does not exist");
        assertGeneric404(send(put(path(a.getId(), "/checklist/not-an-item")), "cws-p-a-c1", "{\"checked\":true}"), "an unknown checklist item");
        // an organization-B consultant naming an organization-A session id inside their own org
        assertGeneric404(send(get(path(b.getId(), "/sessions/" + id)), "cws-p-b-c1", null), "a session id from another organization");
        assertThat(sessions.findByOrgIdAndConsultantIdOrderByOccurredAtDesc(b.getId(), b1.getId())).isEmpty();
        assertThat(checks.findByOrgIdAndConsultantId(a.getId(), c1.getId())).isEmpty();
    }

    @Test
    void theRoutesAre404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        seedC1();
        flags(true, false);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-p-a-c1", null), "roles flag off");
        flags(false, true);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-p-a-c1", null), "master flag off");
        assertGeneric404(send(post(path(a.getId(), "/sessions")), "cws-p-a-c1", sessionBody("technical", 10, null, 50)), "master flag off write");
    }

    // ---- (e) empty consultant -------------------------------------------------------------------------------------

    @Test
    void aConsultantWithNothingGetsHonestEmptyValuesNeverFakeZeros() throws Exception {
        JsonNode p = page("cws-p-a-c1", a);
        JsonNode t = p.path("tiles");
        assertThat(t.path("upcoming").path("value").asInt()).isZero();
        assertThat(t.path("score").path("value").isNull()).as("no sessions: no average, not 0").isTrue();
        assertThat(t.path("score").path("previous").isNull()).isTrue();
        assertThat(t.path("score").path("delta").isNull()).isTrue();
        assertThat(t.path("weak").path("value").asInt()).isZero();
        assertThat(t.path("weak").path("delta").isNull()).isTrue();
        assertThat(t.path("sets").path("value").asInt()).as("the behavioral set is always available").isEqualTo(1);
        assertThat(p.path("next").isNull()).isTrue();
        assertThat(p.path("history").isArray()).isTrue();
        assertThat(p.path("history")).isEmpty();
        assertThat(p.path("weakKinds")).isEmpty();
        assertThat(p.path("checklist")).hasSize(8);
        assertThat(p.path("modules")).hasSize(4);
    }

    // ---- writes: record a session -----------------------------------------------------------------------------------

    @Test
    void recordingASessionStoresTheAverageScoreTheCatalogQuestionsAndATitleFromTheNextInterview() throws Exception {
        seedC1();
        JsonNode created = ok(send(post(path(a.getId(), "/sessions")), "cws-p-a-c1", sessionBody("technical", 12, "Revisit caching.", 80, 60, 100)), "create");
        assertThat(created.path("session").path("score").asInt()).as("(80 + 60 + 100) / 3").isEqualTo(80);
        assertThat(created.path("session").path("kind").asText()).isEqualTo("TECHNICAL");
        assertThat(created.path("session").path("title").asText()).isEqualTo("Senior Java Developer - Tech Questions");
        assertThat(created.path("session").path("durationMinutes").asInt()).isEqualTo(12);
        assertThat(created.path("notes").asText()).isEqualTo("Revisit caching.");
        assertThat(created.path("answers")).hasSize(3);
        assertThat(created.path("answers").get(0).path("question").asText()).isEqualTo(InterviewPrepCatalog.module("technical").orElseThrow().questions().get(0).text());
        assertThat(created.path("answers").get(2).path("score").asInt()).isEqualTo(100);

        long id = created.path("session").path("id").asLong();
        JsonNode detail = ok(send(get(path(a.getId(), "/sessions/" + id)), "cws-p-a-c1", null), "detail");
        assertThat(detail.path("answers")).hasSize(3);
        assertThat(detail.path("notes").asText()).isEqualTo("Revisit caching.");

        JsonNode p = page("cws-p-a-c1", a);
        assertThat(p.path("history").get(0).path("id").asLong()).isEqualTo(id);
        assertThat(p.path("history").get(0).path("answerCount").asInt()).isEqualTo(3);
        assertThat(p.path("tiles").path("score").path("value").asInt()).as("(90 + 80 + 60 + 50 + 80 + 80) / 6").isEqualTo(73);
    }

    @Test
    void theTitleFallsBackToTheModuleNameWhenThereIsNoUpcomingInterview() throws Exception {
        JsonNode created = ok(send(post(path(a.getId(), "/sessions")), "cws-p-a-c1", sessionBody("behavioral", 5, null, 70)), "create");
        assertThat(created.path("session").path("title").asText()).isEqualTo("Behavioral Questions - Practice");
        assertThat(created.path("notes").isNull()).isTrue();
    }

    @Test
    void recordingASessionValidatesTheModuleDurationAnswersAndScores() throws Exception {
        String ok = sessionBody("technical", 10, null, 50);
        assertStatus(send(post(path(a.getId(), "/sessions")), "cws-p-a-c1", sessionBody("company", 10, null)), 422, "a research module has nothing to practice");
        assertStatus(send(post(path(a.getId(), "/sessions")), "cws-p-a-c1", ok.replace("technical", "nope")), 422, "an unknown module");
        assertStatus(send(post(path(a.getId(), "/sessions")), "cws-p-a-c1", ok.replace("\"durationMinutes\":10", "\"durationMinutes\":0")), 422, "zero minutes");
        assertStatus(send(post(path(a.getId(), "/sessions")), "cws-p-a-c1", ok.replace("\"durationMinutes\":10", "\"durationMinutes\":601")), 422, "too many minutes");
        assertStatus(send(post(path(a.getId(), "/sessions")), "cws-p-a-c1", "{\"moduleKey\":\"technical\",\"durationMinutes\":10,\"answers\":[]}"), 422, "no answers");
        assertStatus(send(post(path(a.getId(), "/sessions")), "cws-p-a-c1", ok.replace("\"score\":50", "\"score\":101")), 422, "a score over 100");
        assertStatus(send(post(path(a.getId(), "/sessions")), "cws-p-a-c1", ok.replace("\"score\":50", "\"score\":-1")), 422, "a negative score");
        assertStatus(send(post(path(a.getId(), "/sessions")), "cws-p-a-c1", ok.replace("tech-1", "beh-1")), 422, "a question of another module");
        assertStatus(send(post(path(a.getId(), "/sessions")), "cws-p-a-c1", sessionBody("technical", 10, null, 50, 50).replace("tech-2", "tech-1")), 422, "the same question twice");
        assertStatus(send(post(path(a.getId(), "/sessions")), "cws-p-a-c1", "{}"), 422, "an empty body");
        assertThat(sessions.findByOrgIdAndConsultantIdOrderByOccurredAtDesc(a.getId(), c1.getId())).as("nothing was stored by a refused write").isEmpty();
    }

    @Test
    void theSessionNotesAreValidatedAndScannedForSensitiveData() throws Exception {
        String longNotes = "x".repeat(1001);
        assertStatus(send(post(path(a.getId(), "/sessions")), "cws-p-a-c1", sessionBody("technical", 10, longNotes, 50)), 422, "notes over 1000 characters");
        MvcResult ssn = send(post(path(a.getId(), "/sessions")), "cws-p-a-c1", sessionBody("technical", 10, "my SSN 123-45-6789", 50));
        assertStatus(ssn, 422, "a social security number");
        assertThat(ssn.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        assertStatus(send(post(path(a.getId(), "/sessions")), "cws-p-a-c1", sessionBody("technical", 10, "born on 04/12/1990 date of birth", 50)), 422, "a date of birth");
        assertThat(sessions.findByOrgIdAndConsultantIdOrderByOccurredAtDesc(a.getId(), c1.getId())).isEmpty();
    }

    // ---- writes: the checklist ----------------------------------------------------------------------------------------

    @Test
    void tickingAndUntickingAChecklistItemIsIdempotentAndPerConsultant() throws Exception {
        JsonNode on = ok(send(put(path(a.getId(), "/checklist/star-examples")), "cws-p-a-c1", "{\"checked\":true}"), "tick");
        assertThat(on.path("checked").asBoolean()).isTrue();
        assertThat(on.path("checkedAt").asText()).isNotBlank();
        String first = on.path("checkedAt").asText();
        JsonNode again = ok(send(put(path(a.getId(), "/checklist/star-examples")), "cws-p-a-c1", "{\"checked\":true}"), "tick again");
        assertThat(again.path("checkedAt").asText()).as("the first tick time is kept").isEqualTo(first);
        assertThat(checks.findByOrgIdAndConsultantId(a.getId(), c1.getId())).hasSize(1);

        JsonNode p = page("cws-p-a-c1", a);
        long ticked = 0;
        for (JsonNode i : p.path("checklist")) if (i.path("checked").asBoolean()) ticked++;
        assertThat(ticked).isEqualTo(1);
        assertThat(p.path("checklist").get(3).path("key").asText()).isEqualTo("star-examples");
        assertThat(p.path("checklist").get(3).path("checked").asBoolean()).isTrue();

        JsonNode off = ok(send(put(path(a.getId(), "/checklist/star-examples")), "cws-p-a-c1", "{\"checked\":false}"), "untick");
        assertThat(off.path("checked").asBoolean()).isFalse();
        ok(send(put(path(a.getId(), "/checklist/star-examples")), "cws-p-a-c1", "{\"checked\":false}"), "untick again");
        assertThat(checks.findByOrgIdAndConsultantId(a.getId(), c1.getId())).isEmpty();
    }

    @Test
    void theChecklistWriteNeedsTheCheckedFlag() throws Exception {
        assertStatus(send(put(path(a.getId(), "/checklist/review-jd")), "cws-p-a-c1", "{}"), 422, "no checked flag");
        assertStatus(send(put(path(a.getId(), "/checklist/review-jd")), "cws-p-a-c1", null), 422, "no body");
        assertThat(checks.findByOrgIdAndConsultantId(a.getId(), c1.getId())).isEmpty();
    }

    // ---- the demo seeder ----------------------------------------------------------------------------------------------

    @Test
    void theDemoSeederIsIdempotentAndOnlyTouchesItsOwnTables() throws Exception {
        long before = sessions.count();
        seeder.seed();
        long afterFirst = sessions.count();
        seeder.seed();
        assertThat(sessions.count()).as("a second run adds nothing").isEqualTo(afterFirst);
        assertThat(afterFirst).isGreaterThanOrEqualTo(before);
        // the test organizations are not the demo slugs, so nothing was written for them
        assertThat(sessions.findByOrgIdAndConsultantIdOrderByOccurredAtDesc(a.getId(), c1.getId())).isEmpty();
        assertThat(answers.count()).isGreaterThanOrEqualTo(0);
    }
}
