package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.consultantws.CwsOpportunityResponse;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.consultantws.CwsMatchInterestRepository;
import com.dossier.api.repository.ent.consultantws.CwsOpportunityResponseRepository;
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
 * The Consultant workspace Assigned Opportunities page through the real chain on real rows: {@code /api/orgs/{orgId}/me-workspace/opportunities}.
 * Every number is asserted against rows the test wrote, a consultant only ever sees and changes their own rows, every refusal is the generic 404,
 * and every free-text write goes through the sensitive-data guard.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OpportunitiesResourceIT {

    private static final String WHO = "cws-opps-it";

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
    @Autowired private CwsOpportunityResponseRepository responses;
    @Autowired private CwsMatchInterestRepository interests;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private final LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
    private int seq = 0;

    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ConsultantProfile b1;
    private OrgMember marketer;
    private ClientAccount acme;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cws-o-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-o-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);
        staff(a, "cws-o-a-owner", OrgRole.OWNER);
        staff(a, "cws-o-a-admin", OrgRole.ADMIN);
        marketer = staff(a, "cws-o-a-marketer", OrgRole.MARKETER);
        marketer.setDisplayLabel("Morgan Marketer");
        members.saveAndFlush(marketer);
        staff(b, "cws-o-b-owner", OrgRole.OWNER);
        c1 = consultant(a, "cws-o-a-c1", "Casey One", true);
        c2 = consultant(a, "cws-o-a-c2", "Robin Two", true);
        consultant(a, "cws-o-a-noprofile", "Nobody", false);
        b1 = consultant(b, "cws-o-b-c1", "Bee Consultant", true);
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

    private ClientRequirement requirement(Organization org, ClientAccount client, String title, String... skills) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(org.getId());
        r.setClientId(client.getId());
        r.setTitle(title);
        r.setDescriptionText("Build and run " + title + " services.");
        r.setLocation("Austin, TX");
        r.setWorkMode("HYBRID");
        r.setEmploymentLabel("CONTRACT");
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

    private void skill(ConsultantProfile c, String name) {
        ConsultantSkill s = new ConsultantSkill();
        s.setOrgId(c.getOrgId());
        s.setConsultantId(c.getId());
        s.setSkill(name);
        s.setSortOrder(seq++);
        consultantSkills.saveAndFlush(s);
    }

    private RequirementMatch match(ConsultantProfile c, ClientRequirement r, String status, int score, Instant assignedAt, boolean byMarketer) {
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(c.getOrgId());
        m.setRequirementId(r.getId());
        m.setConsultantId(c.getId());
        m.setScore(score);
        m.setStatus(status);
        m.setReason("Skills align with this role.");
        m.setCreatedAt(assignedAt);
        if ("ASSIGNED".equals(status)) {
            m.setAssignedAt(assignedAt);
            if (byMarketer) m.setAssignedByMemberId(marketer.getId());
        }
        return matches.saveAndFlush(m);
    }

    private CwsOpportunityResponse response(ConsultantProfile c, ClientRequirement r, String status, String priority, LocalDate due, Instant at) {
        CwsOpportunityResponse x = new CwsOpportunityResponse();
        x.setOrgId(c.getOrgId());
        x.setConsultantId(c.getId());
        x.setRequirementId(r.getId());
        x.setStatus(status);
        x.setPriority(priority);
        x.setDueOn(due);
        x.setCreatedAt(at);
        x.setUpdatedAt(at);
        if (!"NEW".equals(status)) x.setRespondedAt(at);
        return responses.saveAndFlush(x);
    }

    private RequirementMatch o1;
    private RequirementMatch o2;
    private RequirementMatch o3;
    private RequirementMatch o4;
    private RequirementMatch o5;
    private RequirementMatch suggested;

    /**
     * c1: five ASSIGNED matches plus one SUGGESTED (never listed).
     * o1 score 90, no response (derived HIGH, due assigned+14 = today+12, marketer who assigned it), Java/Spring Boot/Kubernetes/AWS (3 missing);
     * o2 AWAITING_RESPONSE HIGH due today+3, assigned 40 days ago; o3 score 60, no response (derived LOW, due today+9), Terraform missing;
     * o4 DECLINED MEDIUM due yesterday (overdue), assigned 50 days ago; o5 IN_REVIEW MEDIUM due today+9.
     */
    private void seedC1() {
        skill(c1, "Java");
        ClientRequirement r1 = requirement(a, acme, "Senior Java Developer", "Java", "Spring Boot", "Kubernetes", "AWS");
        ClientRequirement r2 = requirement(a, acme, "Data Engineer", "Java");
        ClientRequirement r3 = requirement(a, acme, "Cloud Architect", "Terraform");
        ClientRequirement r4 = requirement(a, acme, "QA Engineer");
        ClientRequirement r5 = requirement(a, acme, "Support Analyst");
        ClientRequirement r6 = requirement(a, acme, "Suggested Only");
        o1 = match(c1, r1, "ASSIGNED", 90, now.minus(Duration.ofDays(2)), true);
        o2 = match(c1, r2, "ASSIGNED", 80, now.minus(Duration.ofDays(40)), true);
        o3 = match(c1, r3, "ASSIGNED", 60, now.minus(Duration.ofDays(5)), false);
        o4 = match(c1, r4, "ASSIGNED", 75, now.minus(Duration.ofDays(50)), true);
        o5 = match(c1, r5, "ASSIGNED", 72, now.minus(Duration.ofDays(3)), true);
        suggested = match(c1, r6, "SUGGESTED", 99, now.minus(Duration.ofDays(1)), false);
        response(c1, r2, "AWAITING_RESPONSE", "HIGH", today.plusDays(3), now.minus(Duration.ofDays(35)));
        response(c1, r4, "DECLINED", "MEDIUM", today.minusDays(1), now.minusSeconds(86_400));
        response(c1, r5, "IN_REVIEW", "MEDIUM", today.plusDays(9), now);
    }

    private void seedC2() {
        ClientAccount other = client(a, "Globex Hidden");
        ClientRequirement hr = requirement(a, other, "Hidden Secret Role", "Cobol");
        match(c2, hr, "ASSIGNED", 97, now.minus(Duration.ofHours(5)), true);
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private static String path(long orgId, String tail) {
        return "/api/orgs/" + orgId + "/me-workspace/opportunities" + tail;
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

    private JsonNode page(String login, Organization org, String query) throws Exception {
        return ok(send(get(path(org.getId(), query)), login, null), "page " + login);
    }

    private JsonNode page(String login, Organization org) throws Exception {
        return page(login, org, "");
    }

    private JsonNode detail(String login, Organization org, long matchId) throws Exception {
        return ok(send(get(path(org.getId(), "/" + matchId)), login, null), "detail " + matchId);
    }

    private MvcResult act(String login, Organization org, long matchId, String action, String body) throws Exception {
        return send(post(path(org.getId(), "/" + matchId + "/" + action)), login, body);
    }

    private JsonNode actOk(long matchId, String action, String body) throws Exception {
        return ok(act("cws-o-a-c1", a, matchId, action, body), action + " " + matchId);
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
        for (JsonNode n : page.path("rows")) if (n.path("matchId").asLong() == matchId) return n;
        throw new AssertionError("no row for match " + matchId);
    }

    private CwsOpportunityResponse stored(ConsultantProfile c, RequirementMatch m) {
        return responses.findByOrgIdAndConsultantIdAndRequirementId(a.getId(), c.getId(), m.getRequirementId()).orElse(null);
    }

    // ---- (a) correct values ---------------------------------------------------------------------------------------

    @Test
    void aConsultantGetsTheirOwnAssignedOpportunitiesTilesAndDerivedValues() throws Exception {
        seedC1();
        JsonNode p = page("cws-o-a-c1", a);

        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(p.path("name").asText()).isEqualTo("Casey One");
        assertThat(p.path("total").asLong()).as("the suggested match is not an assigned opportunity").isEqualTo(5);
        assertThat(p.path("sort").asText()).isEqualTo("due");
        // soonest due first (overdue first); ties by priority
        assertThat(texts(p.path("rows"), "title")).containsExactly("QA Engineer", "Data Engineer", "Support Analyst", "Cloud Architect", "Senior Java Developer");

        JsonNode r1 = row(p, o1.getId());
        assertThat(r1.path("status").asText()).isEqualTo("NEW");
        assertThat(r1.path("priority").asText()).as("score 90 is High").isEqualTo("HIGH");
        assertThat(r1.path("priorityDerived").asBoolean()).isTrue();
        assertThat(r1.path("dueDerived").asBoolean()).isTrue();
        assertThat(r1.path("dueOn").asText()).isEqualTo(today.plusDays(12).toString());
        assertThat(r1.path("daysLeft").asInt()).isEqualTo(12);
        assertThat(r1.path("company").asText()).isEqualTo("Acme Corp");
        assertThat(r1.path("location").asText()).isEqualTo("Austin, TX");
        assertThat(r1.path("workMode").asText()).isEqualTo("HYBRID");
        assertThat(r1.path("marketer").asText()).isEqualTo("Morgan Marketer");
        assertThat(r1.path("skills")).hasSize(3);
        assertThat(r1.path("skills").get(0).asText()).isEqualTo("Java");
        assertThat(r1.path("skills").get(2).asText()).isEqualTo("Kubernetes");
        assertThat(r1.path("missingSkills").asInt()).isEqualTo(3);
        assertThat(r1.path("interestSent").asBoolean()).isFalse();

        JsonNode r2 = row(p, o2.getId());
        assertThat(r2.path("status").asText()).isEqualTo("AWAITING_RESPONSE");
        assertThat(r2.path("priority").asText()).isEqualTo("HIGH");
        assertThat(r2.path("priorityDerived").asBoolean()).isFalse();
        assertThat(r2.path("dueDerived").asBoolean()).isFalse();
        assertThat(r2.path("daysLeft").asInt()).isEqualTo(3);

        JsonNode r3 = row(p, o3.getId());
        assertThat(r3.path("priority").asText()).as("score 60 is Low").isEqualTo("LOW");
        assertThat(r3.path("daysLeft").asInt()).isEqualTo(9);
        assertThat(r3.path("marketer").isNull()).as("nobody assigned it and the consultant has no marketer: an honest null").isTrue();
        assertThat(row(p, o4.getId()).path("daysLeft").asInt()).as("overdue is negative").isEqualTo(-1);

        JsonNode t = p.path("tiles");
        assertThat(t.path("total").path("value").asLong()).isEqualTo(5);
        assertThat(t.path("total").path("previous").asLong()).as("o2 and o4 were assigned over a month ago").isEqualTo(2);
        assertThat(t.path("total").path("deltaPct").asDouble()).isEqualTo(150.0);
        assertThat(t.path("total").path("sparkline")).hasSize(6);
        assertThat(t.path("high").path("value").asLong()).as("o1 (derived) and o2 (stored), not declined ones").isEqualTo(2);
        assertThat(t.path("high").path("previous").asLong()).isEqualTo(1);
        assertThat(t.path("high").path("deltaPct").asDouble()).isEqualTo(100.0);
        assertThat(t.path("awaiting").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("awaiting").path("previous").asLong()).as("it has been waiting for 35 days").isEqualTo(1);
        assertThat(t.path("awaiting").path("deltaPct").asDouble()).isZero();
        assertThat(t.path("inReview").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("inReview").path("previous").asLong()).isZero();
        assertThat(t.path("inReview").path("deltaPct").isNull()).as("nothing a month ago: no made-up percentage").isTrue();
        assertThat(t.path("declined").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("declined").path("deltaPct").isNull()).isTrue();

        JsonNode n = p.path("nextSteps");
        assertThat(n.path("toRespond").asInt()).as("o1 and o3 are NEW without interest").isEqualTo(2);
        assertThat(n.path("soonestDueDays").asInt()).isEqualTo(9);
        assertThat(n.path("resumeGaps").asInt()).as("o1 and o3 list skills the profile lacks").isEqualTo(2);
        assertThat(n.path("upcomingInterviews").asInt()).isZero();
        assertThat(n.path("hasMarketer").asBoolean()).isTrue();
    }

    @Test
    void sortingAndPaginationAreDoneByTheApi() throws Exception {
        seedC1();
        assertThat(texts(page("cws-o-a-c1", a, "?sort=priority").path("rows"), "title")).containsExactly("Data Engineer", "Senior Java Developer", "QA Engineer", "Support Analyst", "Cloud Architect");
        assertThat(texts(page("cws-o-a-c1", a, "?sort=newest").path("rows"), "title")).containsExactly("Senior Java Developer", "Support Analyst", "Cloud Architect", "Data Engineer", "QA Engineer");
        assertThat(page("cws-o-a-c1", a, "?sort=nonsense").path("sort").asText()).as("an unknown sort is the default").isEqualTo("due");

        JsonNode second = page("cws-o-a-c1", a, "?size=2&page=1");
        assertThat(second.path("total").asLong()).isEqualTo(5);
        assertThat(second.path("page").asInt()).isEqualTo(1);
        assertThat(second.path("size").asInt()).isEqualTo(2);
        assertThat(texts(second.path("rows"), "title")).containsExactly("Support Analyst", "Cloud Architect");
        assertThat(second.path("tiles").path("total").path("value").asLong()).as("tiles count every row, not the page").isEqualTo(5);
        assertThat(page("cws-o-a-c1", a, "?size=500").path("size").asInt()).as("capped at 50").isEqualTo(50);
        assertThat(page("cws-o-a-c1", a, "?page=9&size=2").path("rows")).isEmpty();
    }

    @Test
    void theDetailHasDescriptionSkillsRateMarketerReasonAndATimeline() throws Exception {
        seedC1();
        JsonNode d = detail("cws-o-a-c1", a, o1.getId());
        assertThat(d.path("row").path("title").asText()).isEqualTo("Senior Java Developer");
        assertThat(d.path("description").asText()).isEqualTo("Build and run Senior Java Developer services.");
        assertThat(d.path("rateMinMinor").asLong()).isEqualTo(8500);
        assertThat(d.path("rateMaxMinor").asLong()).isEqualTo(9500);
        assertThat(d.path("rateUnit").asText()).isEqualTo("HOUR");
        assertThat(d.path("reason").asText()).isEqualTo("Skills align with this role.");
        assertThat(d.path("row").path("score").asInt()).isEqualTo(90);
        assertThat(texts(d.path("skills"), "skill")).containsExactly("Java", "Spring Boot", "Kubernetes", "AWS");
        assertThat(d.path("skills").get(0).path("present").asBoolean()).isTrue();
        assertThat(d.path("skills").get(1).path("present").asBoolean()).isFalse();
        assertThat(d.path("timeline")).hasSize(1);
        assertThat(d.path("timeline").get(0).path("label").asText()).isEqualTo("Assigned to you by Morgan Marketer");
        assertThat(d.path("interestSentAt").isNull()).isTrue();

        // a declined one carries its reason and a declined event
        CwsOpportunityResponse declined = stored(c1, o4);
        declined.setDeclineReason("Not a fit.");
        responses.saveAndFlush(declined);
        JsonNode dd = detail("cws-o-a-c1", a, o4.getId());
        assertThat(dd.path("declineReason").asText()).isEqualTo("Not a fit.");
        assertThat(texts(dd.path("timeline"), "key")).containsExactly("ASSIGNED", "DECLINED");
        assertThat(detail("cws-o-a-c1", a, o2.getId()).path("row").path("status").asText()).isEqualTo("AWAITING_RESPONSE");
    }

    // ---- (b) own rows only ----------------------------------------------------------------------------------------

    @Test
    void aConsultantNeverSeesOrTouchesAnotherConsultantsOpportunities() throws Exception {
        seedC1();
        seedC2();
        RequirementMatch hidden = matches.findByOrgIdAndConsultantIdOrderByScoreDesc(a.getId(), c2.getId()).get(0);

        MvcResult r = send(get(path(a.getId(), "")), "cws-o-a-c1", null);
        assertThat(r.getResponse().getContentAsString()).doesNotContain("Hidden").doesNotContain("Globex").doesNotContain("Robin Two");
        assertThat(om.readTree(r.getResponse().getContentAsString()).path("tiles").path("total").path("value").asLong()).isEqualTo(5);

        assertGeneric404(send(get(path(a.getId(), "/" + hidden.getId())), "cws-o-a-c1", null), "detail of another consultant's opportunity");
        for (String action : List.of("express-interest", "need-more-info", "decline", "reopen", "request-resume-update")) {
            assertGeneric404(act("cws-o-a-c1", a, hidden.getId(), action, "{\"message\":\"Please tell me more\",\"reason\":\"Not for me\",\"note\":\"Please update\"}"), action + " on another's opportunity");
        }
        assertThat(interests.findByOrgIdAndConsultantId(a.getId(), c1.getId())).isEmpty();
        assertThat(responses.findByOrgIdAndConsultantId(a.getId(), c2.getId())).isEmpty();

        // a suggested (not assigned) match of their own is not an opportunity either
        assertGeneric404(send(get(path(a.getId(), "/" + suggested.getId())), "cws-o-a-c1", null), "a suggested match");
        assertGeneric404(act("cws-o-a-c1", a, suggested.getId(), "decline", "{\"reason\":\"Not for me\"}"), "decline a suggested match");

        // the other consultant sees exactly their own
        JsonNode p2 = page("cws-o-a-c2", a);
        assertThat(texts(p2.path("rows"), "title")).containsExactly("Hidden Secret Role");
        assertThat(p2.toString()).doesNotContain("Senior Java Developer").doesNotContain("Casey One");
    }

    // ---- (c) / (d) refusals ---------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationAndNonConsultantsGetTheGeneric404OnEveryRoute() throws Exception {
        seedC1();
        String id = String.valueOf(o1.getId());
        List<String[]> routes = new ArrayList<>(List.of(
            new String[] { "GET", path(a.getId(), "") },
            new String[] { "GET", path(a.getId(), "/" + id) }
        ));
        for (String action : List.of("express-interest", "need-more-info", "decline", "reopen", "request-resume-update")) routes.add(new String[] { "POST", path(a.getId(), "/" + id + "/" + action) });
        for (String login : List.of("cws-o-b-owner", "cws-o-b-c1", "ghost-login", "cws-o-a-owner", "cws-o-a-admin", "cws-o-a-marketer", "cws-o-a-noprofile")) {
            for (String[] route : routes) {
                MockHttpServletRequestBuilder req = "POST".equals(route[0]) ? post(route[1]) : get(route[1]);
                assertGeneric404(send(req, login, "POST".equals(route[0]) ? "{\"message\":\"Please tell me more\",\"reason\":\"Not for me\"}" : null), login + " " + route[0] + " " + route[1]);
            }
        }
        assertThat(responses.findByOrgIdAndConsultantId(a.getId(), c1.getId()).stream().filter(x -> x.getRequirementId().equals(o1.getRequirementId()))).isEmpty();
        assertGeneric404(send(get(path(999999999L, "")), "cws-o-a-c1", null), "an organization that does not exist");
        assertGeneric404(send(get(path(a.getId(), "/987654321")), "cws-o-a-c1", null), "a match id that does not exist");
        assertGeneric404(send(get(path(b.getId(), "/" + o1.getId())), "cws-o-b-c1", null), "a match id from another organization");
        assertThat(b1.getOrgId()).isEqualTo(b.getId());
    }

    @Test
    void theRoutesAre404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        seedC1();
        flags(true, false);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-o-a-c1", null), "roles flag off");
        flags(false, true);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-o-a-c1", null), "master flag off");
        assertGeneric404(act("cws-o-a-c1", a, o1.getId(), "decline", "{\"reason\":\"Not for me\"}"), "write with the master flag off");
    }

    // ---- (e) empty consultant -------------------------------------------------------------------------------------

    @Test
    void aConsultantWithNoAssignedOpportunitiesGetsZerosAndEmptyListsNeverNulls() throws Exception {
        JsonNode p = page("cws-o-a-c1", a);
        for (String tile : List.of("total", "high", "awaiting", "inReview", "declined")) {
            JsonNode t = p.path("tiles").path(tile);
            assertThat(t.path("value").asLong()).as(tile).isZero();
            assertThat(t.path("previous").asLong()).as(tile).isZero();
            assertThat(t.get("deltaPct").isNull()).as(tile + " has no delta, not a made-up one").isTrue();
            assertThat(t.path("sparkline")).as(tile).hasSize(6);
        }
        assertThat(p.get("rows").isArray()).isTrue();
        assertThat(p.get("rows")).isEmpty();
        assertThat(p.path("total").asLong()).isZero();
        JsonNode n = p.path("nextSteps");
        assertThat(n.path("toRespond").asInt()).isZero();
        assertThat(n.get("soonestDueDays").isNull()).isTrue();
        assertThat(n.path("resumeGaps").asInt()).isZero();
        assertThat(n.path("hasMarketer").asBoolean()).isFalse();
    }

    // ---- writes ---------------------------------------------------------------------------------------------------

    @Test
    void expressInterestRecordsTheSameInterestRowAsJobMatchesAndChangesNoStatus() throws Exception {
        seedC1();
        long appsBefore = applications.countByOrgId(a.getId());
        JsonNode first = actOk(o1.getId(), "express-interest", "{\"note\":\"  Very keen on this one.  \"}");
        assertThat(first.path("interestSent").asBoolean()).isTrue();
        assertThat(first.path("status").asText()).isEqualTo("NEW");
        JsonNode again = actOk(o1.getId(), "express-interest", "{\"note\":\"changed\"}");
        assertThat(again.path("interestSentAt").asText()).as("idempotent: the first time is kept").isEqualTo(first.path("interestSentAt").asText());
        assertThat(interests.findByOrgIdAndConsultantId(a.getId(), c1.getId())).hasSize(1);
        assertThat(interests.findByOrgIdAndConsultantIdAndRequirementId(a.getId(), c1.getId(), o1.getRequirementId()).orElseThrow().getNote()).isEqualTo("Very keen on this one.");
        assertThat(applications.countByOrgId(a.getId())).as("no application is created").isEqualTo(appsBefore);
        assertThat(matches.findByOrgIdAndId(a.getId(), o1.getId()).orElseThrow().getStatus()).as("the match stays ASSIGNED").isEqualTo("ASSIGNED");
        assertThat(stored(c1, o1)).as("no response row is needed for a status that did not change").isNull();

        JsonNode p = page("cws-o-a-c1", a);
        assertThat(row(p, o1.getId()).path("interestSent").asBoolean()).isTrue();
        assertThat(row(p, o1.getId()).path("status").asText()).isEqualTo("NEW");
        assertThat(p.path("nextSteps").path("toRespond").asInt()).as("o1 no longer counts as still to respond").isEqualTo(1);
        assertThat(detail("cws-o-a-c1", a, o1.getId()).path("timeline")).hasSize(2);

        // no body at all is fine too
        ok(act("cws-o-a-c1", a, o3.getId(), "express-interest", null), "interest without a body");
    }

    @Test
    void theInterestNoteIsValidatedScannedAndADeclinedOpportunityMustBeReopenedFirst() throws Exception {
        seedC1();
        assertStatus(act("cws-o-a-c1", a, o1.getId(), "express-interest", "{\"note\":\"ab\"}"), 422, "a note under 3 characters");
        assertStatus(act("cws-o-a-c1", a, o1.getId(), "express-interest", "{\"note\":\"" + "x".repeat(301) + "\"}"), 422, "a note over 300 characters");
        MvcResult ssn = act("cws-o-a-c1", a, o1.getId(), "express-interest", "{\"note\":\"my SSN 123-45-6789\"}");
        assertStatus(ssn, 422, "a social security number");
        assertThat(ssn.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        assertThat(interests.findByOrgIdAndConsultantId(a.getId(), c1.getId())).as("a refused note stores nothing").isEmpty();
        assertStatus(act("cws-o-a-c1", a, o4.getId(), "express-interest", "{}"), 422, "interest in a declined opportunity");
    }

    @Test
    void needMoreInfoStoresTheQuestionAndMovesANewOpportunityToAwaitingResponse() throws Exception {
        seedC1();
        JsonNode r = actOk(o1.getId(), "need-more-info", "{\"message\":\"  Is the start date flexible?  \"}");
        assertThat(r.path("status").asText()).isEqualTo("AWAITING_RESPONSE");
        CwsOpportunityResponse x = stored(c1, o1);
        assertThat(x.getInfoRequest()).isEqualTo("Is the start date flexible?");
        assertThat(x.getStatus()).isEqualTo("AWAITING_RESPONSE");
        assertThat(x.getPriority()).as("the marketer's priority stays unset (derived)").isNull();
        assertThat(x.getDueOn()).isNull();
        JsonNode p = page("cws-o-a-c1", a);
        assertThat(row(p, o1.getId()).path("status").asText()).isEqualTo("AWAITING_RESPONSE");
        assertThat(row(p, o1.getId()).path("priorityDerived").asBoolean()).isTrue();
        assertThat(p.path("tiles").path("awaiting").path("value").asLong()).isEqualTo(2);
        assertThat(detail("cws-o-a-c1", a, o1.getId()).path("infoRequest").asText()).isEqualTo("Is the start date flexible?");

        // asking again replaces the question; an opportunity already in review stays in review
        actOk(o1.getId(), "need-more-info", "{\"message\":\"And the team size?\"}");
        assertThat(stored(c1, o1).getInfoRequest()).isEqualTo("And the team size?");
        JsonNode review = actOk(o5.getId(), "need-more-info", "{\"message\":\"Any travel involved?\"}");
        assertThat(review.path("status").asText()).isEqualTo("IN_REVIEW");
        assertThat(stored(c1, o5).getInfoRequest()).isEqualTo("Any travel involved?");
    }

    @Test
    void needMoreInfoIsValidatedScannedAndRefusedOnADeclinedOpportunity() throws Exception {
        seedC1();
        assertStatus(act("cws-o-a-c1", a, o1.getId(), "need-more-info", "{}"), 422, "no message");
        assertStatus(act("cws-o-a-c1", a, o1.getId(), "need-more-info", null), 422, "no body");
        assertStatus(act("cws-o-a-c1", a, o1.getId(), "need-more-info", "{\"message\":\"  \"}"), 422, "a blank message");
        assertStatus(act("cws-o-a-c1", a, o1.getId(), "need-more-info", "{\"message\":\"ab\"}"), 422, "under 3 characters");
        assertStatus(act("cws-o-a-c1", a, o1.getId(), "need-more-info", "{\"message\":\"" + "x".repeat(301) + "\"}"), 422, "over 300 characters");
        MvcResult dob = act("cws-o-a-c1", a, o1.getId(), "need-more-info", "{\"message\":\"date of birth 04/12/1990\"}");
        assertStatus(dob, 422, "a date of birth");
        assertThat(dob.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        assertThat(stored(c1, o1)).as("a refused message stores nothing").isNull();
        assertStatus(act("cws-o-a-c1", a, o4.getId(), "need-more-info", "{\"message\":\"Any update on this role?\"}"), 422, "a declined opportunity");
    }

    @Test
    void declineNeedsAReasonIsIdempotentAndReopenUndoesIt() throws Exception {
        seedC1();
        long appsBefore = applications.countByOrgId(a.getId());
        assertStatus(act("cws-o-a-c1", a, o1.getId(), "decline", "{}"), 422, "no reason");
        assertStatus(act("cws-o-a-c1", a, o1.getId(), "decline", null), 422, "no body");
        assertStatus(act("cws-o-a-c1", a, o1.getId(), "decline", "{\"reason\":\"no\"}"), 422, "under 3 characters");
        assertStatus(act("cws-o-a-c1", a, o1.getId(), "decline", "{\"reason\":\"" + "x".repeat(301) + "\"}"), 422, "over 300 characters");
        MvcResult ssn = act("cws-o-a-c1", a, o1.getId(), "decline", "{\"reason\":\"my SSN 123-45-6789\"}");
        assertStatus(ssn, 422, "a social security number");
        assertThat(ssn.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        assertThat(stored(c1, o1)).as("a refused reason stores nothing").isNull();

        JsonNode r = actOk(o1.getId(), "decline", "{\"reason\":\"  The commute is too long.  \"}");
        assertThat(r.path("status").asText()).isEqualTo("DECLINED");
        CwsOpportunityResponse x = stored(c1, o1);
        assertThat(x.getDeclineReason()).isEqualTo("The commute is too long.");
        assertThat(x.getRespondedAt()).isNotNull();
        JsonNode again = actOk(o1.getId(), "decline", "{\"reason\":\"A different reason.\"}");
        assertThat(again.path("status").asText()).isEqualTo("DECLINED");
        assertThat(stored(c1, o1).getDeclineReason()).as("idempotent: the first reason is kept").isEqualTo("The commute is too long.");
        assertThat(responses.findByOrgIdAndConsultantId(a.getId(), c1.getId()).stream().filter(y -> y.getRequirementId().equals(o1.getRequirementId())).count()).isEqualTo(1);

        JsonNode p = page("cws-o-a-c1", a);
        assertThat(row(p, o1.getId()).path("status").asText()).isEqualTo("DECLINED");
        assertThat(p.path("tiles").path("declined").path("value").asLong()).isEqualTo(2);
        assertThat(p.path("tiles").path("high").path("value").asLong()).as("a declined one is no longer high priority work").isEqualTo(1);
        assertThat(applications.countByOrgId(a.getId())).as("declining creates and submits nothing").isEqualTo(appsBefore);

        JsonNode back = actOk(o1.getId(), "reopen", null);
        assertThat(back.path("status").asText()).isEqualTo("NEW");
        assertThat(stored(c1, o1).getDeclineReason()).isNull();
        assertThat(stored(c1, o1).getRespondedAt()).isNull();
        assertThat(row(page("cws-o-a-c1", a), o1.getId()).path("status").asText()).isEqualTo("NEW");
        assertThat(page("cws-o-a-c1", a).path("tiles").path("declined").path("value").asLong()).isEqualTo(1);

        // reopen is idempotent and creates nothing for a row that was never declined
        assertThat(actOk(o3.getId(), "reopen", null).path("status").asText()).isEqualTo("NEW");
        assertThat(stored(c1, o3)).isNull();
        assertThat(actOk(o2.getId(), "reopen", null).path("status").asText()).as("an awaiting one is left alone").isEqualTo("AWAITING_RESPONSE");
    }

    @Test
    void requestResumeUpdateLeavesANoteForTheMarketerAndChangesNoStatus() throws Exception {
        seedC1();
        JsonNode r = actOk(o1.getId(), "request-resume-update", "{\"note\":\"  Please add my Kubernetes work.  \"}");
        assertThat(r.path("status").asText()).isEqualTo("NEW");
        assertThat(r.path("resumeUpdateRequested").asBoolean()).isTrue();
        CwsOpportunityResponse x = stored(c1, o1);
        assertThat(x.getResumeUpdateNote()).isEqualTo("Please add my Kubernetes work.");
        assertThat(x.getResumeUpdateRequestedAt()).isNotNull();
        assertThat(x.getStatus()).isEqualTo("NEW");
        JsonNode d = detail("cws-o-a-c1", a, o1.getId());
        assertThat(d.path("resumeUpdateNote").asText()).isEqualTo("Please add my Kubernetes work.");
        assertThat(texts(d.path("timeline"), "key")).containsExactly("ASSIGNED", "RESUME_UPDATE");

        // no note at all is fine; asking again replaces the note
        JsonNode blank = actOk(o3.getId(), "request-resume-update", null);
        assertThat(blank.path("resumeUpdateRequested").asBoolean()).isTrue();
        assertThat(stored(c1, o3).getResumeUpdateNote()).isNull();
        actOk(o1.getId(), "request-resume-update", "{\"note\":\"Also my AWS work.\"}");
        assertThat(stored(c1, o1).getResumeUpdateNote()).isEqualTo("Also my AWS work.");

        assertStatus(act("cws-o-a-c1", a, o1.getId(), "request-resume-update", "{\"note\":\"ab\"}"), 422, "under 3 characters");
        assertStatus(act("cws-o-a-c1", a, o1.getId(), "request-resume-update", "{\"note\":\"" + "x".repeat(301) + "\"}"), 422, "over 300 characters");
        MvcResult ssn = act("cws-o-a-c1", a, o1.getId(), "request-resume-update", "{\"note\":\"my SSN 123-45-6789\"}");
        assertStatus(ssn, 422, "a social security number");
        assertThat(ssn.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        assertThat(stored(c1, o1).getResumeUpdateNote()).as("a refused note changes nothing").isEqualTo("Also my AWS work.");
    }
}
