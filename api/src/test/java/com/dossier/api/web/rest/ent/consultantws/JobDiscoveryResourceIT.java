package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

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
import com.dossier.api.repository.ent.consultantws.CwsSavedJobRepository;
import com.dossier.api.repository.ent.consultantws.CwsSavedSearchRepository;
import com.dossier.api.domain.ent.consultantws.CwsJobSource;
import com.dossier.api.repository.ent.consultantws.CwsJobSourceRepository;
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
 * Consultant workspace Job Discovery through the real chain on real rows. Search runs in the database over OPEN jobs of the caller's
 * own organization; bookmarks and searches are the caller's own; every refusal is the generic 404; free text is scanned for sensitive
 * data (422).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class JobDiscoveryResourceIT {

    private static final String WHO = "cws-jd-it";

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
    @Autowired private CwsSavedJobRepository savedJobs;
    @Autowired private CwsSavedSearchRepository savedSearches;
    @Autowired private CwsJobSourceRepository jobSources;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private int seq = 0;

    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ConsultantProfile empty;
    private ConsultantProfile bConsultant;
    private ClientAccount acme;
    private ClientAccount globex;
    private ClientAccount bClient;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cws-jd-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-jd-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);

        staff(a, "cws-jd-a-owner", OrgRole.OWNER);
        staff(a, "cws-jd-a-marketer", OrgRole.MARKETER);
        staff(b, "cws-jd-b-owner", OrgRole.OWNER);

        c1 = consultant(a, "cws-jd-a-c1", "Casey One");
        c2 = consultant(a, "cws-jd-a-c2", "Robin Two");
        empty = consultant(a, "cws-jd-a-empty", "Empty Skills");
        consultant(a, "cws-jd-a-noprofile", null);
        bConsultant = consultant(b, "cws-jd-b-c1", "Bee Consultant");

        acme = client(a, "Acme Corp", "Finance");
        globex = client(a, "Globex", "Healthcare");
        bClient = client(b, "Other Tenant Co", "Retail");
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

    // ---- fixtures -----------------------------------------------------------------------------------------------

    private OrgMember staff(Organization org, String login, OrgRole role) {
        OrgMember m = fx.active(org, login, role);
        m.setJoinedAt(now.minus(Duration.ofDays(100)));
        members.saveAndFlush(m);
        roleService.syncFromLegacy(m);
        return m;
    }

    /** An ACTIVE Consultant seat; with a consultant_profile unless {@code name} is null. */
    private ConsultantProfile consultant(Organization org, String login, String name) {
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
        if (name == null) return null;
        ConsultantProfile p = new ConsultantProfile();
        p.setOrgId(org.getId());
        p.setMemberId(m.getId());
        p.setDisplayName(name);
        p.setEmail(login + "@example.org");
        p.setWorkMode("REMOTE");
        p.setAvailabilitySince(LocalDate.now(ZoneOffset.UTC));
        return profiles.saveAndFlush(p);
    }

    private ClientAccount client(Organization org, String name, String industry) {
        ClientAccount c = new ClientAccount();
        c.setOrgId(org.getId());
        c.setName(name);
        c.setIndustry(industry);
        return clients.saveAndFlush(c);
    }

    private ClientRequirement job(Organization org, ClientAccount client, String title, String status, int postedDaysAgo, String... skills) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(org.getId());
        r.setClientId(client.getId());
        r.setTitle(title);
        r.setLocation("Austin, TX");
        r.setWorkMode("HYBRID");
        r.setEmploymentLabel("CONTRACT");
        r.setExperienceLevel("SENIOR");
        r.setDurationLabel("6 months");
        r.setRateUnit("HOUR");
        r.setRateMinMinor(9500L);
        r.setRateMaxMinor(12000L);
        r.setStatus(status);
        r.setPostedAt(now.minus(Duration.ofDays(postedDaysAgo)));
        r.setDescriptionText("Description of " + title);
        r = requirements.saveAndFlush(r);
        int i = 0;
        for (String s : skills) {
            RequirementSkill rs = new RequirementSkill();
            rs.setOrgId(org.getId());
            rs.setRequirementId(r.getId());
            rs.setSkill(s);
            rs.setSortOrder(i++);
            requirementSkills.saveAndFlush(rs);
        }
        return r;
    }

    private void skill(ConsultantProfile c, String name) {
        ConsultantSkill s = new ConsultantSkill();
        s.setOrgId(c.getOrgId());
        s.setConsultantId(c.getId());
        s.setSkill(name);
        consultantSkills.saveAndFlush(s);
    }

    private RequirementMatch match(ConsultantProfile c, ClientRequirement r, String status, int score) {
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(c.getOrgId());
        m.setRequirementId(r.getId());
        m.setConsultantId(c.getId());
        m.setScore(score);
        m.setStatus(status);
        return matches.saveAndFlush(m);
    }

    private TalentApplication application(ConsultantProfile c, ClientRequirement r, String stage) {
        TalentApplication t = new TalentApplication();
        t.setOrgId(c.getOrgId());
        t.setCode("JD-" + System.nanoTime() + "-" + (seq++));
        t.setRequirementId(r.getId());
        t.setConsultantId(c.getId());
        t.setClientId(r.getClientId());
        t.setStage(stage);
        t.setAppliedOn(LocalDate.now(ZoneOffset.UTC));
        return applications.saveAndFlush(t);
    }

    private ClientRequirement java;
    private ClientRequirement data;
    private ClientRequirement older;
    private ClientRequirement closed;
    private ClientRequirement bJob;

    /** Acme: 3 open jobs (java 2 days old, data 20 days, older 45 days) + 1 closed; c1 knows Java and SQL. */
    private void world() {
        java = job(a, acme, "Java Developer", "OPEN", 2, "Java", "Spring", "SQL");
        data = job(a, globex, "Data Engineer", "OPEN", 20, "Python", "SQL");
        older = job(a, acme, "SRE Lead", "OPEN", 45, "Kubernetes");
        closed = job(a, acme, "Closed Role", "CLOSED", 5, "Java");
        bJob = job(b, bClient, "Other Tenant Java", "OPEN", 1, "Java");
        skill(c1, "Java");
        skill(c1, "SQL");
        skill(c2, "Python");
    }

    // ---- calls --------------------------------------------------------------------------------------------------

    private static String path(long orgId, String tail) {
        return "/api/orgs/" + orgId + "/me-workspace/job-discovery" + tail;
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

    private JsonNode search(String login, Organization org, String query) throws Exception {
        return ok(send(get(path(org.getId(), "/search" + query)), login, null), "search " + query);
    }

    private JsonNode overview(String login, Organization org) throws Exception {
        return ok(send(get(path(org.getId(), "/overview")), login, null), "overview");
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("denied");
    }

    private void assertPii(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(422);
        assertThat(body).as(what).contains("SENSITIVE_CONTENT");
    }

    private static List<String> titles(JsonNode items) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : items.path("items")) out.add(n.path("title").asText());
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
    void searchReturnsOnlyOpenJobsOfTheOwnOrganizationWithTheComputedScore() throws Exception {
        world();
        JsonNode r = search("cws-jd-a-c1", a, "?sort=newest");
        assertThat(r.path("total").asLong()).isEqualTo(3);
        assertThat(titles(r)).containsExactly("Java Developer", "Data Engineer", "SRE Lead");
        assertThat(titles(r)).doesNotContain("Closed Role", "Other Tenant Java");

        JsonNode j = r.path("items").get(0);
        assertThat(j.path("clientName").asText()).isEqualTo("Acme Corp");
        assertThat(j.path("industry").asText()).isEqualTo("Finance");
        assertThat(j.path("rateMinMinor").asLong()).isEqualTo(9500);
        assertThat(j.path("rateMaxMinor").asLong()).isEqualTo(12000);
        assertThat(j.path("rateUnit").asText()).isEqualTo("HOUR");
        assertThat(j.path("skills")).hasSize(3);
        assertThat(j.path("featured").asBoolean()).as("posted 2 days ago").isTrue();
        assertThat(r.path("items").get(1).path("featured").asBoolean()).as("posted 20 days ago").isFalse();
        // c1 has Java and SQL: 2 of the 3 required skills -> 67 computed from skill overlap
        assertThat(j.path("score").asInt()).isEqualTo(67);
        assertThat(j.path("scoreSource").asText()).isEqualTo("SKILLS");
        assertThat(j.path("matchedSkills").asInt()).isEqualTo(2);
        assertThat(j.path("totalSkills").asInt()).isEqualTo(3);
        assertThat(j.path("relation").asText()).isEqualTo("NONE");
        assertThat(j.path("saved").asBoolean()).isFalse();
    }

    @Test
    void anOwnRequirementMatchScoreWinsAndBestMatchOrdersByIt() throws Exception {
        world();
        match(c1, older, "SUGGESTED", 95);
        JsonNode r = search("cws-jd-a-c1", a, "");
        assertThat(titles(r).get(0)).as("best match first: the stored 95 beats the computed 67").isEqualTo("SRE Lead");
        assertThat(r.path("items").get(0).path("score").asInt()).isEqualTo(95);
        assertThat(r.path("items").get(0).path("scoreSource").asText()).isEqualTo("MATCH");
        assertThat(r.path("items").get(0).path("relation").asText()).isEqualTo("MATCHED");
        // a second consultant's match does not change c1's numbers
        match(c2, java, "SUGGESTED", 99);
        JsonNode again = search("cws-jd-a-c1", a, "");
        assertThat(again.path("items").get(1).path("scoreSource").asText()).isEqualTo("SKILLS");
    }

    @Test
    void filtersTextSortRecommendedAndPaginationRunInTheDatabase() throws Exception {
        world();
        assertThat(titles(search("cws-jd-a-c1", a, "?q=java"))).containsExactly("Java Developer");
        assertThat(titles(search("cws-jd-a-c1", a, "?q=kubernetes"))).as("skill text").containsExactly("SRE Lead");
        assertThat(titles(search("cws-jd-a-c1", a, "?q=globex"))).as("company text").containsExactly("Data Engineer");
        assertThat(titles(search("cws-jd-a-c1", a, "?q=%25"))).as("a wildcard is literal").isEmpty();
        assertThat(titles(search("cws-jd-a-c1", a, "?industry=Healthcare"))).containsExactly("Data Engineer");
        assertThat(titles(search("cws-jd-a-c1", a, "?skill=python"))).containsExactly("Data Engineer");
        assertThat(titles(search("cws-jd-a-c1", a, "?clientId=" + acme.getId() + "&sort=newest"))).containsExactly("Java Developer", "SRE Lead");
        assertThat(titles(search("cws-jd-a-c1", a, "?jobType=FTE"))).isEmpty();
        assertThat(titles(search("cws-jd-a-c1", a, "?location=austin&sort=newest"))).hasSize(3);
        assertThat(titles(search("cws-jd-a-c1", a, "?workMode=REMOTE"))).isEmpty();
        assertThat(titles(search("cws-jd-a-c1", a, "?location=Remote"))).as("Remote in the location box is the work mode").isEmpty();
        assertThat(titles(search("cws-jd-a-c1", a, "?minRateMinor=12500"))).as("hourly ceiling below the floor").isEmpty();
        assertThat(titles(search("cws-jd-a-c1", a, "?minRateMinor=11000&sort=newest"))).hasSize(3);

        JsonNode rec = search("cws-jd-a-c1", a, "?minScore=60");
        assertThat(titles(rec)).as("only Java Developer scores 67; Data Engineer 50, SRE 0").containsExactly("Java Developer");
        assertThat(rec.path("total").asLong()).isEqualTo(1);

        JsonNode p0 = search("cws-jd-a-c1", a, "?sort=newest&size=2&page=0");
        JsonNode p1 = search("cws-jd-a-c1", a, "?sort=newest&size=2&page=1");
        assertThat(p0.path("total").asLong()).isEqualTo(3);
        assertThat(titles(p0)).containsExactly("Java Developer", "Data Engineer");
        assertThat(titles(p1)).containsExactly("SRE Lead");
        assertThat(search("cws-jd-a-c1", a, "?size=9999").path("size").asInt()).as("size is capped at 50").isEqualTo(50);
    }

    @Test
    void saveAndUnsaveAreIdempotentAndShowOnTheCard() throws Exception {
        world();
        assertThat(ok(send(post(path(a.getId(), "/saved/" + java.getId())), "cws-jd-a-c1", null), "save").path("saved").asBoolean()).isTrue();
        ok(send(post(path(a.getId(), "/saved/" + java.getId())), "cws-jd-a-c1", null), "save again");
        assertThat(savedJobs.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isEqualTo(1);
        assertThat(search("cws-jd-a-c1", a, "?sort=newest").path("items").get(0).path("saved").asBoolean()).isTrue();
        assertThat(search("cws-jd-a-c2", a, "?sort=newest").path("items").get(0).path("saved").asBoolean()).as("c2 does not see c1's bookmark").isFalse();
        ok(send(delete(path(a.getId(), "/saved/" + java.getId())), "cws-jd-a-c1", null), "unsave");
        ok(send(delete(path(a.getId(), "/saved/" + java.getId())), "cws-jd-a-c1", null), "unsave again");
        assertThat(savedJobs.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isZero();
    }

    @Test
    void detailShowsTheMarketersNotesAndNoApplyState() throws Exception {
        world();
        JsonNode d = ok(send(get(path(a.getId(), "/jobs/" + java.getId())), "cws-jd-a-c1", null), "detail");
        assertThat(d.path("description").asText()).isEqualTo("Description of Java Developer");
        assertThat(d.has("apply")).as("the in-app apply flow is gone").isFalse();
        assertThat(d.path("job").path("sourceUrl").isNull()).as("no marketer link yet").isTrue();
        assertGeneric404(send(get(path(a.getId(), "/jobs/" + closed.getId())), "cws-jd-a-c1", null), "a closed job with no match or application");
    }

    // ---- the marketer's source link and quick info (no full job details, no in-app apply) ---------------------

    private void source(Organization org, ClientRequirement job, String url, String name, String info, boolean sample) {
        CwsJobSource s = new CwsJobSource();
        s.setOrgId(org.getId());
        s.setRequirementId(job.getId());
        s.setSourceUrl(url);
        s.setSourceName(name);
        s.setQuickInfo(info);
        s.setSampleData(sample);
        jobSources.save(s);
    }

    @Test
    void theCardAndDetailCarryTheMarketersSourceLinkNameAndQuickInfoAndTheSampleMark() throws Exception {
        world();
        source(a, java, "https://jobs.example.com/a/1", "LinkedIn", "Contract, apply on the site.", true);
        source(a, data, "https://dice.com/jobs/42", "Dice", "Real marketer entry.", false);
        JsonNode items = search("cws-jd-a-c1", a, "?sort=newest").path("items");
        JsonNode j = null;
        JsonNode d = null;
        JsonNode none = null;
        for (JsonNode i : items) {
            if (i.path("id").asLong() == java.getId()) j = i;
            if (i.path("id").asLong() == data.getId()) d = i;
            if (i.path("id").asLong() == older.getId()) none = i;
        }
        assertThat(j.path("sourceUrl").asText()).isEqualTo("https://jobs.example.com/a/1");
        assertThat(j.path("sourceName").asText()).isEqualTo("LinkedIn");
        assertThat(j.path("quickInfo").asText()).isEqualTo("Contract, apply on the site.");
        assertThat(j.path("sourceSample").asBoolean()).isTrue();
        assertThat(d.path("sourceSample").asBoolean()).isFalse();
        assertThat(none.path("sourceUrl").isNull()).as("a job without a row has no link").isTrue();
        assertThat(none.path("quickInfo").isNull()).isTrue();
        JsonNode detail = ok(send(get(path(a.getId(), "/jobs/" + java.getId())), "cws-jd-a-c1", null), "detail");
        assertThat(detail.path("job").path("sourceUrl").asText()).isEqualTo("https://jobs.example.com/a/1");
        assertThat(detail.path("job").path("quickInfo").asText()).isEqualTo("Contract, apply on the site.");
    }

    @Test
    void aStoredLinkThatIsNotAPlainHttpsLinkIsNeverReturned() throws Exception {
        world();
        String[] bad = { "javascript:alert(1)", "http://jobs.example.com/x", "ftp://jobs.example.com/x", "https://user:pw@jobs.example.com/x", "https://localhost/x", "https:///nohost", "//jobs.example.com/x", "https://jobs.example.com/a b", "not a url" };
        ClientRequirement[] targets = { java, data, older };
        int n = 0;
        for (String url : bad) {
            ClientRequirement t = targets[n % targets.length];
            CwsJobSource row = jobSources.findByOrgIdAndRequirementId(a.getId(), t.getId()).orElse(null);
            if (row == null) source(a, t, url, "Site", "note", false);
            else {
                row.setSourceUrl(url);
                jobSources.save(row);
            }
            n++;
            JsonNode detail = ok(send(get(path(a.getId(), "/jobs/" + t.getId())), "cws-jd-a-c1", null), "detail");
            assertThat(detail.path("job").path("sourceUrl").isNull()).as("not returned: " + url).isTrue();
            assertThat(detail.path("job").path("quickInfo").asText()).as("the note is still shown").isEqualTo("note");
        }
        // a link at the column limit (500 characters) is returned as is
        CwsJobSource row = jobSources.findByOrgIdAndRequirementId(a.getId(), java.getId()).orElseThrow();
        row.setSourceUrl("https://jobs.example.com/" + "x".repeat(475));
        jobSources.save(row);
        assertThat(ok(send(get(path(a.getId(), "/jobs/" + java.getId())), "cws-jd-a-c1", null), "detail").path("job").path("sourceUrl").asText()).hasSize(500);
    }

    @Test
    void anotherOrganizationsSourceRowNeverLeaksAndTheApplyRouteIsGone() throws Exception {
        world();
        source(b, bJob, "https://jobs.example.com/b/1", "Dice", "b only", true);
        assertThat(search("cws-jd-a-c1", a, "?sort=newest").toString()).doesNotContain("b only").doesNotContain("jobs.example.com/b/1");
        assertThat(search("cws-jd-b-c1", b, "").path("items").get(0).path("sourceUrl").asText()).isEqualTo("https://jobs.example.com/b/1");
        // POST .../apply no longer exists: no handler for it (404 or 405), nothing is created
        int status = send(post(path(a.getId(), "/jobs/" + java.getId() + "/apply")), "cws-jd-a-c1", null).getResponse().getStatus();
        assertThat(status).isIn(404, 405);
        assertThat(applications.findByOrgIdAndConsultantId(a.getId(), c1.getId())).isEmpty();
    }

    // ---- saved and recent searches ----------------------------------------------------------------------------

    @Test
    void savedSearchesCreateCountNewResultsViewDeleteAndAreOwn() throws Exception {
        world();
        JsonNode created = ok(send(post(path(a.getId(), "/saved-searches")), "cws-jd-a-c1", json("name", q("Java roles"), "filters", json("q", q("java")))), "create");
        long id = created.path("id").asLong();
        assertThat(created.path("name").asText()).isEqualTo("Java roles");
        assertThat(created.path("newResults").asLong()).as("nothing posted since it was saved").isZero();
        assertThat(created.path("filters").path("q").asText()).isEqualTo("java");

        // a matching job posted after the save counts as new
        savedSearches.findById(id).ifPresent(row -> {
            row.setCreatedAt(now.minus(Duration.ofDays(30)));
            row.setLastUsedAt(now.minus(Duration.ofDays(30)));
            savedSearches.saveAndFlush(row);
        });
        JsonNode ov = overview("cws-jd-a-c1", a);
        assertThat(ov.path("savedSearches")).hasSize(1);
        assertThat(ov.path("savedSearches").get(0).path("newResults").asLong()).as("Java Developer was posted after the (backdated) save").isEqualTo(1);
        // viewing restarts the counter
        assertThat(ok(send(post(path(a.getId(), "/saved-searches/" + id + "/viewed")), "cws-jd-a-c1", null), "viewed").path("newResults").asLong()).isZero();

        assertThat(overview("cws-jd-a-c2", a).path("savedSearches")).as("c2 never sees c1's saved search").isEmpty();
        assertGeneric404(send(delete(path(a.getId(), "/saved-searches/" + id)), "cws-jd-a-c2", null), "another consultant's saved search");
        assertGeneric404(send(post(path(a.getId(), "/saved-searches/" + id + "/viewed")), "cws-jd-a-c2", null), "view another consultant's saved search");
        ok(send(delete(path(a.getId(), "/saved-searches/" + id)), "cws-jd-a-c1", null), "delete");
        assertThat(overview("cws-jd-a-c1", a).path("savedSearches")).isEmpty();
    }

    @Test
    void savedSearchValidation() throws Exception {
        world();
        MvcResult noName = send(post(path(a.getId(), "/saved-searches")), "cws-jd-a-c1", json("name", q("  "), "filters", json("q", q("java"))));
        assertThat(noName.getResponse().getStatus()).isEqualTo(422);
        MvcResult noFilters = send(post(path(a.getId(), "/saved-searches")), "cws-jd-a-c1", json("name", q("Empty"), "filters", "{}"));
        assertThat(noFilters.getResponse().getStatus()).isEqualTo(422);
        MvcResult missing = send(post(path(a.getId(), "/saved-searches")), "cws-jd-a-c1", json("name", q("No filters key")));
        assertThat(missing.getResponse().getStatus()).isEqualTo(422);
        MvcResult tooLong = send(post(path(a.getId(), "/saved-searches")), "cws-jd-a-c1", json("name", q("x".repeat(81)), "filters", json("q", q("java"))));
        assertThat(tooLong.getResponse().getStatus()).isEqualTo(422);
        ok(send(post(path(a.getId(), "/saved-searches")), "cws-jd-a-c1", json("name", q("Dup"), "filters", json("q", q("java")))), "first");
        assertThat(send(post(path(a.getId(), "/saved-searches")), "cws-jd-a-c1", json("name", q("dup"), "filters", json("q", q("sql")))).getResponse().getStatus()).as("same name").isEqualTo(409);
        for (int i = 0; i < 9; i++) ok(send(post(path(a.getId(), "/saved-searches")), "cws-jd-a-c1", json("name", q("S" + i), "filters", json("q", q("w" + i)))), "fill " + i);
        assertThat(send(post(path(a.getId(), "/saved-searches")), "cws-jd-a-c1", json("name", q("Eleventh"), "filters", json("q", q("z")))).getResponse().getStatus()).as("cap of 10").isEqualTo(422);
    }

    @Test
    void recentSearchesKeepTheLastFiveDeduplicatedAndOwn() throws Exception {
        world();
        for (String term : new String[] { "one", "two", "three", "four", "five", "six" }) {
            ok(send(post(path(a.getId(), "/recent-searches")), "cws-jd-a-c1", json("q", q(term))), "record " + term);
            Thread.sleep(5);
        }
        ok(send(post(path(a.getId(), "/recent-searches")), "cws-jd-a-c1", json("q", q("THREE"), "location", "null")), "same term, new location");
        ok(send(post(path(a.getId(), "/recent-searches")), "cws-jd-a-c1", json("q", q("Four"))), "dedup moves to top");
        JsonNode recent = overview("cws-jd-a-c1", a).path("recentSearches");
        assertThat(recent).hasSize(5);
        assertThat(recent.get(0).path("label").asText()).isEqualTo("Four");
        assertThat(savedSearches.countByOrgIdAndConsultantIdAndKind(a.getId(), c1.getId(), "RECENT")).isEqualTo(5);
        assertThat(overview("cws-jd-a-c2", a).path("recentSearches")).isEmpty();
        assertThat(send(post(path(a.getId(), "/recent-searches")), "cws-jd-a-c1", "{}").getResponse().getStatus()).as("nothing to remember").isEqualTo(422);
    }

    // ---- overview ---------------------------------------------------------------------------------------------

    @Test
    void overviewFilterOptionsRecommendedChipsAndHonestEmptyTrending() throws Exception {
        world();
        JsonNode ov = overview("cws-jd-a-c1", a);
        assertThat(ov.path("openJobs").asLong()).isEqualTo(3);
        assertThat(ov.path("me").path("name").asText()).isEqualTo("Casey One");
        List<String> clientNames = new ArrayList<>();
        for (JsonNode o : ov.path("filterOptions").path("clients")) clientNames.add(o.path("label").asText());
        assertThat(clientNames).containsExactlyInAnyOrder("Acme Corp", "Globex");
        List<String> industries = new ArrayList<>();
        for (JsonNode o : ov.path("filterOptions").path("industries")) industries.add(o.path("label").asText());
        assertThat(industries).containsExactlyInAnyOrder("Finance", "Healthcare");
        assertThat(clientNames).doesNotContain("Other Tenant Co");
        List<String> chipKeys = new ArrayList<>();
        for (JsonNode c : ov.path("recommended")) chipKeys.add(c.path("key").asText());
        assertThat(chipKeys).as("profile work mode REMOTE has no remote job, so no remote chip").doesNotContain("workMode:REMOTE");
        assertThat(chipKeys).contains("jobType:CONTRACT", "skill:java", "skill:sql");
        assertThat(ov.path("trending")).as("3 open jobs is too little data to claim a trend").isEmpty();
    }

    @Test
    void trendingNeedsEnoughOpenJobsAndSkillsAndReportsDemandChange() throws Exception {
        world();
        // 5 more open jobs so there are >= 5 open: recent 30d window vs the 30d before
        for (int i = 0; i < 3; i++) job(a, acme, "Prior Java " + i, "OPEN", 40 + i, "Java", "Python", "SQL");
        job(a, acme, "Recent Java A", "OPEN", 3, "Java", "Python", "SQL");
        job(a, acme, "Recent Java B", "OPEN", 4, "Java", "Python", "SQL");
        JsonNode t = overview("cws-jd-a-c1", a).path("trending");
        assertThat(t.size()).isGreaterThanOrEqualTo(3);
        JsonNode java = null;
        for (JsonNode n : t) if ("Java".equals(n.path("skill").asText())) java = n;
        assertThat(java).isNotNull();
        // Java postings in the last 30 days: world java(2d) + A + B = 3 ... closed role (5d) counts as a posting too = 4; prior window (30-60d): older no, 3 prior jobs
        assertThat(java.path("recent").asLong()).isEqualTo(4);
        assertThat(java.path("prior").asLong()).isEqualTo(3);
        assertThat(java.path("changePct").asDouble()).isEqualTo(33.3);
    }

    // ---- (b) another consultant's data never leaks; (c) other org; (d) non-consultant; (e) empty -----------------

    @Test
    void anotherConsultantsBookmarksSearchesAndTasksNeverLeakAndOtherOrganizationsJobsNeverShow() throws Exception {
        world();
        ok(send(post(path(a.getId(), "/saved/" + java.getId())), "cws-jd-a-c2", null), "c2 saves");
        ok(send(post(path(a.getId(), "/recent-searches")), "cws-jd-a-c2", json("q", q("secret-term"))), "c2 recent");
        JsonNode mine = search("cws-jd-a-c1", a, "?sort=newest");
        for (JsonNode j : mine.path("items")) assertThat(j.path("saved").asBoolean()).isFalse();
        assertThat(overview("cws-jd-a-c1", a).toString()).doesNotContain("secret-term");
        assertThat(search("cws-jd-a-c1", a, "?q=other tenant").path("total").asLong()).isZero();
    }

    @Test
    void anotherOrganizationsJobIdIsTheGeneric404ForEveryJobRoute() throws Exception {
        world();
        long other = bJob.getId();
        assertGeneric404(send(get(path(a.getId(), "/jobs/" + other)), "cws-jd-a-c1", null), "detail of another org's job");
        assertGeneric404(send(post(path(a.getId(), "/saved/" + other)), "cws-jd-a-c1", null), "save another org's job");
        assertGeneric404(send(delete(path(a.getId(), "/saved/" + other)), "cws-jd-a-c1", null), "unsave another org's job");
        assertGeneric404(send(get(path(a.getId(), "/jobs/999999999")), "cws-jd-a-c1", null), "missing job");
        assertThat(savedJobs.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isZero();
    }

    @Test
    void everyRouteIsTheGeneric404ForOtherOrgsNonConsultantsAndProfilelessSeats() throws Exception {
        world();
        long j = java.getId();
        String[][] routes = {
            { "GET", "/overview" }, { "GET", "/search" }, { "GET", "/jobs/" + j }, { "POST", "/saved/" + j }, { "DELETE", "/saved/" + j },
            { "POST", "/saved-searches" }, { "DELETE", "/saved-searches/1" }, { "POST", "/saved-searches/1/viewed" }, { "POST", "/recent-searches" },
        };
        String body = json("name", q("n"), "filters", json("q", q("java")));
        for (String who : new String[] { "cws-jd-b-owner", "cws-jd-b-c1", "ghost-login", "cws-jd-a-owner", "cws-jd-a-marketer", "cws-jd-a-noprofile" }) {
            for (String[] r : routes) {
                MockHttpServletRequestBuilder req = switch (r[0]) {
                    case "POST" -> post(path(a.getId(), r[1]));
                    case "DELETE" -> delete(path(a.getId(), r[1]));
                    default -> get(path(a.getId(), r[1]));
                };
                assertGeneric404(send(req, who, "POST".equals(r[0]) && r[1].endsWith("searches") ? body : null), who + " " + r[0] + " " + r[1]);
            }
        }
        assertGeneric404(send(get(path(999999999L, "/overview")), "cws-jd-a-c1", null), "an organization that does not exist");
        assertThat(savedSearches.countByOrgIdAndConsultantIdAndKind(a.getId(), c1.getId(), "SAVED")).isZero();
    }

    @Test
    void theRoutesAre404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        world();
        flags(true, false);
        assertGeneric404(send(get(path(a.getId(), "/overview")), "cws-jd-a-c1", null), "roles flag off");
        flags(false, true);
        assertGeneric404(send(get(path(a.getId(), "/search")), "cws-jd-a-c1", null), "master flag off");
    }

    @Test
    void aConsultantWithNoSkillsOrMatchesGetsHonestNullScoresAndEmptyBlocks() throws Exception {
        world();
        JsonNode r = search("cws-jd-a-empty", a, "?sort=newest");
        assertThat(r.path("total").asLong()).isEqualTo(3);
        for (JsonNode j : r.path("items")) {
            assertThat(j.path("score").isNull()).as("no profile skills and no match: no score is invented").isTrue();
            assertThat(j.path("scoreSource").isNull()).isTrue();
        }
        JsonNode ov = overview("cws-jd-a-empty", a);
        assertThat(ov.path("savedSearches")).isEmpty();
        assertThat(ov.path("recentSearches")).isEmpty();
        assertThat(search("cws-jd-a-empty", a, "?minScore=60").path("total").asLong()).isZero();
        // org b has one job of its own and its consultant has no skills: still no score
        assertThat(search("cws-jd-b-c1", b, "").path("items").get(0).path("score").isNull()).isTrue();
    }

    // ---- PII ---------------------------------------------------------------------------------------------------

    @Test
    void sensitiveFreeTextIsRefusedOnEveryWrite() throws Exception {
        world();
        String ssn = "SSN 123-45-6789";
        assertPii(send(post(path(a.getId(), "/saved-searches")), "cws-jd-a-c1", json("name", q(ssn), "filters", json("q", q("java")))), "saved search name");
        assertPii(send(post(path(a.getId(), "/saved-searches")), "cws-jd-a-c1", json("name", q("ok"), "filters", json("q", q(ssn)))), "saved search keyword");
        assertPii(send(post(path(a.getId(), "/saved-searches")), "cws-jd-a-c1", json("name", q("ok"), "filters", json("location", q(ssn)))), "saved search location");
        assertPii(send(post(path(a.getId(), "/recent-searches")), "cws-jd-a-c1", json("q", q(ssn))), "recent keyword");
        assertPii(send(post(path(a.getId(), "/recent-searches")), "cws-jd-a-c1", json("skill", q(ssn))), "recent skill");
        assertThat(savedSearches.countByOrgIdAndConsultantIdAndKind(a.getId(), c1.getId(), "SAVED")).isZero();
        assertThat(savedSearches.countByOrgIdAndConsultantIdAndKind(a.getId(), c1.getId(), "RECENT")).isZero();
    }
}
