package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgBranding;
import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgType;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgAssignmentRepository;
import com.dossier.api.repository.ent.OrgBrandingRepository;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * X1.12 on MySQL with both switches on: the enterprise demo tenants are seeded through the real tables (organization, hostname,
 * published branding with a logo served by the X2.13 asset route, role rows, seats, assignments, flag rows), a second run
 * creates nothing, and the one-click demo login works on a member's own tenant host only, with a tid-bound token pair.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(90)
class EnterpriseDemoSeederIT {

    private static final String HOST = "X-Kiwiply-Host";

    @Autowired private EnterpriseDemoSeeder seeder;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgHostnameRepository hostnames;
    @Autowired private OrgBrandingRepository brandings;
    @Autowired private OrgRoleRepository roleRows;
    @Autowired private OrgMemberRoleRepository memberRoles;
    @Autowired private OrgAssignmentRepository assignments;
    @Autowired private EnterpriseFeatureFlag flags;
    @Autowired private TenantResolver resolver;
    @Autowired private ResumeBuilderSettings settings;

    @BeforeEach
    void seed() {
        EnterpriseDemoSeeder.Result r = seeder.seed();
        assertThat(r.ran()).as(String.valueOf(r.skippedBecause())).isTrue();
    }

    @AfterEach
    void forget() {
        settings.invalidate();
        resolver.invalidate();
    }

    private Organization acme() {
        return orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).orElseThrow();
    }

    private Organization beta() {
        return orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).orElseThrow();
    }

    private OrgMember seatOf(Organization org, String orgKey, String key) {
        EnterpriseDemoSeeder.Person p = EnterpriseDemoSeeder.bySlug(org.getSlug()).orElseThrow().people().stream().filter(x -> x.key().equals(key)).findFirst().orElseThrow();
        User u = users.findOneByLogin(p.login(orgKey)).orElseThrow();
        return members.findByOrgIdAndUserIdAndStatusIn(org.getId(), u.getId(), List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.SUSPENDED)).get(0);
    }

    private List<String> roleKeys(Organization org, OrgMember seat) {
        return memberRoles
            .findLiveByOrgIdAndMemberId(org.getId(), seat.getId())
            .stream()
            .map(r -> roleRows.findVisibleByOrgIdAndId(org.getId(), r.getRoleId()).orElseThrow().getRoleKey())
            .toList();
    }

    // ---- what is seeded -------------------------------------------------------------------------------------------

    @Test
    void createsTheTwoTenantsWithAnActivePrimaryHostnameAndPublishedBranding() {
        Organization acme = acme();
        assertThat(acme.getName()).isEqualTo("Acme Staffing");
        assertThat(acme.getType()).isEqualTo(OrgType.CONSULTANCY);
        assertThat(acme.getSubdomain()).isEqualTo("acme");
        assertThat(acme.isSubdomainEnabled()).isTrue();
        assertThat(beta().getType()).isEqualTo(OrgType.COMPANY);

        OrgHostname host = hostnames.findPrimaryByOrgId(acme.getId()).orElseThrow();
        assertThat(host.getHostname()).isEqualTo("acme.localhost");
        assertThat(host.getStatus()).isEqualTo(OrgHostnameStatus.ACTIVE);
        assertThat(hostnames.findPrimaryByOrgId(beta().getId()).orElseThrow().getHostname()).isEqualTo("beta.localhost");

        OrgBranding b = brandings.findByOrgId(acme.getId()).orElseThrow();
        assertThat(b.getPublishedAt()).isNotNull();
        assertThat(b.getPrimaryColor()).isEqualTo("#0f766e");
        assertThat(b.getSecondaryColor()).isEqualTo("#f59e0b");
        assertThat(b.getWelcomeTitle()).isEqualTo("Welcome to Acme Staffing");
        assertThat(b.getSupportEmail()).isEqualTo("support@acme.example.com");
        assertThat(b.getLogoKey()).startsWith("org/" + acme.getId() + "/branding/logo-").endsWith(".png");
        assertThat(brandings.findByOrgId(beta().getId()).orElseThrow().getPrimaryColor()).as("different branding").isEqualTo("#4338ca");
    }

    @Test
    void theLogoIsServedByThePublicAssetRouteOnTheTenantHostOnly() throws Exception {
        MvcResult r = mockMvc.perform(get("/api/public/tenant/assets/logo").header(HOST, "acme.localhost")).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(r.getResponse().getContentType()).isEqualTo("image/png");
        assertThat(r.getResponse().getContentAsByteArray()).hasSizeGreaterThan(200);
        // the same route on Beta's host serves Beta's own logo (different bytes), never Acme's
        MvcResult other = mockMvc.perform(get("/api/public/tenant/assets/logo").header(HOST, "beta.localhost")).andReturn();
        assertThat(other.getResponse().getStatus()).isEqualTo(200);
        assertThat(other.getResponse().getContentAsByteArray()).isNotEqualTo(r.getResponse().getContentAsByteArray());
    }

    @Test
    void membersHoldRealRoleRowsAndSarahHoldsTwo() {
        Organization acme = acme();
        assertThat(roleKeys(acme, seatOf(acme, "acme", "sarah"))).containsExactly(RoleTemplates.ORG_ADMIN, RoleTemplates.MARKETING_MANAGER);
        assertThat(roleKeys(acme, seatOf(acme, "acme", "omar"))).containsExactly(RoleTemplates.MARKETING_SPECIALIST);
        assertThat(roleKeys(acme, seatOf(acme, "acme", "anika"))).containsExactly(RoleTemplates.CONSULTANT);
        assertThat(roleKeys(acme, seatOf(acme, "acme", "ben"))).containsExactly(RoleTemplates.CONSULTANT);
        assertThat(roleKeys(acme, seatOf(acme, "acme", "hana"))).containsExactly(RoleTemplates.HR_SPECIALIST);
        assertThat(roleKeys(acme, seatOf(acme, "acme", "felix"))).containsExactly(RoleTemplates.FINANCE_SPECIALIST);
        assertThat(roleKeys(acme, seatOf(acme, "acme", "amara"))).containsExactly(RoleTemplates.ACCOUNT_MANAGER);
        assertThat(roleKeys(acme, seatOf(acme, "acme", "tomas"))).containsExactly(RoleTemplates.TALENT_ACQUISITION);
        assertThat(roleKeys(acme, seatOf(acme, "acme", "eve"))).containsExactly(RoleTemplates.EXECUTIVE_VIEWER);
        OrgMember sarah = seatOf(acme, "acme", "sarah");
        OrgMemberRole primary = memberRoles.findLiveByOrgIdAndMemberId(acme.getId(), sarah.getId()).get(0);
        assertThat(primary.isPrimary()).isTrue();
        assertThat(sarah.getPrimaryRoleId()).isEqualTo(primary.getRoleId());
        assertThat(roleKeys(beta(), seatOf(beta(), "beta", "bea"))).containsExactly(RoleTemplates.OWNER);
        assertThat(memberRoles.countLiveSeatsWithoutPrimaryRole(acme.getId())).as("one primary role row per live member").isZero();
    }

    @Test
    void oneSuspendedOneInvitedAndNoOneElse() {
        Organization acme = acme();
        assertThat(seatOf(acme, "acme", "sam").getStatus()).isEqualTo(OrgMemberStatus.SUSPENDED);
        List<OrgMember> invited = members.findByOrgIdAndInviteEmailAndStatusIn(acme.getId(), "nina.vogel@acme.example.com", List.of(OrgMemberStatus.INVITED));
        assertThat(invited).hasSize(1);
        assertThat(invited.get(0).getUserId()).isNull();
        assertThat(members.countByOrgIdAndStatus(acme.getId(), OrgMemberStatus.ACTIVE)).isEqualTo(9);
        assertThat(members.countByOrgIdAndStatus(beta().getId(), OrgMemberStatus.ACTIVE)).isEqualTo(1);
    }

    @Test
    void everyDemoUserIsFictionalActivatedAndHasAnUnknownPasswordHash() {
        for (EnterpriseDemoSeeder.Tenant t : EnterpriseDemoSeeder.TENANTS) {
            for (EnterpriseDemoSeeder.Person p : t.people()) {
                if (p.status() == OrgMemberStatus.INVITED) {
                    assertThat(users.findOneByLogin(p.login(t.orgKey()))).isEmpty();
                    continue;
                }
                User u = users.findOneByLogin(p.login(t.orgKey())).orElseThrow();
                assertThat(u.getLogin()).startsWith(EnterpriseDemoSeeder.LOGIN_PREFIX);
                assertThat(u.getEmail()).endsWith(".example.com");
                assertThat(u.isActivated()).isTrue();
                assertThat(u.getPassword()).startsWith("$2"); // a bcrypt hash of a random value; no configured secret exists
            }
        }
    }

    @Test
    void sarahActsForAnikaAndOmarForBen() {
        Organization acme = acme();
        long now = assignments.countByOrgId(acme.getId());
        assertThat(now).isEqualTo(2);
    }

    @Test
    void enterpriseFlagsAreOnForTheDemoOrgsOnly() {
        assertThat(flags.isEnabled(acme().getId())).isTrue();
        assertThat(flags.isEnabled(beta().getId())).isTrue();
        assertThat(flags.isEnabled(com.dossier.api.service.settings.EnterpriseSettingKeys.FLAG_ROLES, acme().getId())).isTrue();
        assertThat(flags.isEnabled(Long.MAX_VALUE - 7)).as("an unrelated organization stays dark (allow list)").isFalse();
        assertThat(resolver.resolve("acme.localhost").isTenant()).isTrue();
        assertThat(resolver.resolve("acme.localhost").orgId()).isEqualTo(acme().getId());
        assertThat(resolver.resolve("beta.localhost").orgId()).isEqualTo(beta().getId());
    }

    @Test
    void aSecondRunCreatesNothing() {
        long usersBefore = users.count();
        long seatsBefore = members.countByOrgIdAndStatusIn(acme().getId(), List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.INVITED, OrgMemberStatus.SUSPENDED));
        long assignmentsBefore = assignments.countByOrgId(acme().getId());
        int roleRowsBefore = memberRoles.findLiveByOrgIdAndMemberId(acme().getId(), seatOf(acme(), "acme", "sarah").getId()).size();

        EnterpriseDemoSeeder.Result again = seeder.seed();

        assertThat(again.usersCreated()).isZero();
        assertThat(again.seatsCreated()).isZero();
        assertThat(again.roleRowsCreated()).isZero();
        assertThat(again.assignmentsCreated()).isZero();
        assertThat(users.count()).isEqualTo(usersBefore);
        assertThat(members.countByOrgIdAndStatusIn(acme().getId(), List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.INVITED, OrgMemberStatus.SUSPENDED))).isEqualTo(seatsBefore);
        assertThat(assignments.countByOrgId(acme().getId())).isEqualTo(assignmentsBefore);
        assertThat(memberRoles.findLiveByOrgIdAndMemberId(acme().getId(), seatOf(acme(), "acme", "sarah").getId())).hasSize(roleRowsBefore);
        assertThat(orgs.findBySlug("demo-acme")).isPresent();
    }

    // ---- the demo login ---------------------------------------------------------------------------------------------

    private MvcResult login(String host, String login) throws Exception {
        var req = post("/api/authenticate/demo").contentType(MediaType.APPLICATION_JSON).content("{\"login\":\"" + login + "\"}");
        if (host != null) req = req.header(HOST, host);
        return mockMvc.perform(req).andReturn();
    }

    private JsonNode claims(String jwt) throws Exception {
        return mapper.readTree(Base64.getUrlDecoder().decode(jwt.split("\\.")[1]));
    }

    private static String sarah() {
        return "demo-ent-acme-sarah";
    }

    @Test
    void oneClickLoginOnTheMembersOwnHostIssuesATenantBoundPairAndMeTenantShowsHerTwoWorkspaces() throws Exception {
        MvcResult r = login("acme.localhost", sarah());
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode pair = mapper.readTree(r.getResponse().getContentAsString());
        assertThat(claims(pair.get("accessToken").asText()).get("tid").asLong()).isEqualTo(acme().getId());
        assertThat(claims(pair.get("refreshToken").asText()).get("tid").asLong()).isEqualTo(acme().getId());

        MvcResult me = mockMvc.perform(get("/api/me/tenant").header(HOST, "acme.localhost").header("Authorization", "Bearer " + pair.get("accessToken").asText())).andReturn();
        assertThat(me.getResponse().getStatus()).as(me.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode body = mapper.readTree(me.getResponse().getContentAsString());
        assertThat(body.get("roles")).hasSize(2);
        // two ROLES; a workspace opens only when its home module is live, and Marketing's flag is still deferred (not registrable), so only ADMIN opens today
        assertThat(body.get("workspaces").size()).isGreaterThanOrEqualTo(1);
        assertThat(body.get("workspaces").get(0).get("key").asText()).isEqualTo("ADMIN");
        assertThat(body.get("person").get("name").asText()).isEqualTo("Sarah Chen");
    }

    @Test
    void theSameLoginOnTheOtherTenantsHostIsRefusedAndOnAPlatformHostIsUnknown() throws Exception {
        MvcResult beta = login("beta.localhost", sarah());
        assertThat(beta.getResponse().getStatus()).isEqualTo(403);
        assertThat(beta.getResponse().getContentAsString()).contains("NOT_A_MEMBER");
        assertThat(beta.getResponse().getContentAsString()).doesNotContain("accessToken");
        assertThat(login(null, sarah()).getResponse().getStatus()).as("no host: a legacy caller").isEqualTo(404);
        assertThat(login("localhost", sarah()).getResponse().getStatus()).as("a platform host").isEqualTo(404);
        assertThat(login("nobody.localhost", sarah()).getResponse().getStatus()).as("an unserved host").isEqualTo(404);
    }

    @Test
    void aSuspendedMemberAndAnUnknownLoginAreRefused() throws Exception {
        assertThat(login("acme.localhost", "demo-ent-acme-sam").getResponse().getStatus()).isEqualTo(403);
        assertThat(login("acme.localhost", "demo-ent-acme-nobody").getResponse().getStatus()).isEqualTo(404);
        assertThat(login("acme.localhost", "demo").getResponse().getStatus()).as("the personal demo accounts never sign in on a tenant host").isEqualTo(404);
    }

    @Test
    void theDirectoryListsThisOrgsMembersWithRoleLabelsAndNothingElseAnywhereElse() throws Exception {
        MvcResult r = mockMvc.perform(get("/api/public/tenant/demo").header(HOST, "acme.localhost")).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = mapper.readTree(r.getResponse().getContentAsString());
        assertThat(body.get("enabled").asBoolean()).isTrue();
        assertThat(body.get("org").asText()).isEqualTo("Acme Staffing");
        JsonNode accounts = body.get("accounts");
        assertThat(accounts).hasSize(11);
        JsonNode sarah = accounts.get(0);
        assertThat(sarah.get("login").asText()).isEqualTo(sarah());
        assertThat(sarah.get("name").asText()).isEqualTo("Sarah Chen");
        assertThat(sarah.get("roles")).hasSize(2);
        assertThat(sarah.get("canSignIn").asBoolean()).isTrue();
        assertThat(body.toString()).doesNotContain("password").doesNotContain("beta");
        JsonNode sam = accounts.get(9);
        assertThat(sam.get("status").asText()).isEqualTo("SUSPENDED");
        assertThat(sam.get("canSignIn").asBoolean()).isFalse();
        JsonNode nina = accounts.get(10);
        assertThat(nina.get("status").asText()).isEqualTo("INVITED");
        assertThat(nina.get("login").isNull()).isTrue();

        JsonNode beta = mapper.readTree(mockMvc.perform(get("/api/public/tenant/demo").header(HOST, "beta.localhost")).andReturn().getResponse().getContentAsString());
        assertThat(beta.get("accounts")).hasSize(1);
        assertThat(beta.get("accounts").get(0).get("name").asText()).isEqualTo("Bea Turner");

        JsonNode platform = mapper.readTree(mockMvc.perform(get("/api/public/tenant/demo").header(HOST, "localhost")).andReturn().getResponse().getContentAsString());
        assertThat(platform.get("enabled").asBoolean()).isFalse();
        assertThat(platform.get("accounts")).isEmpty();
    }

    @Test
    void registrationRefusesTheDemoNamespace() {
        assertThat(com.dossier.api.service.DemoAccountService.isDemoLogin("demo-ent-acme-sarah")).isTrue();
        assertThat(com.dossier.api.service.DemoAccountService.isDemoLogin("demo-ent-anything")).isTrue();
        assertThat(com.dossier.api.service.DemoAccountService.isDemoLogin("someone")).isFalse();
    }
}
