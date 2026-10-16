package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.mkt.MktJobMatchRepository;
import com.dossier.api.repository.ent.mkt.MktJobMetaRepository;
import com.dossier.api.repository.ent.mkt.MktSavedSearchRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.mkt.jobs.MktJobsDemoSeeder;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
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
 * Job Discovery on the real stack (MySQL, the real authorization chain). Needs Docker (Testcontainers), like the other ITs; it has
 * been written and compiled but could not be executed on the machine it was written on.
 *
 * <p>Scope: a Marketing Specialist (ASSIGNED) only counts and assigns the consultants that name them as marketer or backup; a consultant
 * of the same org outside that set, a job or consultant of another tenant, and a member without the permission are all the generic 404.
 * Assign writes one match row in ASSIGNED and nothing else.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class MktJobsIT {

    private static final String WHO = "mkt-jobs-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgRoleRepository roleRows;
    @Autowired private OrgRolePermissionRepository permissionRows;
    @Autowired private OrgMemberRoleRepository memberRoles;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private MarketerAssignmentRepository assignments;
    @Autowired private MktJobMatchRepository matches;
    @Autowired private MktJobMetaRepository metas;
    @Autowired private MktSavedSearchRepository searches;
    @Autowired private MktJobsDemoSeeder seeder;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private OrgMember marketer;
    private OrgMember viewer;
    private OrgMember other;
    private OrgMember bOwner;
    private ConsultantProfile mine;
    private ConsultantProfile notMine;
    private ClientRequirement jobA;
    private ClientRequirement jobB;
    private int custom;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("mkt-jobs-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("mkt-jobs-b-" + n, OrgStatus.ACTIVE);
        flags();
        marketer = actor(a, "mkt-jobs-marketer", new String[] { "matches.run", "ASSIGNED" }, new String[] { "opportunities.manage", "ASSIGNED" });
        viewer = actor(a, "mkt-jobs-viewer", new String[] { "matches.run", "ASSIGNED" });
        other = actor(a, "mkt-jobs-other", new String[] { "matches.run", "ASSIGNED" }, new String[] { "opportunities.manage", "ASSIGNED" });
        fx.active(b, "mkt-jobs-nobody", OrgRole.MEMBER);
        bOwner = actor(b, "mkt-jobs-b-marketer", new String[] { "matches.run", "ASSIGNED" }, new String[] { "opportunities.manage", "ASSIGNED" });

        ClientAccount ca = client(a, "TechCorp");
        ClientAccount cb = client(b, "Other Tenant Co");
        jobA = job(a, ca, "Senior Java Developer");
        jobB = job(b, cb, "Hidden Job");
        mine = consultant(a, "Alex Morgan");
        notMine = consultant(a, "Priya Sharma");
        assign(a, mine, marketer);
        assign(a, notMine, other);
        match(a, jobA, mine, 95);
        match(a, jobA, notMine, 96);
    }

    @AfterEach
    void clean() {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        cache.invalidate();
    }

    private void flags() {
        for (String key : new String[] { EnterpriseSettingKeys.FLAG_ENTERPRISE, EnterpriseSettingKeys.FLAG_ROLES, EnterpriseSettingKeys.FLAG_MARKETING }) {
            settingRows.save(new AppSetting(key, "{\"on\":true}", WHO, Instant.now()));
        }
        cache.invalidate();
    }

    private OrgMember actor(Organization org, String login, String[]... perms) {
        OrgMember m = fx.active(org, login, OrgRole.MEMBER);
        m.setJoinedAt(Instant.now().minus(Duration.ofDays(100)));
        members.saveAndFlush(m);
        OrgRoleDefinition def = new OrgRoleDefinition();
        def.setOrgId(org.getId());
        def.setRoleKey("CUSTOM_MKT_JOBS_" + (custom++) + "_" + (System.nanoTime() % 100000));
        def.setName("Job discovery test role");
        def = roleRows.saveAndFlush(def);
        for (String[] p : perms) permissionRows.saveAndFlush(new OrgRolePermission(def.getId(), p[0], PermissionScope.valueOf(p[1]), null, null));
        OrgMemberRole row = new OrgMemberRole();
        row.setOrgId(org.getId());
        row.setMemberId(m.getId());
        row.setRoleId(def.getId());
        row.setPrimary(true);
        row.setGrantedAt(Instant.now());
        memberRoles.saveAndFlush(row);
        m.setPrimaryRoleId(def.getId());
        members.saveAndFlush(m);
        return m;
    }

    private ClientAccount client(Organization org, String name) {
        ClientAccount c = new ClientAccount();
        c.setOrgId(org.getId());
        c.setName(name);
        return clients.saveAndFlush(c);
    }

    private ClientRequirement job(Organization org, ClientAccount client, String title) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(org.getId());
        r.setClientId(client.getId());
        r.setTitle(title);
        r.setStatus("OPEN");
        r.setPostedAt(Instant.now().minus(Duration.ofHours(2)));
        r.setRateMinMinor(9000L);
        r.setRateMaxMinor(11000L);
        r.setRateUnit("HOUR");
        return requirements.saveAndFlush(r);
    }

    private ConsultantProfile consultant(Organization org, String name) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(org.getId());
        c.setDisplayName(name);
        c.setEmail(name.toLowerCase().replace(' ', '.') + "@example.com");
        return consultants.saveAndFlush(c);
    }

    private void assign(Organization org, ConsultantProfile c, OrgMember marketer) {
        MarketerAssignment as = new MarketerAssignment();
        as.setOrgId(org.getId());
        as.setConsultantId(c.getId());
        as.setMarketerMemberId(marketer.getId());
        assignments.saveAndFlush(as);
    }

    private void match(Organization org, ClientRequirement job, ConsultantProfile c, int score) {
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(org.getId());
        m.setRequirementId(job.getId());
        m.setConsultantId(c.getId());
        m.setScore(score);
        matches.save(m);
    }

    private MvcResult call(String login, MockHttpServletRequestBuilder req) throws Exception {
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private static String base(Organization org) {
        return "/api/orgs/" + org.getId() + "/mkt/jobs";
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("denied");
    }

    @Test
    void theBoardCountsOnlyTheConsultantsTheMarketerIsAssigned() throws Exception {
        MvcResult r = call("mkt-jobs-marketer", get(base(a)));
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode d = om.readTree(r.getResponse().getContentAsString());
        assertThat(d.path("total").asLong()).isEqualTo(1);
        assertThat(d.path("items").get(0).path("title").asText()).isEqualTo("Senior Java Developer");
        assertThat(d.path("items").get(0).path("client").path("name").asText()).isEqualTo("TechCorp");
        assertThat(d.path("items").get(0).path("rateLabel").asText()).isEqualTo("$90 - $110/hr");
        assertThat(d.path("items").get(0).path("source").asText()).as("a job with no meta row").isEqualTo("Client Portal");
        assertThat(d.path("canAssign").asBoolean()).isTrue();
        assertThat(d.path("kpis").path("highMatch").path("value").asLong()).as("Priya's 96 is another marketer's consultant").isEqualTo(1);
        assertThat(d.path("kpis").path("newToday").path("value").asLong()).isEqualTo(1);
        assertThat(om.writeValueAsString(d)).doesNotContain("Hidden Job").doesNotContain("Other Tenant Co");
        JsonNode viewerBoard = om.readTree(call("mkt-jobs-viewer", get(base(a))).getResponse().getContentAsString());
        assertThat(viewerBoard.path("canAssign").asBoolean()).isFalse();
        assertThat(viewerBoard.path("kpis").path("highMatch").path("value").asLong()).as("the viewer has no assigned consultants").isZero();
    }

    @Test
    void assignWritesOneAssignedMatchAndNothingElse() throws Exception {
        long before = matches.findByOrgIdAndStatus(a.getId(), "ASSIGNED").size();
        MvcResult r = call("mkt-jobs-marketer", post(base(a) + "/" + jobA.getId() + "/assign").content("{\"consultantId\":" + mine.getId() + "}"));
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode d = om.readTree(r.getResponse().getContentAsString());
        assertThat(d.path("status").asText()).isEqualTo("ASSIGNED");
        assertThat(d.path("created").asBoolean()).isFalse();
        RequirementMatch row = matches.findByOrgIdAndRequirementIdAndConsultantId(a.getId(), jobA.getId(), mine.getId()).orElseThrow();
        assertThat(row.getStatus()).isEqualTo("ASSIGNED");
        assertThat(row.getAssignedByMemberId()).isEqualTo(marketer.getId());
        assertThat(matches.findByOrgIdAndStatus(a.getId(), "ASSIGNED")).hasSize((int) before + 1);
        MvcResult again = call("mkt-jobs-marketer", post(base(a) + "/" + jobA.getId() + "/assign").content("{\"consultantId\":" + mine.getId() + "}"));
        assertThat(again.getResponse().getStatus()).isEqualTo(200);
        assertThat(matches.findByOrgIdAndStatus(a.getId(), "ASSIGNED")).hasSize((int) before + 1);
    }

    @Test
    void aConsultantOutsideTheScopeAJobOfAnotherTenantAndAMemberWithoutThePermissionAreTheGeneric404() throws Exception {
        assertGeneric404(call("mkt-jobs-marketer", post(base(a) + "/" + jobA.getId() + "/assign").content("{\"consultantId\":" + notMine.getId() + "}")), "a consultant of another marketer");
        assertGeneric404(call("mkt-jobs-marketer", post(base(a) + "/" + jobB.getId() + "/assign").content("{\"consultantId\":" + mine.getId() + "}")), "another tenant's job");
        assertGeneric404(call("mkt-jobs-marketer", get(base(a) + "/" + jobB.getId())), "another tenant's job detail");
        assertGeneric404(call("mkt-jobs-viewer", post(base(a) + "/" + jobA.getId() + "/assign").content("{\"consultantId\":" + mine.getId() + "}")), "no opportunities.manage");
        assertGeneric404(call("mkt-jobs-nobody", get(base(a))), "a member with no marketing permission");
        assertGeneric404(call("mkt-jobs-b-marketer", get(base(a))), "another tenant's marketer");
        assertThat(matches.findByOrgIdAndRequirementIdAndConsultantId(a.getId(), jobA.getId(), notMine.getId()).orElseThrow().getStatus()).isEqualTo("SUGGESTED");
    }

    @Test
    void candidatesAreTheCallersOwnConsultants() throws Exception {
        MvcResult r = call("mkt-jobs-marketer", get(base(a) + "/" + jobA.getId() + "/candidates"));
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        JsonNode d = om.readTree(r.getResponse().getContentAsString());
        assertThat(d).hasSize(1);
        assertThat(d.get(0).path("name").asText()).isEqualTo("Alex Morgan");
        assertThat(d.get(0).path("score").asInt()).isEqualTo(95);
    }

    @Test
    void aConsultantOnAProjectIsListedDisabledWithTheReasonAndAssigningThemIsAClear409() throws Exception {
        mine.setMarketingStatus("PAUSED"); // on a project
        consultants.saveAndFlush(mine);
        JsonNode d = om.readTree(call("mkt-jobs-marketer", get(base(a) + "/" + jobA.getId() + "/candidates")).getResponse().getContentAsString());
        assertThat(d).as("still listed, so the picker can show them disabled").hasSize(1);
        assertThat(d.get(0).path("pausedReason").asText()).isEqualTo("On a project — marketing paused");

        MvcResult r = call("mkt-jobs-marketer", post(base(a) + "/" + jobA.getId() + "/assign").content("{\"consultantId\":" + mine.getId() + "}"));
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(409);
        JsonNode body = om.readTree(r.getResponse().getContentAsString());
        assertThat(body.path("code").asText()).isEqualTo("CONSULTANT_PAUSED");
        assertThat(body.toString()).contains("on a project").doesNotContain("not_found");
        assertThat(matches.findByOrgIdAndRequirementIdAndConsultantId(a.getId(), jobA.getId(), mine.getId()).orElseThrow().getStatus()).as("nothing was assigned").isEqualTo("SUGGESTED");

        // strangers and unassigned consultants keep the generic 404, paused or not
        notMine.setMarketingStatus("PAUSED");
        consultants.saveAndFlush(notMine);
        assertGeneric404(call("mkt-jobs-marketer", post(base(a) + "/" + jobA.getId() + "/assign").content("{\"consultantId\":" + notMine.getId() + "}")), "a paused consultant of another marketer");
        assertGeneric404(call("mkt-jobs-viewer", post(base(a) + "/" + jobA.getId() + "/assign").content("{\"consultantId\":" + mine.getId() + "}")), "no opportunities.manage, paused consultant");

        // back to ACTIVE marketing: assignable again; an INACTIVE consultant is still the old 404
        mine.setMarketingStatus("ACTIVE");
        consultants.saveAndFlush(mine);
        MvcResult again = call("mkt-jobs-marketer", post(base(a) + "/" + jobA.getId() + "/assign").content("{\"consultantId\":" + mine.getId() + "}"));
        assertThat(again.getResponse().getContentAsString()).as("no longer refused as paused").doesNotContain("CONSULTANT_PAUSED");
    }

    @Test
    void savedSearchesBelongToTheirOwner() throws Exception {
        MvcResult created = call("mkt-jobs-marketer", post(base(a) + "/saved-searches").content("{\"name\":\"Java East\",\"criteria\":{\"skills\":[\"Java\"],\"location\":\"NY\"}}"));
        assertThat(created.getResponse().getStatus()).as(created.getResponse().getContentAsString()).isEqualTo(201);
        long id = om.readTree(created.getResponse().getContentAsString()).path("id").asLong();
        JsonNode board = om.readTree(call("mkt-jobs-marketer", get(base(a))).getResponse().getContentAsString());
        assertThat(board.path("savedSearches")).hasSize(1);
        assertThat(board.path("kpis").path("savedSearches").path("value").asLong()).isEqualTo(1);
        assertThat(om.readTree(call("mkt-jobs-other", get(base(a))).getResponse().getContentAsString()).path("savedSearches")).as("another marketer's board").isEmpty();
        assertGeneric404(call("mkt-jobs-other", delete(base(a) + "/saved-searches/" + id)), "someone else's saved search");
        assertGeneric404(call("mkt-jobs-other", post(base(a) + "/saved-searches/" + id + "/seen")), "someone else's saved search (seen)");
        assertThat(searches.findByOrgIdAndOwnerMemberIdAndId(a.getId(), marketer.getId(), id)).isPresent();
        assertThat(call("mkt-jobs-marketer", delete(base(a) + "/saved-searches/" + id)).getResponse().getStatus()).isEqualTo(204);
        assertThat(searches.findByOrgIdAndOwnerMemberIdAndId(a.getId(), marketer.getId(), id)).isEmpty();
        MvcResult bad = call("mkt-jobs-marketer", post(base(a) + "/saved-searches").content("{\"name\":\"SSN 123-45-6789\",\"criteria\":{\"skills\":[\"Java\"]}}"));
        assertThat(bad.getResponse().getStatus()).as("personal data is refused").isGreaterThanOrEqualTo(400);
    }

    @Test
    void theDemoSeederAddsMetaToEveryJobOnlyOnce() {
        long added = seeder.seedMeta(a.getId(), Instant.now());
        assertThat(added).isEqualTo(1);
        assertThat(seeder.seedMeta(a.getId(), Instant.now())).as("idempotent").isZero();
        assertThat(metas.findByOrgIdAndRequirementId(a.getId(), jobA.getId())).isPresent();
        assertThat(metas.findByOrgId(b.getId())).as("another tenant is untouched").isEmpty();
    }
}
