package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
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
import com.dossier.api.repository.ent.talent.TalentApplicationEventRepository;
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
 * The Consultant workspace My Applications page through the real chain on real rows: {@code /api/orgs/{orgId}/me-workspace/applications}.
 * Every number is asserted against rows the test wrote, a consultant only ever sees their own applications, and every refusal is the
 * generic 404. The page has no writes (the marketer prepares, the consultant submits outside Kiwiply), so there is nothing to scan.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConsultantApplicationsResourceIT {

    private static final String WHO = "cws-apps-it";

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
    @Autowired private TalentApplicationEventRepository eventRows;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private int seq = 0;

    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ConsultantProfile b1;
    private OrgMember marketer;
    private ClientAccount acme;
    private ClientAccount zeta;
    private ClientAccount beta;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cws-ap-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-ap-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);
        staff(a, "cws-ap-a-owner", OrgRole.OWNER);
        staff(a, "cws-ap-a-admin", OrgRole.ADMIN);
        marketer = staff(a, "cws-ap-a-marketer", OrgRole.MARKETER);
        staff(b, "cws-ap-b-owner", OrgRole.OWNER);
        c1 = consultant(a, "cws-ap-a-c1", "Casey One", true);
        c2 = consultant(a, "cws-ap-a-c2", "Robin Two", true);
        consultant(a, "cws-ap-a-noprofile", "Nobody", false);
        b1 = consultant(b, "cws-ap-b-c1", "Bee Consultant", true);
        acme = client(a, "Acme Corp");
        zeta = client(a, "Zeta Co");
        beta = client(a, "Beta Co");
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
        r.setEmploymentLabel("CONTRACT");
        r.setPostedAt(now.minus(Duration.ofDays(2)));
        return requirements.saveAndFlush(r);
    }

    private TalentApplication app(ConsultantProfile c, ClientAccount cl, String title, String stage, String reason, int createdDaysAgo, int appliedDaysAgo, String source) {
        ClientRequirement r = requirement(orgOf(c), cl, title);
        TalentApplication x = new TalentApplication();
        x.setOrgId(c.getOrgId());
        x.setCode("CWS-AP-" + System.nanoTime() + "-" + seq++);
        x.setRequirementId(r.getId());
        x.setConsultantId(c.getId());
        x.setClientId(cl.getId());
        x.setMarketerMemberId(marketer.getId());
        x.setStage(stage);
        x.setClosedReason(reason);
        x.setAppliedOn(LocalDate.now(ZoneOffset.UTC).minusDays(appliedDaysAgo));
        x.setSourceLabel(source);
        x.setNextAction("CLOSED".equals(stage) ? null : "Prepare for round");
        x.setNextActionDue("CLOSED".equals(stage) ? null : LocalDate.now(ZoneOffset.UTC).plusDays(3));
        x.setCreatedAt(now.minus(Duration.ofDays(createdDaysAgo)));
        x.setStageChangedAt(now.minus(Duration.ofDays(1)));
        return applications.saveAndFlush(x);
    }

    private Organization orgOf(ConsultantProfile c) {
        return c.getOrgId().equals(a.getId()) ? a : b;
    }

    private TalentApplicationEvent event(TalentApplication x, String type, String from, String to, Long actor, int daysAgo, String detail) {
        TalentApplicationEvent e = new TalentApplicationEvent();
        e.setOrgId(x.getOrgId());
        e.setApplicationId(x.getId());
        e.setEventType(type);
        e.setFromStage(from);
        e.setToStage(to);
        e.setActorMemberId(actor);
        e.setDetail(detail);
        e.setOccurredAt(now.minus(Duration.ofDays(daysAgo)));
        return eventRows.saveAndFlush(e);
    }

    private TalentApplication a1;
    private TalentApplication a2;
    private TalentApplication a3;
    private TalentApplication a4;
    private TalentApplication a5;
    private TalentApplication a6;

    /** c1: six applications covering every tile; histories chosen so each 30-day delta is checkable by hand. */
    private void seedC1() {
        Long me = c1.getMemberId();
        a1 = app(c1, acme, "Senior Java Developer", "UNDER_REVIEW", null, 60, 10, "Job Match");
        event(a1, "CREATED", null, "ASSIGNED", marketer.getId(), 60, null);
        event(a1, "STAGE_CHANGE", "ASSIGNED", "SUBMITTED", me, 50, null);
        event(a1, "STAGE_CHANGE", "SUBMITTED", "UNDER_REVIEW", null, 5, null);
        a2 = app(c1, zeta, "Backend Engineer", "INTERVIEWING", null, 40, 30, "Job Discovery");
        event(a2, "CREATED", null, "ASSIGNED", marketer.getId(), 40, null);
        event(a2, "STAGE_CHANGE", "ASSIGNED", "INTERVIEWING", marketer.getId(), 35, null);
        a3 = app(c1, beta, "Cloud Developer", "INTERVIEWING", null, 20, 12, "Marketer Referral");
        event(a3, "CREATED", null, "ASSIGNED", marketer.getId(), 20, null);
        event(a3, "STAGE_CHANGE", "ASSIGNED", "INTERVIEWING", me, 2, null);
        a4 = app(c1, acme, "Platform Engineer", "CLOSED", "REJECTED", 45, 44, "Direct Apply");
        event(a4, "CREATED", null, "ASSIGNED", marketer.getId(), 45, null);
        event(a4, "STAGE_CHANGE", "ASSIGNED", "SUBMITTED", marketer.getId(), 40, null);
        event(a4, "STAGE_CHANGE", "SUBMITTED", "CLOSED", marketer.getId(), 3, null);
        a5 = app(c1, acme, "Data Developer", "OFFER", null, 10, 9, "Company Website");
        event(a5, "CREATED", null, "ASSIGNED", marketer.getId(), 10, null);
        event(a5, "STAGE_CHANGE", "ASSIGNED", "OFFER", marketer.getId(), 1, null);
        a6 = app(c1, acme, "QA Developer", "ASSIGNED", null, 2, 1, null);
        // a note event is internal: it must never reach the consultant
        event(a1, "NOTE", null, null, marketer.getId(), 4, "internal-secret-note");
    }

    private void seedC2() {
        ClientAccount hidden = client(a, "Globex Hidden");
        TalentApplication h = app(c2, hidden, "Hidden Secret Role", "SUBMITTED", null, 5, 4, "Job Match");
        event(h, "CREATED", null, "ASSIGNED", marketer.getId(), 5, null);
        event(h, "STAGE_CHANGE", "ASSIGNED", "SUBMITTED", null, 4, null);
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private static String path(long orgId, String tail) {
        return "/api/orgs/" + orgId + "/me-workspace/applications" + tail;
    }

    private MvcResult send(MockHttpServletRequestBuilder req, String login, String body) throws Exception {
        if (body != null) req = req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private JsonNode ok(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(200);
        return om.readTree(body);
    }

    private JsonNode page(String login, Organization org, String query) throws Exception {
        return ok(send(get(path(org.getId(), query)), login, null), "page " + login);
    }

    private JsonNode detail(String login, Organization org, long id) throws Exception {
        return ok(send(get(path(org.getId(), "/" + id)), login, null), "detail " + id);
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

    private JsonNode step(JsonNode page, String key) {
        for (JsonNode n : page.path("funnel")) if (key.equals(n.path("key").asText())) return n;
        throw new AssertionError("no funnel step " + key);
    }

    // ---- (a) correct values ---------------------------------------------------------------------------------------

    @Test
    void aConsultantGetsTheirOwnTilesDeltasRowsFunnelAndRecentUpdatesFromTheirRows() throws Exception {
        seedC1();
        JsonNode p = page("cws-ap-a-c1", a, "");

        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(p.path("name").asText()).isEqualTo("Casey One");
        JsonNode t = p.path("tiles");
        // total: 6 now, 3 existed 30 days ago (a1, a2, a4)
        assertThat(t.path("total").path("value").asLong()).isEqualTo(6);
        assertThat(t.path("total").path("previous").asLong()).isEqualTo(3);
        assertThat(t.path("total").path("deltaPct").asDouble()).isEqualTo(100.0);
        assertThat(t.path("total").path("sparkline")).hasSize(6);
        assertThat(t.path("total").path("sparkline").get(5).asLong()).isEqualTo(6);
        // under review: a1 now; 30 days ago a1 and a4 were SUBMITTED
        assertThat(t.path("underReview").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("underReview").path("previous").asLong()).isEqualTo(2);
        assertThat(t.path("underReview").path("deltaPct").asDouble()).isEqualTo(-50.0);
        // interviews: a2 and a3 now; only a2 30 days ago
        assertThat(t.path("interviews").path("value").asLong()).isEqualTo(2);
        assertThat(t.path("interviews").path("previous").asLong()).isEqualTo(1);
        assertThat(t.path("interviews").path("deltaPct").asDouble()).isEqualTo(100.0);
        // rejected and offers had nothing 30 days ago: no made-up percentage
        assertThat(t.path("rejected").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("rejected").path("previous").asLong()).isZero();
        assertThat(t.path("rejected").path("deltaPct").isNull()).isTrue();
        assertThat(t.path("offers").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("offers").path("deltaPct").isNull()).isTrue();
        assertThat(t.path("offers").path("sparkline")).hasSize(6);
        assertThat(t.path("offers").path("sparkline").get(0).asLong()).isZero();

        // rows: newest applied first, every field from the rows
        JsonNode rows = p.path("rows");
        assertThat(texts(rows, "title")).containsExactly("QA Developer", "Data Developer", "Senior Java Developer", "Cloud Developer", "Backend Engineer", "Platform Engineer");
        JsonNode r = rows.get(2);
        assertThat(r.path("applicationId").asLong()).isEqualTo(a1.getId());
        assertThat(r.path("code").asText()).isEqualTo(a1.getCode());
        assertThat(r.path("company").asText()).isEqualTo("Acme Corp");
        assertThat(r.path("source").asText()).isEqualTo("Job Match");
        assertThat(r.path("stage").asText()).isEqualTo("UNDER_REVIEW");
        assertThat(r.path("appliedOn").asText()).isEqualTo(LocalDate.now(ZoneOffset.UTC).minusDays(10).toString());
        assertThat(r.path("nextAction").asText()).isEqualTo("Prepare for round");
        assertThat(r.path("nextActionDue").asText()).isEqualTo(LocalDate.now(ZoneOffset.UTC).plusDays(3).toString());
        assertThat(rows.get(5).path("closedReason").asText()).isEqualTo("REJECTED");
        assertThat(rows.get(5).path("nextAction").isNull()).isTrue();
        assertThat(rows.get(0).path("source").isNull()).as("no label stays empty, never invented").isTrue();
        assertThat(p.path("paging").path("total").asLong()).isEqualTo(6);
        assertThat(p.path("paging").path("pages").asInt()).isEqualTo(1);

        // funnel: counts and the share of all applications
        assertThat(step(p, "TOTAL").path("count").asLong()).isEqualTo(6);
        assertThat(step(p, "TOTAL").path("percent").asDouble()).isEqualTo(100.0);
        assertThat(step(p, "UNDER_REVIEW").path("count").asLong()).isEqualTo(1);
        assertThat(step(p, "INTERVIEWING").path("count").asLong()).isEqualTo(2);
        assertThat(step(p, "INTERVIEWING").path("percent").asDouble()).isEqualTo(33.3);
        assertThat(step(p, "OFFER").path("count").asLong()).isEqualTo(1);
        assertThat(step(p, "REJECTED").path("count").asLong()).isEqualTo(1);

        // status options with counts
        assertThat(texts(p.path("statuses"), "key")).startsWith("ALL", "ASSIGNED", "SUBMITTED", "UNDER_REVIEW", "INTERVIEWING", "OFFER");
        assertThat(p.path("statuses").get(0).path("count").asLong()).isEqualTo(6);

        // recent updates: the newest stage changes of this consultant, who is YOU / MARKETER / TEAM, never a name or a note
        JsonNode recent = p.path("recent");
        assertThat(texts(recent, "toStage")).containsExactly("OFFER", "INTERVIEWING", "CLOSED", "UNDER_REVIEW", "INTERVIEWING");
        assertThat(texts(recent, "by")).containsExactly("MARKETER", "YOU", "MARKETER", "TEAM", "MARKETER");
        assertThat(recent.get(2).path("closedReason").asText()).isEqualTo("REJECTED");
        assertThat(recent.get(0).path("company").asText()).isEqualTo("Acme Corp");
        assertThat(recent.get(0).path("title").asText()).isEqualTo("Data Developer");
        assertThat(p.toString()).doesNotContain("internal-secret-note");
    }

    @Test
    void theStatusFilterTheSortAndThePagingRunInTheApi() throws Exception {
        seedC1();
        JsonNode interviewing = page("cws-ap-a-c1", a, "?status=INTERVIEWING");
        assertThat(texts(interviewing.path("rows"), "title")).containsExactly("Cloud Developer", "Backend Engineer");
        assertThat(interviewing.path("paging").path("total").asLong()).isEqualTo(2);
        assertThat(texts(page("cws-ap-a-c1", a, "?status=REJECTED").path("rows"), "title")).containsExactly("Platform Engineer");
        assertThat(page("cws-ap-a-c1", a, "?status=HIRED").path("rows")).isEmpty();
        // the tiles do not change with the filter
        assertThat(interviewing.path("tiles").path("total").path("value").asLong()).isEqualTo(6);

        JsonNode byCompany = page("cws-ap-a-c1", a, "?sort=company");
        assertThat(texts(byCompany.path("rows"), "company")).containsExactly("Acme Corp", "Acme Corp", "Acme Corp", "Acme Corp", "Beta Co", "Zeta Co");
        JsonNode byStage = page("cws-ap-a-c1", a, "?sort=stage");
        assertThat(texts(byStage.path("rows"), "stage")).containsExactly("ASSIGNED", "UNDER_REVIEW", "INTERVIEWING", "INTERVIEWING", "OFFER", "CLOSED");

        JsonNode second = page("cws-ap-a-c1", a, "?size=4&page=1");
        assertThat(second.path("rows")).hasSize(2);
        assertThat(second.path("paging").path("pages").asInt()).isEqualTo(2);
        assertThat(second.path("paging").path("total").asLong()).isEqualTo(6);
        assertThat(page("cws-ap-a-c1", a, "?size=5000").path("paging").path("size").asInt()).as("page size is capped at 50").isEqualTo(50);
        assertThat(page("cws-ap-a-c1", a, "?page=99").path("rows")).isEmpty();

        assertThat(send(get(path(a.getId(), "?status=NOPE")), "cws-ap-a-c1", null).getResponse().getStatus()).isEqualTo(422);
        assertThat(send(get(path(a.getId(), "?sort=nope")), "cws-ap-a-c1", null).getResponse().getStatus()).isEqualTo(400);
    }

    @Test
    void detailShowsDatesAndTheStageTimelineButNeverInternalNotes() throws Exception {
        seedC1();
        JsonNode d = detail("cws-ap-a-c1", a, a1.getId());
        assertThat(d.path("row").path("code").asText()).isEqualTo(a1.getCode());
        assertThat(d.path("row").path("title").asText()).isEqualTo("Senior Java Developer");
        assertThat(d.path("createdAt").asText()).isNotBlank();
        assertThat(d.path("stageChangedAt").asText()).isNotBlank();
        JsonNode tl = d.path("timeline");
        assertThat(texts(tl, "toStage")).containsExactly("ASSIGNED", "SUBMITTED", "UNDER_REVIEW");
        assertThat(texts(tl, "type")).containsExactly("CREATED", "STAGE_CHANGE", "STAGE_CHANGE");
        assertThat(texts(tl, "by")).containsExactly("MARKETER", "YOU", "TEAM");
        assertThat(d.toString()).doesNotContain("internal-secret-note").doesNotContain("NOTE");
        assertThat(detail("cws-ap-a-c1", a, a6.getId()).path("timeline")).as("no events: an empty list, nothing invented").isEmpty();
    }

    // ---- (b) own rows only ----------------------------------------------------------------------------------------

    @Test
    void aConsultantNeverSeesAnotherConsultantsApplications() throws Exception {
        seedC1();
        seedC2();
        TalentApplication hidden = applications.findByOrgIdAndConsultantId(a.getId(), c2.getId()).get(0);

        MvcResult r = send(get(path(a.getId(), "?size=50")), "cws-ap-a-c1", null);
        assertThat(r.getResponse().getContentAsString()).doesNotContain("Hidden").doesNotContain("Globex").doesNotContain("Robin Two");
        assertThat(om.readTree(r.getResponse().getContentAsString()).path("tiles").path("total").path("value").asLong()).isEqualTo(6);
        assertGeneric404(send(get(path(a.getId(), "/" + hidden.getId())), "cws-ap-a-c1", null), "detail of another consultant's application");

        JsonNode p2 = page("cws-ap-a-c2", a, "");
        assertThat(texts(p2.path("rows"), "title")).containsExactly("Hidden Secret Role");
        assertThat(p2.path("tiles").path("total").path("value").asLong()).isEqualTo(1);
        assertThat(p2.path("recent")).hasSize(1);
        assertThat(p2.toString()).doesNotContain("Senior Java Developer").doesNotContain("Casey One");
        assertGeneric404(send(get(path(a.getId(), "/" + a1.getId())), "cws-ap-a-c2", null), "c2 reading c1's application");
    }

    // ---- (c) / (d) refusals ---------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationAndNonConsultantsGetTheGeneric404OnEveryRoute() throws Exception {
        seedC1();
        String id = String.valueOf(a1.getId());
        List<String> routes = List.of(path(a.getId(), ""), path(a.getId(), "/" + id));
        for (String login : List.of("cws-ap-b-owner", "cws-ap-b-c1", "ghost-login", "cws-ap-a-owner", "cws-ap-a-admin", "cws-ap-a-marketer", "cws-ap-a-noprofile")) {
            for (String route : routes) assertGeneric404(send(get(route), login, null), login + " GET " + route);
        }
        assertGeneric404(send(get(path(999999999L, "")), "cws-ap-a-c1", null), "an organization that does not exist");
        assertGeneric404(send(get(path(a.getId(), "/987654321")), "cws-ap-a-c1", null), "an application id that does not exist");
        // another tenant's consultant cannot reach this org's application through their own org either
        assertGeneric404(send(get(path(b.getId(), "/" + a1.getId())), "cws-ap-b-c1", null), "an application id from another organization");
        assertThat(b1.getOrgId()).isEqualTo(b.getId());
        // the page is read-only: there is no write route
        assertThat(send(post(path(a.getId(), "")), "cws-ap-a-c1", "{}").getResponse().getStatus()).isIn(404, 405);
    }

    @Test
    void theRoutesAre404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        seedC1();
        flags(true, false);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-ap-a-c1", null), "roles flag off");
        flags(false, true);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-ap-a-c1", null), "master flag off");
    }

    // ---- (e) empty consultant -------------------------------------------------------------------------------------

    @Test
    void aConsultantWithNoApplicationsGetsZerosAndEmptyListsNeverNulls() throws Exception {
        JsonNode p = page("cws-ap-a-c1", a, "");
        for (String tile : List.of("total", "underReview", "interviews", "rejected", "offers")) {
            JsonNode t = p.path("tiles").path(tile);
            assertThat(t.path("value").asLong()).as(tile).isZero();
            assertThat(t.path("previous").asLong()).as(tile).isZero();
            assertThat(t.get("deltaPct").isNull()).as(tile + " has no delta, not a made-up one").isTrue();
            assertThat(t.path("sparkline")).as(tile).hasSize(6);
        }
        assertThat(p.get("rows").isArray()).isTrue();
        assertThat(p.get("rows")).isEmpty();
        assertThat(p.get("recent").isArray()).isTrue();
        assertThat(p.get("recent")).isEmpty();
        assertThat(p.path("paging").path("total").asLong()).isZero();
        assertThat(p.path("paging").path("pages").asInt()).isZero();
        for (JsonNode s : p.path("funnel")) assertThat(s.get("percent").isNull()).as("no share of zero applications").isTrue();
    }
}
