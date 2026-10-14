package com.dossier.api.web.rest.ent.consultant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.mkt.MktPipelineApplicationLinkRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
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
 * The consultant's assigned opportunities through the real chain (flags, roles-as-data, OWN scope, the seat's own consultant profile, composite tenant FKs):
 * {@code /api/orgs/{orgId}/con/opportunities} and {@code workspaces[]} of {@code /api/profile/version}. A consultant sees and changes only the rows of their own
 * profile; every refusal (flag off, no permission, no profile, another consultant's row, another tenant) is the same generic 404; a user's application can only
 * be linked by that user.
 *
 * <p>NOTE: written against the real stack (Testcontainers); it needs Docker and was COMPILED but NOT EXECUTED on the machine that wrote it. The application linker is
 * not exercised here: it runs after the commit, which a rolled-back test transaction never reaches (its rules are in {@code PipelineApplicationLinkerTest}).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConOpportunitiesIT {

    private static final String WHO = "con-opportunities-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private EntityManager em;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgRoleRepository roleRows;
    @Autowired private OrgRolePermissionRepository permissionRows;
    @Autowired private OrgMemberRoleRepository memberRoles;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private RequirementMatchRepository matches;
    @Autowired private MktOpportunityRepository opportunities;
    @Autowired private MktOpportunityEventRepository opportunityEvents;
    @Autowired private MktPipelineApplicationLinkRepository links;
    @Autowired private ApplicationRepository applications;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private ConsultantProfile anika;
    private ConsultantProfile ben;
    private MktOpportunity mine;
    private MktOpportunity notMine;
    private Application anikasApplication;
    private Application bensApplication;
    private int roleSeq = 0;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("con-opp-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("con-opp-b-" + n, OrgStatus.ACTIVE);
        flags(true);

        OrgMember anikaSeat = actor(a, "con-anika", new String[][] { { "opportunities.respond", "OWN" } });
        OrgMember benSeat = actor(a, "con-ben", new String[][] { { "opportunities.respond", "OWN" } });
        actor(a, "con-marketer", new String[][] { { "opportunities.manage", "ASSIGNED" } });
        actor(a, "con-noprofile", new String[][] { { "opportunities.respond", "OWN" } });
        actor(a, "con-nobody", new String[][] { { "dashboard.view_org", "ORG" } });
        actor(b, "con-b-consultant", new String[][] { { "opportunities.respond", "OWN" } });

        anika = consultant(a, "Anika Rao", anikaSeat.getId());
        ben = consultant(a, "Ben Cole", benSeat.getId());
        ClientAccount client = client(a, "TechCorp");
        mine = opportunity(a, client, anika, "Java Developer", "101");
        notMine = opportunity(a, client, ben, "Python Developer", "102");
        anikasApplication = application("con-anika", "TechCorp", "Java Developer");
        bensApplication = application("con-ben", "TechCorp", "Python Developer");
        em.flush();
    }

    @AfterEach
    void clean() {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        cache.invalidate();
    }

    private void flags(boolean consultantJobs) {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}", WHO, Instant.now()));
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":true}", WHO, Instant.now()));
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_MARKETING, "{\"on\":true}", WHO, Instant.now()));
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_CONSULTANT_JOBS, "{\"on\":" + consultantJobs + "}", WHO, Instant.now()));
        cache.invalidate();
    }

    // ---- fixtures ---------------------------------------------------------------------------------------------------

    private OrgMember actor(Organization org, String login, String[][] keys) {
        OrgMember m = fx.active(org, login, OrgRole.MEMBER);
        OrgRoleDefinition def = new OrgRoleDefinition();
        def.setOrgId(org.getId());
        def.setRoleKey("CUSTOM_CON_" + (roleSeq++) + "_" + (System.nanoTime() % 100000));
        def.setName("Consultant test role");
        def = roleRows.saveAndFlush(def);
        for (String[] k : keys) permissionRows.saveAndFlush(new OrgRolePermission(def.getId(), k[0], PermissionScope.valueOf(k[1]), null, null));
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

    private ConsultantProfile consultant(Organization org, String name, Long memberId) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(org.getId());
        c.setDisplayName(name);
        c.setEmail(name.toLowerCase().replace(' ', '.') + "@example.test");
        c.setMemberId(memberId);
        return consultants.saveAndFlush(c);
    }

    /** An ASSIGNED match with its opportunity overlay for an open job (identity: greenhouse + external id). */
    private MktOpportunity opportunity(Organization org, ClientAccount client, ConsultantProfile c, String title, String externalId) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(org.getId());
        r.setClientId(client.getId());
        r.setTitle(title);
        r.setStatus("OPEN");
        r.setJobUrl("https://boards.greenhouse.io/techcorp/jobs/" + externalId);
        r.setAtsPlatform("greenhouse");
        r.setExternalJobId(externalId);
        r.setPayLabel("$70-80/hr");
        r = requirements.saveAndFlush(r);
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(org.getId());
        m.setRequirementId(r.getId());
        m.setConsultantId(c.getId());
        m.setScore(80);
        m.setReason("IT");
        m.setSource("MANUAL");
        m.setStatus("ASSIGNED");
        m.setAssignedAt(Instant.now());
        m = matches.saveAndFlush(m);
        MktOpportunity o = new MktOpportunity();
        o.setOrgId(org.getId());
        o.setMatchId(m.getId());
        o.setState("ASSIGNED");
        o.setMarketerNote("Strong fit");
        return opportunities.save(o);
    }

    private Application application(String login, String company, String title) {
        User u = users.findOneByLogin(login).orElseThrow();
        Application ap = new Application();
        ap.setUser(u);
        ap.setCompany(company);
        ap.setRoleTitle(title);
        ap.setStatus(ApplicationStatus.APPLIED);
        ap.setCreatedAt(Instant.now());
        return applications.saveAndFlush(ap);
    }

    private MvcResult call(String login, MockHttpServletRequestBuilder req) throws Exception {
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private static String base(Organization org) {
        return "/api/orgs/" + org.getId() + "/con/opportunities";
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission");
    }

    private JsonNode json(MvcResult r, int status) throws Exception {
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(status);
        return om.readTree(r.getResponse().getContentAsString());
    }

    // ---- reads ------------------------------------------------------------------------------------------------------

    @Test
    void aConsultantListsOnlyTheirOwnOpportunitiesWithNothingTheyMustNotSee() throws Exception {
        JsonNode d = json(call("con-anika", get(base(a))), 200);
        assertThat(d.path("total").asLong()).isEqualTo(1);
        JsonNode item = d.path("items").get(0);
        assertThat(item.path("id").asLong()).isEqualTo(mine.getId());
        assertThat(item.path("state").asText()).isEqualTo("ASSIGNED");
        assertThat(item.path("job").path("title").asText()).isEqualTo("Java Developer");
        assertThat(item.path("job").path("payLabel").asText()).isEqualTo("$70-80/hr");
        assertThat(item.path("allowedActions").toString()).contains("VIEWED").contains("DECLINE");
        assertThat(d.toString()).doesNotContain("Python Developer").doesNotContain("ownerMemberId").doesNotContain("rateMin").doesNotContain("Ben Cole");
        assertThat(json(call("con-anika", get(base(a) + "?state=DECLINED")), 200).path("total").asLong()).isZero();
        assertThat(json(call("con-anika", get(base(a) + "?match=https://boards.greenhouse.io/techcorp/jobs/101&atsPlatform=greenhouse&externalJobId=101")), 200).path("items")).hasSize(1);
    }

    @Test
    void everyRefusalIsTheSameGenericNotFound() throws Exception {
        assertGeneric404(call("con-nobody", get(base(a))), "no opportunities.respond");
        assertGeneric404(call("con-noprofile", get(base(a))), "a seat without a consultant profile");
        assertGeneric404(call("con-marketer", get(base(a))), "a marketer holds opportunities.manage, not respond");
        assertGeneric404(call("con-anika", get(base(b))), "another tenant");
        assertGeneric404(call("con-b-consultant", get(base(a))), "the other tenant's consultant");
        assertGeneric404(call("con-anika", get(base(a) + "/" + notMine.getId())), "another consultant's opportunity");
        assertGeneric404(call("con-anika", post(base(a) + "/" + notMine.getId() + "/viewed").content("{}")), "viewing another consultant's opportunity");
        flags(false);
        assertGeneric404(call("con-anika", get(base(a))), "consultant jobs flag off");
    }

    // ---- the lifecycle ----------------------------------------------------------------------------------------------

    @Test
    void viewedInterestedAndAppliedWithMyOwnApplicationLinksIt() throws Exception {
        assertThat(json(call("con-anika", post(base(a) + "/" + mine.getId() + "/viewed").content("{}")), 200).path("state").asText()).isEqualTo("VIEWED");
        assertThat(json(call("con-anika", post(base(a) + "/" + mine.getId() + "/viewed").content("{}")), 200).path("state").asText()).as("same target: 200 no-op").isEqualTo("VIEWED");
        assertThat(json(call("con-anika", post(base(a) + "/" + mine.getId() + "/interest").content("{}")), 200).path("state").asText()).isEqualTo("INTERESTED");
        JsonNode applied = json(call("con-anika", post(base(a) + "/" + mine.getId() + "/applied").content("{\"applicationId\":" + anikasApplication.getId() + "}")), 200);
        assertThat(applied.path("state").asText()).isEqualTo("APPLIED");
        assertThat(applied.path("linkedApplicationId").asLong()).isEqualTo(anikasApplication.getId());
        assertThat(applied.path("allowedActions").toString()).contains("UNLINK");
        assertThat(links.findByOrgIdAndOpportunityIdAndUnlinkedAtIsNull(a.getId(), mine.getId())).isPresent().get().extracting("source").isEqualTo("CONSULTANT");
        assertThat(opportunityEvents.findByOrgIdAndOpportunityIdOrderByOccurredAtDesc(a.getId(), mine.getId())).extracting("kind").contains("VIEWED", "INTERESTED", "APPLIED");
        assertThat(applications.findById(anikasApplication.getId()).orElseThrow().getStatus()).as("the consultant's own application is untouched").isEqualTo(ApplicationStatus.APPLIED);

        JsonNode unlinked = json(call("con-anika", post(base(a) + "/" + mine.getId() + "/unlink").content("{}")), 200);
        assertThat(unlinked.path("state").asText()).isEqualTo("APPLIED");
        assertThat(unlinked.path("linkedApplicationId").isNull()).isTrue();
        assertThat(links.findByOrgIdAndOpportunityIdAndUnlinkedAtIsNull(a.getId(), mine.getId())).isEmpty();
    }

    @Test
    void appliedWithoutAnApplicationFlipsTheStateAndCreatesNoLink() throws Exception {
        JsonNode d = json(call("con-anika", post(base(a) + "/" + mine.getId() + "/applied")), 200);
        assertThat(d.path("state").asText()).isEqualTo("APPLIED");
        assertThat(d.path("appliedAt").isNull()).isFalse();
        assertThat(links.countByOrgId(a.getId())).isZero();
    }

    @Test
    void anotherUsersApplicationIsA404AndLeavesTheOpportunityAlone() throws Exception {
        assertGeneric404(call("con-anika", post(base(a) + "/" + mine.getId() + "/applied").content("{\"applicationId\":" + bensApplication.getId() + "}")), "ben's application");
        assertGeneric404(call("con-anika", post(base(a) + "/" + mine.getId() + "/link").content("{\"applicationId\":" + bensApplication.getId() + "}")), "ben's application");
        em.clear();
        assertThat(opportunities.findByOrgIdAndId(a.getId(), mine.getId()).orElseThrow().getState()).isEqualTo("ASSIGNED");
        assertThat(links.countByOrgId(a.getId())).isZero();
    }

    @Test
    void anIllegalTransitionIs409AndAStaleIfMatchIs409VersionConflict() throws Exception {
        assertThat(json(call("con-anika", post(base(a) + "/" + mine.getId() + "/decline").content("{\"reason\":\"RATE\",\"note\":\"too low\"}")), 200).path("state").asText()).isEqualTo("DECLINED");
        JsonNode illegal = json(call("con-anika", post(base(a) + "/" + mine.getId() + "/viewed").content("{}")), 409);
        assertThat(illegal.toString()).contains("ILLEGAL_TRANSITION");
        JsonNode stale = json(call("con-anika", post(base(a) + "/" + mine.getId() + "/interest").header("If-Match", "\"999\"").content("{}")), 409);
        assertThat(stale.toString()).contains("VERSION_CONFLICT");
        assertThat(json(call("con-anika", post(base(a) + "/" + mine.getId() + "/interest").content("{}")), 200).path("state").asText()).as("a declined job that is still open can be reopened").isEqualTo("INTERESTED");
    }

    @Test
    void requestInfoNeedsAQuestionAndRefusesSensitiveContent() throws Exception {
        assertThat(json(call("con-anika", post(base(a) + "/" + mine.getId() + "/request-info").content("{\"question\":\"  \"}")), 400).toString()).contains("VALIDATION");
        assertThat(json(call("con-anika", post(base(a) + "/" + mine.getId() + "/request-info").content("{\"question\":\"my ssn is 123-45-6789\"}")), 422).toString()).contains("SENSITIVE_CONTENT");
        JsonNode ok = json(call("con-anika", post(base(a) + "/" + mine.getId() + "/request-info").content("{\"question\":\"Is a W2 option available?\"}")), 200);
        assertThat(ok.path("state").asText()).isEqualTo("NEEDS_INFO");
        assertThat(ok.path("infoRequest").asText()).isEqualTo("Is a W2 option available?");
    }

    // ---- workspaces[] on the profile version -------------------------------------------------------------------------

    @Test
    void theProfileVersionListsTheWorkspaceWithTheRolesTheCallerHolds() throws Exception {
        JsonNode d = json(call("con-anika", get("/api/profile/version")), 200);
        assertThat(d.path("version").asText()).matches("^[0-9a-f]{16}$");
        JsonNode ws = d.path("workspaces");
        assertThat(ws).hasSize(1);
        assertThat(ws.get(0).path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(ws.get(0).path("consultant").asBoolean()).isTrue();
        assertThat(ws.get(0).path("marketer").asBoolean()).isFalse();
        JsonNode marketer = json(call("con-marketer", get("/api/profile/version")), 200).path("workspaces").get(0);
        assertThat(marketer.path("marketer").asBoolean()).isTrue();
        assertThat(marketer.path("consultant").asBoolean()).isFalse();
        // another tenant's person sees only their own organization, never this one
        JsonNode other = json(call("con-b-consultant", get("/api/profile/version")), 200).path("workspaces");
        assertThat(other).hasSize(1);
        assertThat(other.get(0).path("orgId").asLong()).isEqualTo(b.getId());    }
}
