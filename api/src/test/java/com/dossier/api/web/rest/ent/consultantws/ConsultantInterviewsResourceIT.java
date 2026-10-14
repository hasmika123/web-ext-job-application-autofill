package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.consultantws.CwsInterviewDetailRepository;
import com.dossier.api.repository.ent.consultantws.CwsInterviewFeedbackRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
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
import java.time.DayOfWeek;
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
 * The Consultant workspace Interviews page through the real chain on real rows: {@code /api/orgs/{orgId}/me-workspace/interviews}.
 * Every number is asserted against rows the test wrote, a consultant only ever sees and changes their own rows, every refusal is the
 * generic 404, free text and the meeting link go through validation and the sensitive-data guard, and no write ever creates or moves an interview.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConsultantInterviewsResourceIT {

    private static final String WHO = "cws-interviews-it";

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
    @Autowired private TalentApplicationRepository applications;
    @Autowired private TalentInterviewRepository interviews;
    @Autowired private CwsInterviewDetailRepository details;
    @Autowired private CwsInterviewFeedbackRepository feedback;

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
        a = fx.org("cws-i-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-i-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);
        staff(a, "cws-i-a-owner", OrgRole.OWNER);
        staff(a, "cws-i-a-admin", OrgRole.ADMIN);
        staff(a, "cws-i-a-marketer", OrgRole.MARKETER);
        staff(b, "cws-i-b-owner", OrgRole.OWNER);
        c1 = consultant(a, "cws-i-a-c1", "Casey One", true);
        c2 = consultant(a, "cws-i-a-c2", "Robin Two", true);
        consultant(a, "cws-i-a-noprofile", "Nobody", false);
        b1 = consultant(b, "cws-i-b-c1", "Bee Consultant", true);
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

    private TalentApplication application(Organization org, ConsultantProfile c, ClientAccount client, String title) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(org.getId());
        r.setClientId(client.getId());
        r.setTitle(title);
        r.setLocation("Austin, TX");
        r.setWorkMode("HYBRID");
        requirements.saveAndFlush(r);
        TalentApplication app = new TalentApplication();
        app.setOrgId(org.getId());
        app.setCode("CWS-I-" + System.nanoTime() + "-" + seq++);
        app.setRequirementId(r.getId());
        app.setConsultantId(c.getId());
        app.setClientId(client.getId());
        app.setStage("INTERVIEWING");
        app.setAppliedOn(LocalDate.now(ZoneOffset.UTC).minusDays(20));
        app.setStageChangedAt(now.minus(Duration.ofDays(2)));
        return applications.saveAndFlush(app);
    }

    private TalentInterview interview(Organization org, ConsultantProfile c, ClientAccount client, TalentApplication app, Instant at, Instant created, String status, String round, String interviewer) {
        TalentInterview i = new TalentInterview();
        i.setOrgId(org.getId());
        i.setApplicationId(app == null ? null : app.getId());
        i.setConsultantId(c.getId());
        i.setClientId(client.getId());
        i.setScheduledAt(at);
        i.setDurationMinutes(60);
        i.setStatus(status);
        i.setRoundLabel(round);
        i.setInterviewerName(interviewer);
        i.setCreatedAt(created);
        i.setUpdatedAt(created);
        return interviews.saveAndFlush(i);
    }

    private TalentInterview u1; // +1 day, UPCOMING, has an application ("Senior Java Developer")
    private TalentInterview u2; // +10 days, SCHEDULED later, booked 35 days ago
    private TalentInterview u3; // +3 days, UPCOMING
    private TalentInterview cancelled; // +2 days, CANCELLED
    private TalentInterview d1; // completed 3 days ago
    private TalentInterview d2; // completed 10 days ago
    private TalentInterview d3; // completed 40 days ago

    private void seedC1() {
        TalentApplication app = application(a, c1, acme, "Senior Java Developer");
        u1 = interview(a, c1, acme, app, now.plus(Duration.ofDays(1)), now.minus(Duration.ofDays(2)), "SCHEDULED", "Technical", "John Miller");
        u2 = interview(a, c1, acme, null, now.plus(Duration.ofDays(10)), now.minus(Duration.ofDays(35)), "SCHEDULED", "Final Round", "David Kim");
        u3 = interview(a, c1, acme, null, now.plus(Duration.ofDays(3)), now.minus(Duration.ofDays(1)), "SCHEDULED", "HR Round", "Priya Sharma");
        cancelled = interview(a, c1, acme, null, now.plus(Duration.ofDays(2)), now.minus(Duration.ofDays(5)), "CANCELLED", "Cancelled Round", "Nobody Real");
        d1 = interview(a, c1, acme, null, now.minus(Duration.ofDays(3)), now.minus(Duration.ofDays(6)), "COMPLETED", "Technical", "Emily Chen");
        d2 = interview(a, c1, acme, null, now.minus(Duration.ofDays(10)), now.minus(Duration.ofDays(13)), "COMPLETED", "Phone Screen", "Sam Reed");
        d3 = interview(a, c1, acme, null, now.minus(Duration.ofDays(40)), now.minus(Duration.ofDays(43)), "COMPLETED", "Phone Screen", "Old Timer");
    }

    private TalentInterview hidden;

    private void seedC2() {
        ClientAccount other = client(a, "Globex Hidden");
        hidden = interview(a, c2, other, application(a, c2, other, "Hidden Secret Role"), now.plus(Duration.ofDays(2)), now.minus(Duration.ofDays(1)), "SCHEDULED", "Secret Round", "Hidden Interviewer");
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private static String path(long orgId, String tail) {
        return "/api/orgs/" + orgId + "/me-workspace/interviews" + tail;
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

    private JsonNode detail(String login, Organization org, long id) throws Exception {
        return ok(send(get(path(org.getId(), "/" + id)), login, null), "detail " + id);
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

    private static Instant weekStart(Instant t) {
        LocalDate d = t.atZone(ZoneOffset.UTC).toLocalDate();
        LocalDate sunday = d.getDayOfWeek() == DayOfWeek.SUNDAY ? d : d.minusDays(d.getDayOfWeek().getValue());
        return sunday.atStartOfDay().toInstant(ZoneOffset.UTC);
    }

    private static String detailBody(String mode, String url, String title, String note) {
        return "{\"mode\":" + q(mode) + ",\"meetingUrl\":" + q(url) + ",\"interviewerTitle\":" + q(title) + ",\"prepNote\":" + q(note) + "}";
    }

    private static String q(String v) {
        return v == null ? "null" : "\"" + v.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static String fbBody(String outcome, String summary) {
        return "{\"outcome\":" + q(outcome) + ",\"summary\":" + q(summary) + "}";
    }

    // ---- (a) correct values ---------------------------------------------------------------------------------------

    @Test
    void aConsultantGetsTheirOwnUpcomingInterviewsTilesCalendarAndFeedbackFromTheirRows() throws Exception {
        seedC1();
        JsonNode p = page("cws-i-a-c1", a);

        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(p.path("name").asText()).isEqualTo("Casey One");

        // only scheduled ones that are not over yet, soonest first; cancelled and completed are not listed
        JsonNode up = p.path("upcoming");
        assertThat(texts(up, "round")).containsExactly("Technical", "HR Round", "Final Round");
        JsonNode r1 = up.get(0);
        assertThat(r1.path("id").asLong()).isEqualTo(u1.getId());
        assertThat(r1.path("title").asText()).isEqualTo("Senior Java Developer");
        assertThat(r1.path("company").asText()).isEqualTo("Acme Corp");
        assertThat(r1.path("location").asText()).isEqualTo("Austin, TX");
        assertThat(r1.path("workMode").asText()).isEqualTo("HYBRID");
        assertThat(r1.path("interviewerName").asText()).isEqualTo("John Miller");
        assertThat(r1.path("interviewerTitle").isNull()).as("a title nobody stored is not invented").isTrue();
        assertThat(r1.path("mode").isNull()).as("no mode until the consultant sets one").isTrue();
        assertThat(r1.path("meetingUrl").isNull()).isTrue();
        assertThat(r1.path("durationMinutes").asInt()).isEqualTo(60);
        assertThat(r1.path("status").asText()).isEqualTo("SCHEDULED");
        assertThat(r1.path("chip").asText()).isEqualTo("UPCOMING");
        assertThat(up.get(1).path("chip").asText()).isEqualTo("UPCOMING");
        assertThat(up.get(2).path("chip").asText()).as("10 days away").isEqualTo("SCHEDULED");
        assertThat(up.get(2).path("title").asText()).as("no application: honest fallback").isEqualTo("Interview");

        JsonNode t = p.path("tiles");
        assertThat(t.path("upcoming").path("value").asLong()).isEqualTo(3);
        assertThat(t.path("upcoming").path("previous").asLong()).as("only the one booked 35 days ago was ahead a month ago").isEqualTo(1);
        assertThat(t.path("upcoming").path("deltaPct").asDouble()).isEqualTo(200.0);
        assertThat(t.path("upcoming").path("vs").asText()).isEqualTo("last month");
        assertThat(t.path("upcoming").path("sparkline")).hasSize(6);
        Instant ws = weekStart(now);
        long expectedWeek = List.of(u1, u2, u3, d1, d2, d3).stream().filter(i -> weekStart(i.getScheduledAt()).equals(ws)).count();
        assertThat(t.path("thisWeek").path("value").asLong()).as("scheduled or completed in this Sunday-Saturday week, cancelled excluded").isEqualTo(expectedWeek);
        assertThat(t.path("thisWeek").path("vs").asText()).isEqualTo("last week");
        assertThat(t.path("completed").path("value").asLong()).isEqualTo(3);
        assertThat(t.path("completed").path("previous").asLong()).as("two were done a week ago").isEqualTo(2);
        assertThat(t.path("completed").path("deltaPct").asDouble()).isEqualTo(50.0);
        assertThat(t.path("feedbackPending").path("value").asLong()).isEqualTo(3);
        assertThat(t.path("feedbackPending").path("sparkline")).hasSize(6);

        // calendar: every non-cancelled interview, with its state
        JsonNode cal = p.path("calendar");
        assertThat(cal).hasSize(6);
        assertThat(texts(cal, "state")).containsExactlyInAnyOrder("COMPLETED", "COMPLETED", "COMPLETED", "UPCOMING", "UPCOMING", "SCHEDULED");
        assertThat(p.path("calendar").toString()).doesNotContain("Cancelled Round");

        assertThat(p.path("feedback")).isEmpty();
        assertThat(texts(p.path("pendingFeedback"), "interviewId")).containsExactly(String.valueOf(d1.getId()), String.valueOf(d2.getId()), String.valueOf(d3.getId()));
    }

    @Test
    void recentFeedbackListsTheNewestFiveInterviewsWithFeedbackAndNothingElse() throws Exception {
        seedC1();
        assertStatus(send(post(path(a.getId(), "/" + d1.getId() + "/feedback")), "cws-i-a-c1", fbBody("POSITIVE", "Good technical talk.")), 200, "d1");
        assertStatus(send(post(path(a.getId(), "/" + d3.getId() + "/feedback")), "cws-i-a-c1", fbBody("NEUTRAL", "It was fine.")), 200, "d3");
        JsonNode p = page("cws-i-a-c1", a);
        JsonNode f = p.path("feedback");
        assertThat(texts(f, "interviewId")).as("newest interview first").containsExactly(String.valueOf(d1.getId()), String.valueOf(d3.getId()));
        assertThat(f.get(0).path("outcome").asText()).isEqualTo("POSITIVE");
        assertThat(f.get(0).path("summary").asText()).isEqualTo("Good technical talk.");
        assertThat(f.get(0).path("interviewedAt").asText()).isNotBlank();
        assertThat(texts(p.path("pendingFeedback"), "interviewId")).containsExactly(String.valueOf(d2.getId()));
        assertThat(p.path("tiles").path("feedbackPending").path("value").asLong()).isEqualTo(1);
    }

    @Test
    void detailShowsTheInterviewWithJoinDetailsAndFlagsWhatCanBeEdited() throws Exception {
        seedC1();
        JsonNode d = detail("cws-i-a-c1", a, u1.getId());
        assertThat(d.path("interview").path("title").asText()).isEqualTo("Senior Java Developer");
        assertThat(d.path("applicationCode").asText()).startsWith("CWS-I-");
        assertThat(d.path("canEditDetails").asBoolean()).isTrue();
        assertThat(d.path("canRecordFeedback").asBoolean()).isFalse();
        assertThat(d.path("feedback").isNull()).isTrue();
        JsonNode done = detail("cws-i-a-c1", a, d1.getId());
        assertThat(done.path("canEditDetails").asBoolean()).isFalse();
        assertThat(done.path("canRecordFeedback").asBoolean()).isTrue();
        assertThat(done.path("applicationCode").isNull()).isTrue();
    }

    // ---- (b) own rows only ----------------------------------------------------------------------------------------

    @Test
    void aConsultantNeverSeesOrTouchesAnotherConsultantsInterviews() throws Exception {
        seedC1();
        seedC2();
        MvcResult r = send(get(path(a.getId(), "")), "cws-i-a-c1", null);
        String text = r.getResponse().getContentAsString();
        assertThat(text).doesNotContain("Hidden").doesNotContain("Globex").doesNotContain("Robin Two").doesNotContain("Secret");
        assertThat(om.readTree(text).path("tiles").path("upcoming").path("value").asLong()).isEqualTo(3);

        String id = String.valueOf(hidden.getId());
        assertGeneric404(send(get(path(a.getId(), "/" + id)), "cws-i-a-c1", null), "detail of another consultant's interview");
        assertGeneric404(send(put(path(a.getId(), "/" + id + "/detail")), "cws-i-a-c1", detailBody("VIDEO", "https://meet.example.org/x", null, "note")), "detail write on another's interview");
        assertGeneric404(send(post(path(a.getId(), "/" + id + "/feedback")), "cws-i-a-c1", fbBody("POSITIVE", "x")), "feedback on another's interview");
        assertGeneric404(send(put(path(a.getId(), "/" + id + "/feedback")), "cws-i-a-c1", fbBody("POSITIVE", "x")), "feedback edit on another's interview");
        assertThat(details.findByOrgIdAndConsultantId(a.getId(), c2.getId())).isEmpty();
        assertThat(feedback.findByOrgIdAndConsultantId(a.getId(), c2.getId())).isEmpty();

        // c1's own join details and feedback never show for c2, and c2's page lists only their interview
        assertStatus(send(put(path(a.getId(), "/" + u1.getId() + "/detail")), "cws-i-a-c1", detailBody("VIDEO", "https://meet.example.org/c1", "VP Engineering", "c1 note")), 200, "c1 saves");
        assertStatus(send(post(path(a.getId(), "/" + d1.getId() + "/feedback")), "cws-i-a-c1", fbBody("POSITIVE", "c1 secret feedback")), 200, "c1 feedback");
        JsonNode p2 = page("cws-i-a-c2", a);
        assertThat(texts(p2.path("upcoming"), "title")).containsExactly("Hidden Secret Role");
        assertThat(p2.toString()).doesNotContain("c1 note").doesNotContain("c1 secret feedback").doesNotContain("Casey One").doesNotContain("meet.example.org/c1");
        assertThat(p2.path("feedback")).isEmpty();
        assertThat(p2.path("tiles").path("completed").path("value").asLong()).isZero();
    }

    // ---- (c) / (d) refusals ---------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationAndNonConsultantsGetTheGeneric404OnEveryRoute() throws Exception {
        seedC1();
        String id = String.valueOf(u1.getId());
        String done = String.valueOf(d1.getId());
        List<String[]> routes = List.of(
            new String[] { "GET", path(a.getId(), ""), null },
            new String[] { "GET", path(a.getId(), "/" + id), null },
            new String[] { "PUT", path(a.getId(), "/" + id + "/detail"), detailBody("VIDEO", null, null, null) },
            new String[] { "POST", path(a.getId(), "/" + done + "/feedback"), fbBody("POSITIVE", "ok") },
            new String[] { "PUT", path(a.getId(), "/" + done + "/feedback"), fbBody("POSITIVE", "ok") }
        );
        for (String login : List.of("cws-i-b-owner", "cws-i-b-c1", "ghost-login", "cws-i-a-owner", "cws-i-a-admin", "cws-i-a-marketer", "cws-i-a-noprofile")) {
            for (String[] route : routes) {
                MockHttpServletRequestBuilder req = switch (route[0]) {
                    case "POST" -> post(route[1]);
                    case "PUT" -> put(route[1]);
                    default -> get(route[1]);
                };
                assertGeneric404(send(req, login, route[2]), login + " " + route[0] + " " + route[1]);
            }
        }
        assertGeneric404(send(get(path(999999999L, "")), "cws-i-a-c1", null), "an organization that does not exist");
        assertGeneric404(send(get(path(a.getId(), "/987654321")), "cws-i-a-c1", null), "an interview id that does not exist");
        assertGeneric404(send(put(path(a.getId(), "/987654321/detail")), "cws-i-a-c1", detailBody(null, null, null, null)), "write on an id that does not exist");
        // another tenant's consultant cannot reach this org's interview through their own org either
        assertGeneric404(send(get(path(b.getId(), "/" + id)), "cws-i-b-c1", null), "an interview id from another organization");
        assertGeneric404(send(put(path(b.getId(), "/" + id + "/detail")), "cws-i-b-c1", detailBody("VIDEO", null, null, "x")), "a write with another organization's id");
        assertThat(b1.getOrgId()).isEqualTo(b.getId());
        assertThat(details.findByOrgIdAndConsultantId(a.getId(), c1.getId())).as("nothing written by any refused call").isEmpty();
        assertThat(feedback.findByOrgIdAndConsultantId(a.getId(), c1.getId())).isEmpty();
    }

    @Test
    void theRoutesAre404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        seedC1();
        flags(true, false);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-i-a-c1", null), "roles flag off");
        flags(false, true);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-i-a-c1", null), "master flag off");
        assertGeneric404(send(put(path(a.getId(), "/" + u1.getId() + "/detail")), "cws-i-a-c1", detailBody("VIDEO", null, null, null)), "write with the master flag off");
    }

    // ---- (e) empty consultant -------------------------------------------------------------------------------------

    @Test
    void aConsultantWithNoInterviewsGetsZerosAndEmptyListsNeverNulls() throws Exception {
        JsonNode p = page("cws-i-a-c1", a);
        for (String tile : List.of("upcoming", "thisWeek", "completed", "feedbackPending")) {
            JsonNode t = p.path("tiles").path(tile);
            assertThat(t.path("value").asLong()).as(tile).isZero();
            assertThat(t.path("previous").asLong()).as(tile).isZero();
            assertThat(t.get("deltaPct").isNull()).as(tile + " has no delta, not a made-up one").isTrue();
            assertThat(t.path("sparkline")).as(tile).hasSize(6);
            for (JsonNode n : t.path("sparkline")) assertThat(n.asLong()).isZero();
        }
        for (String list : List.of("upcoming", "calendar", "feedback", "pendingFeedback")) {
            assertThat(p.get(list).isArray()).as(list).isTrue();
            assertThat(p.get(list)).as(list).isEmpty();
        }
    }

    // ---- writes: join details -------------------------------------------------------------------------------------

    @Test
    void savingJoinDetailsStoresThemOnlyForTheConsultantAndNeverMovesTheInterview() throws Exception {
        seedC1();
        long before = interviews.countByOrgId(a.getId());
        Instant at = interviews.findById(u1.getId()).orElseThrow().getScheduledAt();

        JsonNode saved = ok(send(put(path(a.getId(), "/" + u1.getId() + "/detail")), "cws-i-a-c1", detailBody("video", "  https://meet.example.org/j/123456789?pwd=abc  ", "VP of Technology", "Bring the portfolio.")), "save");
        JsonNode iv = saved.path("interview");
        assertThat(iv.path("mode").asText()).isEqualTo("VIDEO");
        assertThat(iv.path("meetingUrl").asText()).isEqualTo("https://meet.example.org/j/123456789?pwd=abc");
        assertThat(iv.path("interviewerTitle").asText()).isEqualTo("VP of Technology");
        assertThat(iv.path("prepNote").asText()).isEqualTo("Bring the portfolio.");
        assertThat(details.findByOrgIdAndConsultantId(a.getId(), c1.getId())).hasSize(1);

        JsonNode p = page("cws-i-a-c1", a);
        assertThat(p.path("upcoming").get(0).path("mode").asText()).isEqualTo("VIDEO");
        assertThat(p.path("upcoming").get(0).path("meetingUrl").asText()).startsWith("https://meet.example.org/");
        assertThat(detail("cws-i-a-c1", a, u1.getId()).path("interview").path("interviewerTitle").asText()).isEqualTo("VP of Technology");

        // a second save replaces (one row), blank clears a field
        ok(send(put(path(a.getId(), "/" + u1.getId() + "/detail")), "cws-i-a-c1", detailBody("ONSITE", "", null, "  ")), "replace");
        assertThat(details.findByOrgIdAndConsultantId(a.getId(), c1.getId())).hasSize(1);
        JsonNode again = detail("cws-i-a-c1", a, u1.getId()).path("interview");
        assertThat(again.path("mode").asText()).isEqualTo("ONSITE");
        assertThat(again.path("meetingUrl").isNull()).isTrue();
        assertThat(again.path("interviewerTitle").isNull()).isTrue();
        assertThat(again.path("prepNote").isNull()).isTrue();

        assertThat(interviews.countByOrgId(a.getId())).as("no interview is created").isEqualTo(before);
        TalentInterview now1 = interviews.findById(u1.getId()).orElseThrow();
        assertThat(now1.getScheduledAt()).as("the time never moves").isEqualTo(at);
        assertThat(now1.getStatus()).isEqualTo("SCHEDULED");
        assertThat(now1.getInterviewerName()).isEqualTo("John Miller");
    }

    @Test
    void joinDetailsAreValidatedAndOnlyForScheduledInterviews() throws Exception {
        seedC1();
        String url = path(a.getId(), "/" + u1.getId() + "/detail");
        assertStatus(send(put(url), "cws-i-a-c1", detailBody("HOLOGRAM", null, null, null)), 422, "an unknown mode");
        assertStatus(send(put(url), "cws-i-a-c1", detailBody("VIDEO", "http://meet.example.org/x", null, null)), 422, "http link");
        assertStatus(send(put(url), "cws-i-a-c1", detailBody("VIDEO", "javascript:alert(1)", null, null)), 422, "javascript link");
        assertStatus(send(put(url), "cws-i-a-c1", detailBody("VIDEO", "https://meet.example.org/a b", null, null)), 422, "link with a space");
        assertStatus(send(put(url), "cws-i-a-c1", detailBody("VIDEO", "https://user:secret@meet.example.org/x", null, null)), 422, "link with credentials");
        assertStatus(send(put(url), "cws-i-a-c1", detailBody("VIDEO", "https://localhost/x", null, null)), 422, "host without a dot");
        assertStatus(send(put(url), "cws-i-a-c1", detailBody("VIDEO", "https://meet.example.org/" + "x".repeat(500), null, null)), 422, "link over 500 characters");
        assertStatus(send(put(url), "cws-i-a-c1", detailBody("VIDEO", null, "x".repeat(121), null)), 422, "title over 120");
        assertStatus(send(put(url), "cws-i-a-c1", detailBody("VIDEO", null, null, "x".repeat(2001))), 422, "note over 2000");
        // a completed or cancelled interview has nothing to join
        assertStatus(send(put(path(a.getId(), "/" + d1.getId() + "/detail")), "cws-i-a-c1", detailBody("VIDEO", null, null, "late")), 422, "completed interview");
        assertStatus(send(put(path(a.getId(), "/" + cancelled.getId() + "/detail")), "cws-i-a-c1", detailBody("VIDEO", null, null, "late")), 422, "cancelled interview");
        assertThat(details.findByOrgIdAndConsultantId(a.getId(), c1.getId())).as("a refused write stores nothing").isEmpty();
    }

    @Test
    void joinDetailTextIsScannedForSensitiveData() throws Exception {
        seedC1();
        String url = path(a.getId(), "/" + u1.getId() + "/detail");
        MvcResult ssn = send(put(url), "cws-i-a-c1", detailBody("VIDEO", null, null, "my SSN 123-45-6789"));
        assertStatus(ssn, 422, "a social security number in the note");
        assertThat(ssn.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        MvcResult dob = send(put(url), "cws-i-a-c1", detailBody("VIDEO", null, "date of birth 04/12/1990", null));
        assertStatus(dob, 422, "a date of birth in the title");
        assertThat(dob.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        assertThat(details.findByOrgIdAndConsultantId(a.getId(), c1.getId())).isEmpty();
    }

    // ---- writes: feedback -----------------------------------------------------------------------------------------

    @Test
    void feedbackIsAddedOnceEditedAndShownOnThePage() throws Exception {
        seedC1();
        String add = path(a.getId(), "/" + d1.getId() + "/feedback");
        JsonNode first = ok(send(post(add), "cws-i-a-c1", fbBody("positive", "  Strong technical skills.  ")), "add");
        assertThat(first.path("feedback").path("outcome").asText()).isEqualTo("POSITIVE");
        assertThat(first.path("feedback").path("summary").asText()).isEqualTo("Strong technical skills.");
        assertThat(first.path("interview").path("hasFeedback").asBoolean()).isTrue();
        assertStatus(send(post(add), "cws-i-a-c1", fbBody("NEUTRAL", "again")), 422, "a second add is refused");

        JsonNode edited = ok(send(put(add), "cws-i-a-c1", fbBody("NEUTRAL", "Went fine overall.")), "edit");
        assertThat(edited.path("feedback").path("outcome").asText()).isEqualTo("NEUTRAL");
        assertThat(feedback.findByOrgIdAndConsultantId(a.getId(), c1.getId())).hasSize(1);
        JsonNode p = page("cws-i-a-c1", a);
        assertThat(p.path("feedback").get(0).path("summary").asText()).isEqualTo("Went fine overall.");
        assertThat(p.path("tiles").path("feedbackPending").path("value").asLong()).isEqualTo(2);
        assertThat(detail("cws-i-a-c1", a, d1.getId()).path("feedback").path("outcome").asText()).isEqualTo("NEUTRAL");
        assertThat(interviews.findById(d1.getId()).orElseThrow().getStatus()).isEqualTo("COMPLETED");
    }

    @Test
    void feedbackIsValidatedScannedAndOnlyForCompletedInterviews() throws Exception {
        seedC1();
        String add = path(a.getId(), "/" + d1.getId() + "/feedback");
        assertStatus(send(post(add), "cws-i-a-c1", fbBody("GREAT", "ok")), 422, "unknown outcome");
        assertStatus(send(post(add), "cws-i-a-c1", fbBody(null, "ok")), 422, "missing outcome");
        assertStatus(send(post(add), "cws-i-a-c1", fbBody("POSITIVE", "   ")), 422, "blank summary");
        assertStatus(send(post(add), "cws-i-a-c1", fbBody("POSITIVE", null)), 422, "missing summary");
        assertStatus(send(post(add), "cws-i-a-c1", fbBody("POSITIVE", "x".repeat(1001))), 422, "summary over 1000");
        MvcResult ssn = send(post(add), "cws-i-a-c1", fbBody("POSITIVE", "they asked for my SSN 123-45-6789"));
        assertStatus(ssn, 422, "a social security number");
        assertThat(ssn.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        MvcResult dob = send(post(add), "cws-i-a-c1", fbBody("POSITIVE", "date of birth 04/12/1990"));
        assertStatus(dob, 422, "a date of birth");
        assertThat(dob.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        assertStatus(send(put(add), "cws-i-a-c1", fbBody("POSITIVE", "nothing to edit yet")), 422, "edit before any feedback exists");
        assertStatus(send(post(path(a.getId(), "/" + u1.getId() + "/feedback")), "cws-i-a-c1", fbBody("POSITIVE", "too early")), 422, "feedback on a scheduled interview");
        assertStatus(send(post(path(a.getId(), "/" + cancelled.getId() + "/feedback")), "cws-i-a-c1", fbBody("POSITIVE", "cancelled")), 422, "feedback on a cancelled interview");
        assertThat(feedback.findByOrgIdAndConsultantId(a.getId(), c1.getId())).as("a refused write stores nothing").isEmpty();

        // a stored summary can also not be edited into something sensitive
        assertStatus(send(post(add), "cws-i-a-c1", fbBody("POSITIVE", "fine")), 200, "valid add");
        assertStatus(send(put(add), "cws-i-a-c1", fbBody("POSITIVE", "SSN 123-45-6789")), 422, "edit into sensitive text");
        assertThat(feedback.findByOrgIdAndConsultantId(a.getId(), c1.getId()).get(0).getSummary()).isEqualTo("fine");
    }
}
