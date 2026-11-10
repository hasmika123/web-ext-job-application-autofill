package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgBranding;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgBrandingRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * X2.2 through the real chain: {@code GET /api/me/tenant} on a tenant host with real tenant-bound tokens. Covers the contract
 * (eight modules, features pending), permission-filtered navigation per role through the real evaluator, several roles, the
 * ETag, suspended members, and the cross-tenant negatives: a token for A on host B, a personal token on a tenant host, a tid
 * token on the platform host, a member of A and B asking on A, a flag that is off.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class MeTenantResourceIT {

    private static final String HOST = "X-Kiwiply-Host";
    private static final String ACME_HOST = "acme-me.kiwiply.com";
    private static final String BETA_HOST = "beta-me.kiwiply.com";
    private static final String WHO = "me-tenant-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private TenantResolver resolver;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgRoleService roleService;
    @Autowired private OrgRoleRepository roleRows;
    @Autowired private OrgMemberRoleRepository memberRoles;
    @Autowired private OrgBrandingRepository brandings;
    @Autowired private PasswordEncoder encoder;

    /** Modules are flags that are still only declared; the test decides which are on. */
    @MockBean private TenantModules modules;

    private OrgFixtures fx;
    private Organization acme;
    private Organization beta;
    private String n;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        n = Long.toString(System.nanoTime(), 36);
        acme = fx.org("acme-me-" + System.nanoTime(), OrgStatus.ACTIVE);
        beta = fx.org("beta-me-" + System.nanoTime(), OrgStatus.ACTIVE);
        acme.setSubdomain("acme-me");
        acme.setSubdomainEnabled(true);
        acme.setDisplayName("Acme Staffing");
        beta.setSubdomain("beta-me");
        beta.setSubdomainEnabled(true);
        orgs.saveAndFlush(acme);
        orgs.saveAndFlush(beta);
        for (String key : List.of(EnterpriseSettingKeys.FLAG_ENTERPRISE, EnterpriseSettingKeys.FLAG_DOMAINS, EnterpriseSettingKeys.FLAG_ROLES)) {
            rows.save(new AppSetting(key, "{\"on\":true}", WHO, Instant.now()));
        }
        cache.invalidate();
        resolver.invalidate();
        modulesOn(true);
    }

    @AfterEach
    void drop() {
        resolver.invalidate();
        cache.invalidate();
    }

    private void modulesOn(boolean on) {
        Map<String, Boolean> m = new LinkedHashMap<>();
        for (TenantModule t : TenantModule.values()) m.put(t.wire(), on);
        when(modules.forOrg(anyLong())).thenReturn(m);
    }

    private String login(String who) {
        return who + n;
    }

    /** A user with a password and an ACTIVE seat in {@code org}; the role rows are written for the legacy role. */
    private OrgMember member(Organization org, String who, OrgRole role) {
        User u = fx.user(login(who));
        u.setPassword(encoder.encode("test"));
        u.setFirstName(who);
        u.setLastName("Tester");
        users.saveAndFlush(u);
        OrgMember seat = fx.seat(org, login(who), role, OrgMemberStatus.ACTIVE);
        roleService.syncFromLegacy(seat);
        return seat;
    }

    private void addRole(Organization org, OrgMember seat, String templateKey, boolean primary) {
        OrgMemberRole r = new OrgMemberRole();
        r.setOrgId(org.getId());
        r.setMemberId(seat.getId());
        r.setRoleId(roleRows.findSystemByRoleKey(templateKey).orElseThrow().getId());
        r.setPrimary(primary);
        memberRoles.saveAndFlush(r);
    }

    private String token(String host, String who) throws Exception {
        var req = post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"" + login(who) + "\",\"password\":\"test\"}");
        if (host != null) req = req.header(HOST, host);
        MvcResult r = mockMvc.perform(req).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return mapper.readTree(r.getResponse().getContentAsString()).get("accessToken").asText();
    }

    private MvcResult call(String host, String token, String ifNoneMatch) throws Exception {
        var req = get("/api/me/tenant");
        if (host != null) req = req.header(HOST, host);
        if (token != null) req = req.header("Authorization", "Bearer " + token);
        if (ifNoneMatch != null) req = req.header("If-None-Match", ifNoneMatch);
        return mockMvc.perform(req).andReturn();
    }

    private JsonNode ok(String host, String who) throws Exception {
        MvcResult r = call(host, token(host, who), null);
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return mapper.readTree(r.getResponse().getContentAsString());
    }

    private static List<String> keys(JsonNode array, String field) {
        List<String> out = new ArrayList<>();
        for (JsonNode e : array) out.add(e.path(field).asText());
        return out;
    }

    private static JsonNode workspace(JsonNode body, String slug) {
        for (JsonNode w : body.path("workspaces")) if (slug.equals(w.path("key").asText())) return w;
        throw new AssertionError("no workspace " + slug + " in " + keys(body.path("workspaces"), "key"));
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("suspended").doesNotContain("acme");
    }

    // ---- the contract ---------------------------------------------------------------------------------------------

    @Test
    void anOwnerGetsTheContractWithEightModulesPendingFeaturesAndTheAdminWorkspace() throws Exception {
        member(acme, "owner", OrgRole.OWNER);
        JsonNode me = ok(ACME_HOST, "owner");
        assertThat(me.path("org").path("id").asLong()).isEqualTo(acme.getId());
        assertThat(me.path("org").path("displayName").asText()).isEqualTo("Acme Staffing");
        assertThat(me.path("org").path("status").asText()).isEqualTo("ACTIVE");
        assertThat(me.path("org").path("primaryHost").asText()).isEqualTo(ACME_HOST);
        assertThat(me.path("org").path("flags").path("pastDue").asBoolean()).isFalse();
        List<String> moduleKeys = new ArrayList<>();
        me.path("modules").fieldNames().forEachRemaining(moduleKeys::add);
        assertThat(moduleKeys).containsExactly("domains", "roles", "billing", "marketing", "hrFinance", "extensionWorkspaces", "integrations", "analytics");
        assertThat(me.path("features").path("pending").asBoolean()).isTrue();
        assertThat(me.path("features").path("licensed")).isEmpty();
        assertThat(me.path("member").path("status").asText()).isEqualTo("ACTIVE");
        assertThat(me.path("person").path("name").asText()).isEqualTo("owner Tester");
        assertThat(me.path("consent").path("scope").asText()).isEqualTo("NONE");
        assertThat(keys(me.path("roles"), "key")).containsExactly("OWNER");
        assertThat(me.path("roles").get(0).path("workspaceKey").asText()).isEqualTo("ADMIN");
        assertThat(me.path("permissions").path("org.close").asText()).isEqualTo("ORG");
        assertThat(keys(me.path("workspaces"), "key")).containsExactly("admin");
        assertThat(me.path("landing").asText()).isEqualTo("/w/admin");
        assertThat(keys(workspace(me, "admin").path("nav"), "key")).startsWith("home", "employees").contains("billing", "roles", "branding", "settings");
        // no sensitive identity fields anywhere
        assertThat(me.toString().toLowerCase()).doesNotContain("ssn").doesNotContain("birth").doesNotContain("passport");
    }

    @Test
    void theEtagRevalidatesWith304AndChangesWhenARoleIsAdded() throws Exception {
        OrgMember seat = member(acme, "etag", OrgRole.ADMIN);
        String token = token(ACME_HOST, "etag");
        MvcResult first = call(ACME_HOST, token, null);
        String etag = first.getResponse().getHeader("ETag");
        assertThat(etag).isNotBlank();
        assertThat(first.getResponse().getHeader("Cache-Control")).contains("no-cache").contains("private");
        MvcResult again = call(ACME_HOST, token, etag);
        assertThat(again.getResponse().getStatus()).isEqualTo(304);
        assertThat(again.getResponse().getContentAsString()).isEmpty();
        addRole(acme, seat, "MARKETING_MANAGER", false);
        MvcResult changed = call(ACME_HOST, token, etag);
        assertThat(changed.getResponse().getStatus()).as("the old validator no longer matches").isEqualTo(200);
        assertThat(changed.getResponse().getHeader("ETag")).isNotEqualTo(etag);
    }

    // ---- navigation per role -----------------------------------------------------------------------------------------

    @Test
    void navigationFollowsTheMembersRealPermissionsForEveryRole() throws Exception {
        member(acme, "admin", OrgRole.ADMIN);
        member(acme, "marketer", OrgRole.MARKETER);
        member(acme, "finance", OrgRole.FINANCE);
        OrgMember consultant = member(acme, "consultant", OrgRole.MEMBER);
        // the seat's primary role becomes CONSULTANT (the enum column keeps mirroring MEMBER)
        memberRoles.findLiveByOrgIdAndMemberId(acme.getId(), consultant.getId()).forEach(r -> {
            r.setEndsAt(Instant.now());
            memberRoles.saveAndFlush(r);
        });
        addRole(acme, consultant, "CONSULTANT", true);

        JsonNode admin = ok(ACME_HOST, "admin");
        assertThat(keys(admin.path("workspaces"), "key")).containsExactly("admin");
        assertThat(keys(workspace(admin, "admin").path("nav"), "key")).doesNotContain("finance-secret").contains("home", "billing", "audit", "roles");
        assertThat(keys(workspace(admin, "admin").path("groups"), "key")).containsExactly("people", "talent", "pipeline", "organization");
        assertThat(admin.path("permissions").has("org.close")).as("an admin can not close the org").isFalse();

        JsonNode marketer = ok(ACME_HOST, "marketer");
        assertThat(keys(marketer.path("workspaces"), "key")).containsExactly("marketing");
        assertThat(keys(workspace(marketer, "marketing").path("nav"), "key")).contains("home", "talent", "submissions").doesNotContain("approvals");
        assertThat(marketer.path("landing").asText()).isEqualTo("/w/marketing");
        assertThat(marketer.path("permissions").has("billing.view")).isFalse();

        JsonNode finance = ok(ACME_HOST, "finance");
        assertThat(keys(finance.path("workspaces"), "key")).containsExactly("finance");
        assertThat(keys(workspace(finance, "finance").path("nav"), "key")).contains("billing", "invoices", "payments");

        JsonNode c = ok(ACME_HOST, "consultant");
        assertThat(keys(c.path("workspaces"), "key")).containsExactly("consultant");
        assertThat(keys(workspace(c, "consultant").path("nav"), "key")).contains("home", "resumes", "offers").doesNotContain("billing", "clients");
        assertThat(c.path("landing").asText()).isEqualTo("/w/consultant");
    }

    @Test
    void withTheModulesOffTheModulePagesDisappearAndAMarketerHasNoWorkspace() throws Exception {
        member(acme, "admin2", OrgRole.ADMIN);
        member(acme, "marketer2", OrgRole.MARKETER);
        modulesOn(false);
        JsonNode admin = ok(ACME_HOST, "admin2");
        assertThat(keys(workspace(admin, "admin").path("nav"), "key")).doesNotContain("billing", "consultants", "roles").contains("employees", "settings");
        JsonNode marketer = ok(ACME_HOST, "marketer2");
        assertThat(marketer.path("workspaces")).isEmpty();
        assertThat(marketer.path("landing").isNull()).isTrue();
    }

    @Test
    void severalRolesGiveTheUnionAndTheAdminLandsInAdministration() throws Exception {
        OrgMember sarah = member(acme, "sarah", OrgRole.ADMIN);
        addRole(acme, sarah, "MARKETING_MANAGER", false);
        JsonNode me = ok(ACME_HOST, "sarah");
        assertThat(keys(me.path("workspaces"), "key")).containsExactly("admin", "marketing-mgmt");
        assertThat(me.path("landing").asText()).isEqualTo("/w/admin");
        assertThat(keys(me.path("roles"), "key")).containsExactlyInAnyOrder("ORG_ADMIN", "MARKETING_MANAGER");
        assertThat(me.path("permissions").path("approvals.decide").asText()).as("ORG_ADMIN holds every key at ORG, the widest wins").isEqualTo("ORG");
        assertThat(me.path("permissions").path("billing.view").asText()).isEqualTo("ORG");
        assertThat(keys(workspace(me, "marketing-mgmt").path("nav"), "key")).contains("home", "approvals", "workload");
    }

    @Test
    void aSavedLandingPreferenceIsUsedWhileAllowedAndIgnoredWhenNot() throws Exception {
        OrgMember sarah = member(acme, "pref", OrgRole.ADMIN);
        addRole(acme, sarah, "MARKETING_MANAGER", false);
        sarah.setLandingWorkspace("MARKETING_MGMT");
        members.saveAndFlush(sarah);
        assertThat(ok(ACME_HOST, "pref").path("landing").asText()).isEqualTo("/w/marketing-mgmt");
        sarah.setLandingWorkspace("HR");
        members.saveAndFlush(sarah);
        assertThat(ok(ACME_HOST, "pref").path("landing").asText()).isEqualTo("/w/admin");
    }

    @Test
    void publishedNavPreferencesApplyAndDraftsNeverDo() throws Exception {
        member(acme, "nav", OrgRole.ADMIN);
        OrgBranding b = new OrgBranding();
        b.setOrgId(acme.getId());
        b.setNavPrefsJson("{\"hidden\":[\"reports\"],\"greeting\":false}");
        b.setTerminologyJson("{\"member\":\"Talent\"}");
        brandings.saveAndFlush(b); // not published yet
        JsonNode draft = ok(ACME_HOST, "nav");
        assertThat(keys(workspace(draft, "admin").path("nav"), "key")).contains("reports");
        assertThat(draft.path("org").path("terminology")).isEmpty();
        b.setPublishedAt(Instant.now());
        brandings.saveAndFlush(b);
        JsonNode live = ok(ACME_HOST, "nav");
        assertThat(keys(workspace(live, "admin").path("nav"), "key")).doesNotContain("reports").startsWith("home");
        assertThat(live.path("org").path("terminology").path("member").asText()).isEqualTo("Talent");
        assertThat(live.path("org").path("flags").path("greeting").asBoolean()).isFalse();
    }

    @Test
    void aPastDueOrganizationTellsTheAdminTheyMayFixIt() throws Exception {
        member(acme, "payer", OrgRole.OWNER);
        member(acme, "viewer", OrgRole.MARKETER);
        String payer = token(ACME_HOST, "payer");
        String viewer = token(ACME_HOST, "viewer");
        acme.setStatus(OrgStatus.PAST_DUE);
        orgs.saveAndFlush(acme);
        resolver.invalidate();
        JsonNode p = mapper.readTree(call(ACME_HOST, payer, null).getResponse().getContentAsString());
        assertThat(p.path("org").path("flags").path("pastDue").asBoolean()).isTrue();
        assertThat(p.path("org").path("flags").path("billingActionRequired").asBoolean()).isTrue();
        JsonNode v = mapper.readTree(call(ACME_HOST, viewer, null).getResponse().getContentAsString());
        assertThat(v.path("org").path("flags").path("pastDue").asBoolean()).isTrue();
        assertThat(v.path("org").path("flags").path("billingActionRequired").asBoolean()).isFalse();
    }

    // ---- who is refused ----------------------------------------------------------------------------------------------

    @Test
    void aSuspendedMemberGetsThePausedAnswerWithNoOrganizationData() throws Exception {
        OrgMember seat = member(acme, "paused", OrgRole.ADMIN);
        String token = token(ACME_HOST, "paused");
        seat.setStatus(OrgMemberStatus.SUSPENDED);
        members.saveAndFlush(seat);
        MvcResult r = call(ACME_HOST, token, null);
        assertThat(r.getResponse().getStatus()).isEqualTo(403);
        String body = r.getResponse().getContentAsString();
        assertThat(body).contains("MEMBER_SUSPENDED").doesNotContain("Acme").doesNotContain("workspaces").doesNotContain("permissions");
    }

    @Test
    void aMemberWhoWasRemovedAfterSigningInIsTheGeneric404() throws Exception {
        OrgMember seat = member(acme, "gone", OrgRole.ADMIN);
        String token = token(ACME_HOST, "gone");
        seat.setStatus(OrgMemberStatus.REMOVED);
        members.saveAndFlush(seat);
        assertGeneric404(call(ACME_HOST, token, null), "removed member");
    }

    @Test
    void aTokenForOneTenantIsUselessOnAnotherAndANonTenantTokenIsRefused() throws Exception {
        member(acme, "tenanta", OrgRole.OWNER);
        member(beta, "tenantb", OrgRole.OWNER);
        String a = token(ACME_HOST, "tenanta");
        String b = token(BETA_HOST, "tenantb");
        assertThat(call(ACME_HOST, a, null).getResponse().getStatus()).isEqualTo(200);
        assertThat(call(BETA_HOST, a, null).getResponse().getStatus()).as("A's token on B's host").isEqualTo(401);
        assertThat(call(ACME_HOST, b, null).getResponse().getStatus()).as("B's token on A's host").isEqualTo(401);
        assertThat(call(ACME_HOST, null, null).getResponse().getStatus()).as("no token").isEqualTo(401);
        // a personal (platform) token of a real member is not a tenant session
        String personal = token("kiwiply.com", "tenanta");
        assertThat(call(ACME_HOST, personal, null).getResponse().getStatus()).as("personal token on a tenant host").isEqualTo(401);
        // a tenant token on the platform host or with no host at all: the route does not exist there
        assertGeneric404(call("kiwiply.com", a, null), "tid token on the platform host");
        assertGeneric404(call(null, a, null), "tid token with no host");
        // an unserved host fails closed
        assertThat(call("nobody-me.kiwiply.com", a, null).getResponse().getStatus()).isIn(401, 404);
    }

    @Test
    void aMemberOfTwoOrganizationsOnlyEverSeesTheOneOnTheHost() throws Exception {
        member(acme, "both", OrgRole.MARKETER);
        OrgMember inBeta = fx.seat(beta, login("both"), OrgRole.ADMIN, OrgMemberStatus.ACTIVE);
        roleService.syncFromLegacy(inBeta);
        JsonNode onAcme = ok(ACME_HOST, "both");
        assertThat(onAcme.path("org").path("id").asLong()).isEqualTo(acme.getId());
        assertThat(keys(onAcme.path("workspaces"), "key")).containsExactly("marketing");
        assertThat(onAcme.path("permissions").has("billing.manage")).isFalse();
        JsonNode onBeta = ok(BETA_HOST, "both");
        assertThat(onBeta.path("org").path("id").asLong()).isEqualTo(beta.getId());
        assertThat(keys(onBeta.path("workspaces"), "key")).containsExactly("admin");
    }

    @Test
    void aTenantUserWithNoSeatHereIsTheGeneric404() throws Exception {
        member(acme, "seated", OrgRole.OWNER);
        String token = token(ACME_HOST, "seated");
        OrgMember seat = members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), users.findOneByLogin(login("seated")).orElseThrow().getId(), List.of(OrgMemberStatus.ACTIVE)).get(0);
        seat.setStatus(OrgMemberStatus.LEFT);
        members.saveAndFlush(seat);
        assertGeneric404(call(ACME_HOST, token, null), "left member");
    }

    @Test
    void withTheEnterpriseFlagOffTheRouteDoesNotExist() throws Exception {
        member(acme, "flagged", OrgRole.OWNER);
        String token = token(ACME_HOST, "flagged");
        for (AppSetting s : rows.findAll()) if (WHO.equals(s.getUpdatedBy())) rows.delete(s);
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":false}", WHO, Instant.now()));
        cache.invalidate();
        resolver.invalidate();
        MvcResult r = call(ACME_HOST, token, null);
        assertThat(r.getResponse().getStatus()).isIn(401, 404);
        assertThat(r.getResponse().getContentAsString()).doesNotContain("Acme");
    }
}
