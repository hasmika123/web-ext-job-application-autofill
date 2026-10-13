package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.ent.OrgMemberDismissalRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.dashboard.DashboardWidgetProvider;
import com.dossier.api.service.ent.dashboard.WidgetResult;
import com.dossier.api.service.ent.dashboard.DashboardContext;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
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
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * X2.4 through the real chain on real rows: {@code GET /api/orgs/{orgId}/dashboard}. Every number is asserted against rows the test
 * wrote (seats with join and leave dates, role rows, hostnames, audit lines), every refusal is the generic 404, a team-scoped actor
 * sees only their slice, and modules that have no tables answer {@code unavailable / NOT_ENABLED} with no data at all.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@Import(OrgDashboardResourceIT.BoomProviderConfig.class)
class OrgDashboardResourceIT {

    private static final String WHO = "dashboard-it";

    /** A provider that always throws: proves one broken widget never takes the page down. Needs a permission only the test owner has. */
    @TestConfiguration
    static class BoomProviderConfig {

        @Bean
        DashboardWidgetProvider boomProvider() {
            return new DashboardWidgetProvider() {
                @Override
                public String key() {
                    return "test.boom";
                }

                @Override
                public int order() {
                    return 9999;
                }

                @Override
                public List<String> permissions() {
                    return List.of("org.close"); // OWNER only
                }

                @Override
                public String module() {
                    return null;
                }

                @Override
                public WidgetResult compute(DashboardContext ctx) {
                    throw new IllegalStateException("secret internal detail");
                }
            };
        }
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgRoleRepository roleRows;
    @Autowired private OrgRolePermissionRepository permissionRows;
    @Autowired private OrgMemberRoleRepository memberRoles;
    @Autowired private OrgHostnameRepository hostnames;
    @Autowired private OrgGroupRepository groups;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private OrgMemberDismissalRepository dismissals;
    @Autowired private com.dossier.api.service.ent.OrgRoleService roleService;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private ResumeBuilderSettings cache;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private int custom = 0;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("dash-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("dash-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);

        // Staff of A: owner and admin joined 100 days ago; a member and a marketer just now.
        staff(a, "dash-a-owner", OrgRole.OWNER, now.minus(Duration.ofDays(100)));
        staff(a, "dash-a-admin", OrgRole.ADMIN, now.minus(Duration.ofDays(100)));
        staff(a, "dash-a-member", OrgRole.MEMBER, null);
        staff(a, "dash-a-marketer", OrgRole.MARKETER, null);

        // Consultants of A: two active (one since 100 days, one since 10), one suspended, one invited (expires in 24 h), one who left 40 days ago.
        consultant(a, "dash-a-c1", OrgMemberStatus.ACTIVE, now.minus(Duration.ofDays(100)), null, null);
        consultant(a, "dash-a-c2", OrgMemberStatus.ACTIVE, now.minus(Duration.ofDays(10)), null, null);
        consultant(a, "dash-a-c3", OrgMemberStatus.SUSPENDED, now.minus(Duration.ofDays(50)), null, null);
        consultant(a, "dash-a-c4", OrgMemberStatus.INVITED, null, null, now.plus(Duration.ofHours(24)));
        consultant(a, "dash-a-c5", OrgMemberStatus.LEFT, now.minus(Duration.ofDays(100)), now.minus(Duration.ofDays(40)), null);

        staff(b, "dash-b-owner", OrgRole.OWNER, now.minus(Duration.ofDays(100)));
        fx.user("dash-loner");
        fx.seat(a, "dash-a-gone", OrgRole.MEMBER, OrgMemberStatus.SUSPENDED);
    }

    @AfterEach
    void clean() {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        cache.invalidate();
    }

    private void flags(boolean master, boolean roles) {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":" + master + "}", WHO, Instant.now()));
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":" + roles + "}", WHO, Instant.now()));
        cache.invalidate();
    }

    // ---- fixtures -------------------------------------------------------------------------------------------------

    private OrgMember staff(Organization org, String login, OrgRole role, Instant joined) {
        OrgMember m = fx.active(org, login, role);
        m.setJoinedAt(joined);
        members.saveAndFlush(m);
        roleService.syncFromLegacy(m);
        return m;
    }

    private OrgMember consultant(Organization org, String login, OrgMemberStatus status, Instant joined, Instant left, Instant inviteExpires) {
        OrgMember m = fx.seat(org, login, LegacyRoleMirror.toEnum(RoleTemplates.CONSULTANT).orElse(OrgRole.MEMBER), status);
        m.setJoinedAt(joined);
        m.setLeftAt(left);
        m.setInviteExpiresAt(inviteExpires);
        members.saveAndFlush(m);
        grant(org, m, roleRows.findSystemByRoleKey(RoleTemplates.CONSULTANT).orElseThrow().getId(), true);
        return m;
    }

    private void grant(Organization org, OrgMember m, Long roleId, boolean primary) {
        OrgMemberRole row = new OrgMemberRole();
        row.setOrgId(org.getId());
        row.setMemberId(m.getId());
        row.setRoleId(roleId);
        row.setPrimary(primary);
        row.setGrantedAt(Instant.now());
        memberRoles.saveAndFlush(row);
        if (primary) {
            m.setPrimaryRoleId(roleId);
            members.saveAndFlush(m);
        }
    }

    /** A seat whose only role is a custom role holding exactly {@code rows}: ["key", "SCOPE"] or ["key", "SCOPE", "ROW_FILTER"]. */
    private OrgMember customActor(Organization org, String login, String[]... rows) {
        OrgMember m = fx.active(org, login, OrgRole.MEMBER);
        m.setJoinedAt(now.minus(Duration.ofDays(100)));
        members.saveAndFlush(m);
        OrgRoleDefinition def = new OrgRoleDefinition();
        def.setOrgId(org.getId());
        def.setRoleKey("CUSTOM_DASH_" + (custom++) + "_" + (System.nanoTime() % 100000));
        def.setName("Dashboard test role");
        def = roleRows.saveAndFlush(def);
        for (String[] r : rows) {
            permissionRows.saveAndFlush(new OrgRolePermission(def.getId(), r[0], PermissionScope.valueOf(r[1]), null, r.length > 2 ? r[2] : null));
        }
        grant(org, m, def.getId(), true);
        return m;
    }

    private static String[] row(String key, String scope) {
        return new String[] { key, scope };
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private MvcResult call(String login, MockHttpServletRequestBuilder req) throws Exception {
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private JsonNode dashboard(String login, Organization org) throws Exception {
        MvcResult r = call(login, get("/api/orgs/" + org.getId() + "/dashboard"));
        assertThat(r.getResponse().getStatus()).as(login + " -> " + r.getResponse().getContentAsString()).isEqualTo(200);
        return om.readTree(r.getResponse().getContentAsString());
    }

    private static Map<String, JsonNode> byKey(JsonNode dashboard) {
        Map<String, JsonNode> m = new LinkedHashMap<>();
        for (JsonNode w : dashboard.path("widgets")) m.put(w.path("key").asText(), w);
        return m;
    }

    private Map<String, JsonNode> widgets(String login, Organization org) throws Exception {
        return byKey(dashboard(login, org));
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("not a member").doesNotContain("denied");
    }

    // ---- the owner's page -------------------------------------------------------------------------------------------

    @Test
    void ownerGetsTheWidgetsInBoardOrderAndTheStateIsAlwaysOneOfTheFour() throws Exception {
        JsonNode d = dashboard("dash-a-owner", a);
        assertThat(d.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(d.path("generatedAt").asText()).isNotBlank();
        List<String> keys = new ArrayList<>(byKey(d).keySet());
        assertThat(keys).containsExactly(
            "consultants.total", "employees.active", "applications.active", "interviews.upcoming", "placements", "finance.summary", "team.performance",
            "pipeline.overview", "quick.actions", "alerts", "invites.pending", "activity.recent", "subscription.summary", "test.boom"
        );
        for (JsonNode w : d.path("widgets")) assertThat(w.path("state").asText()).isIn("ok", "empty", "unavailable", "error");
    }

    @Test
    void consultantsTotalIsCountedFromTheSeatsWithItsRealThirtyDayChange() throws Exception {
        JsonNode w = widgets("dash-a-owner", a).get("consultants.total");
        assertThat(w.path("state").asText()).isEqualTo("ok");
        JsonNode data = w.path("data");
        assertThat(data.path("value").asLong()).as("c1 and c2 are active now").isEqualTo(2);
        assertThat(data.path("previous").asLong()).as("30 days ago only c1 was active (c2 joined 10 days ago, c5 had left)").isEqualTo(1);
        assertThat(data.path("deltaPct").asDouble()).isEqualTo(100.0);
        assertThat(data.path("comparedTo").asText()).isEqualTo("30d");
        assertThat(data.path("counts").path("active").asLong()).isEqualTo(2);
        assertThat(data.path("counts").path("invited").asLong()).isEqualTo(1);
        assertThat(data.path("counts").path("suspended").asLong()).isEqualTo(1);
        JsonNode spark = data.path("sparkline");
        assertThat(spark).hasSize(8);
        assertThat(spark.get(7).asLong()).as("the last point is today's value").isEqualTo(2);
        assertThat(spark.get(0).asLong()).as("49 days ago c1 and c5 were active").isEqualTo(2);
    }

    @Test
    void employeesActiveCountsStaffNotConsultantsAndHasNoDeltaWhenThereWasNothingBefore() throws Exception {
        JsonNode data = widgets("dash-a-owner", a).get("employees.active").path("data");
        assertThat(data.path("value").asLong()).as("owner, admin, member, marketer").isEqualTo(4);
        assertThat(data.path("previous").asLong()).as("only owner and admin existed 30 days ago").isEqualTo(2);
        assertThat(data.path("deltaPct").asDouble()).isEqualTo(100.0);
    }

    @Test
    void aWidgetWithNoBaselineHasANullDeltaNeverAMadeUpOne() throws Exception {
        // an org whose seats all joined today
        Organization c = fx.org("dash-c-" + System.nanoTime(), OrgStatus.ACTIVE);
        staff(c, "dash-c-owner", OrgRole.OWNER, null);
        JsonNode data = widgets("dash-c-owner", c).get("employees.active").path("data");
        assertThat(data.path("value").asLong()).isEqualTo(1);
        assertThat(data.path("previous").asLong()).isEqualTo(0);
        assertThat(data.get("deltaPct").isNull()).isTrue();
    }

    @Test
    void moduleWidgetsWithoutTablesAreNotEnabledAndCarryNoNumbers() throws Exception {
        Map<String, JsonNode> w = widgets("dash-a-owner", a);
        for (String key : List.of("applications.active", "interviews.upcoming", "placements", "finance.summary", "team.performance", "pipeline.overview")) {
            JsonNode node = w.get(key);
            assertThat(node.path("state").asText()).as(key).isEqualTo("unavailable");
            assertThat(node.path("reason").asText()).as(key).isEqualTo("NOT_ENABLED");
            assertThat(node.path("module").asText()).as(key).isNotBlank();
            assertThat(node.has("data")).as(key + " has no data at all").isFalse();
        }
    }

    @Test
    void invitesPendingCountsInvitedExpiringAndSuspended() throws Exception {
        JsonNode data = widgets("dash-a-owner", a).get("invites.pending").path("data");
        assertThat(data.path("invited").asLong()).isEqualTo(1);
        assertThat(data.path("expiringSoon").asLong()).isEqualTo(1);
        assertThat(data.path("suspended").asLong()).as("c3 and the suspended member").isEqualTo(2);
    }

    @Test
    void quickActionsAreFilteredByPermissionAndSoonOnesAreNotAvailable() throws Exception {
        JsonNode items = widgets("dash-a-owner", a).get("quick.actions").path("data").path("items");
        Map<String, JsonNode> byKey = new LinkedHashMap<>();
        for (JsonNode i : items) byKey.put(i.path("key").asText(), i);
        assertThat(byKey.keySet()).containsExactly("invite-employee", "assign-marketer", "configure-licenses", "review-applications", "view-pipeline", "configure-organization");
        assertThat(byKey.get("invite-employee").path("available").asBoolean()).isTrue();
        assertThat(byKey.get("invite-employee").path("href").asText()).isEqualTo("/w/admin/employees?invite=1");
        assertThat(byKey.get("review-applications").path("available").asBoolean()).isFalse();
        assertThat(byKey.get("review-applications").path("soonModule").asText()).isEqualTo("applications");

        customActor(a, "dash-a-inviter", row("dashboard.view_org", "ORG"), row("members.invite", "ORG"));
        JsonNode only = widgets("dash-a-inviter", a).get("quick.actions").path("data").path("items");
        assertThat(only).hasSize(1);
        assertThat(only.get(0).path("key").asText()).isEqualTo("invite-employee");
    }

    // ---- alerts ---------------------------------------------------------------------------------------------------

    @Test
    void alertsComeFromRealConditionsMostSevereFirstAndPastDueIsADangerAlert() throws Exception {
        OrgHostname h = new OrgHostname();
        h.setOrgId(a.getId());
        h.setHostname("dash-a-" + System.nanoTime() + ".example.test");
        h.setKind(OrgHostnameKind.CUSTOM);
        h.setStatus(OrgHostnameStatus.SUSPENDED);
        hostnames.saveAndFlush(h);
        a.setStatus(OrgStatus.PAST_DUE);
        orgs.saveAndFlush(a);

        JsonNode items = widgets("dash-a-owner", a).get("alerts").path("data").path("items");
        List<String> keys = new ArrayList<>();
        for (JsonNode i : items) keys.add(i.path("key").asText());
        assertThat(keys).containsExactly("ORG_PAST_DUE", "DOMAIN_SUSPENDED", "INVITES_EXPIRING", "MEMBERS_SUSPENDED");
        assertThat(items.get(0).path("severity").asText()).isEqualTo("danger");
        assertThat(items.get(0).path("href").asText()).isEqualTo("/w/admin/billing");
        assertThat(items.get(1).path("href").asText()).isEqualTo("/w/admin/domains");
        assertThat(items.get(3).path("count").asLong()).as("c3 and the suspended member").isEqualTo(2);
    }

    @Test
    void singleAdminAlertAppearsOnlyWhenExactlyOneAdministratorIsLeft() throws Exception {
        Organization c = fx.org("dash-d-" + System.nanoTime(), OrgStatus.ACTIVE);
        staff(c, "dash-d-owner", OrgRole.OWNER, now.minus(Duration.ofDays(5)));
        JsonNode items = widgets("dash-d-owner", c).get("alerts").path("data").path("items");
        assertThat(items.get(0).path("key").asText()).isEqualTo("SINGLE_ADMIN");
        staff(c, "dash-d-second", OrgRole.ADMIN, now.minus(Duration.ofDays(5)));
        assertThat(widgets("dash-d-owner", c).get("alerts").path("state").asText()).isEqualTo("empty");
    }

    @Test
    void dismissingAnAlertHidesItForThatMemberOnlyAndItComesBackAfterSevenDays() throws Exception {
        MvcResult r = call("dash-a-owner", post("/api/orgs/" + a.getId() + "/dashboard/alerts/MEMBERS_SUSPENDED/dismiss"));
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = om.readTree(r.getResponse().getContentAsString());
        assertThat(body.path("key").asText()).isEqualTo("MEMBERS_SUSPENDED");
        assertThat(Instant.parse(body.path("until").asText())).isBetween(now.plus(Duration.ofDays(7)).minusSeconds(60), Instant.now().plus(Duration.ofDays(7)).plusSeconds(60));

        assertThat(alertKeys("dash-a-owner")).doesNotContain("MEMBERS_SUSPENDED").contains("INVITES_EXPIRING");
        assertThat(alertKeys("dash-a-admin")).as("another administrator still sees it").contains("MEMBERS_SUSPENDED");

        OrgMember owner = members.findByOrgIdAndUserIdAndStatusIn(a.getId(), users.findOneByLogin("dash-a-owner").orElseThrow().getId(), List.of(OrgMemberStatus.ACTIVE)).get(0);
        var row = dismissals.find(a.getId(), owner.getId(), "MEMBERS_SUSPENDED").orElseThrow();
        row.setUntilAt(Instant.now().minusSeconds(1));
        dismissals.save(row);
        assertThat(alertKeys("dash-a-owner")).as("seven days later it is back").contains("MEMBERS_SUSPENDED");
    }

    private List<String> alertKeys(String login) throws Exception {
        List<String> keys = new ArrayList<>();
        JsonNode w = widgets(login, a).get("alerts");
        for (JsonNode i : w.path("data").path("items")) keys.add(i.path("key").asText());
        return keys;
    }

    @Test
    void dismissingAnUnknownAlertIsTheGeneric404AndWritesNothing() throws Exception {
        assertGeneric404(call("dash-a-owner", post("/api/orgs/" + a.getId() + "/dashboard/alerts/NOT_AN_ALERT/dismiss")), "unknown key");
        assertGeneric404(call("dash-b-owner", post("/api/orgs/" + a.getId() + "/dashboard/alerts/MEMBERS_SUSPENDED/dismiss")), "another org's owner");
        assertGeneric404(call("dash-a-member", post("/api/orgs/" + a.getId() + "/dashboard/alerts/MEMBERS_SUSPENDED/dismiss")), "no dashboard permission");
        OrgMember owner = members.findByOrgIdAndUserIdAndStatusIn(a.getId(), users.findOneByLogin("dash-a-owner").orElseThrow().getId(), List.of(OrgMemberStatus.ACTIVE)).get(0);
        assertThat(dismissals.find(a.getId(), owner.getId(), "MEMBERS_SUSPENDED")).isEmpty();
    }

    // ---- recent activity ------------------------------------------------------------------------------------------

    private void auditRow(Organization org, String actor, String action, String target, int minutesAgo) {
        OrgAuditEvent e = new OrgAuditEvent();
        e.setOrgId(org.getId());
        e.setActorLogin(actor);
        e.setAction(action);
        e.setTargetType("MEMBER");
        e.setTargetLogin(target);
        e.setDetails("private details about someone@example.com");
        e.setCreatedAt(now.minus(Duration.ofMinutes(minutesAgo)));
        audit.save(e);
    }

    @Test
    void recentActivityIsTheLastTenAuditRowsNewestFirstWithoutTheirFreeText() throws Exception {
        for (int i = 0; i < 12; i++) auditRow(a, "dash-a-owner", "MEMBER_INVITE", "dash-a-c1", 100 - i); // i = 0 is the oldest (100 minutes ago)
        auditRow(b, "dash-b-owner", "MEMBER_INVITE", null, 1); // another organization's row must never appear
        MvcResult r = call("dash-a-owner", get("/api/orgs/" + a.getId() + "/dashboard"));
        assertThat(r.getResponse().getContentAsString()).doesNotContain("private details").doesNotContain("someone@example.com");
        JsonNode items = byKey(om.readTree(r.getResponse().getContentAsString())).get("activity.recent").path("data").path("items");
        assertThat(items).hasSize(10);
        assertThat(items.get(0).path("label").asText()).isEqualTo("invited a member");
        assertThat(items.get(0).path("actorLogin").asText()).isEqualTo("dash-a-owner");
        Instant first = Instant.parse(items.get(0).path("at").asText());
        Instant last = Instant.parse(items.get(9).path("at").asText());
        assertThat(first).isAfter(last);
        for (JsonNode i : items) assertThat(i.path("actorLogin").asText()).isNotEqualTo("dash-b-owner");
    }

    @Test
    void anAuditViewerWithABillingRowFilterSeesBillingRowsOnly() throws Exception {
        auditRow(a, "dash-a-owner", "MEMBER_INVITE", null, 10);
        auditRow(a, "dash-a-owner", "BILLING_PLAN_CHANGE", null, 20);
        auditRow(a, "dash-a-owner", "OPS_TIMESHEET_APPROVE", null, 30);
        customActor(a, "dash-a-finance", row("dashboard.view_org", "ORG"), new String[] { "audit.view", "ORG", "BILLING_OPS" });
        JsonNode items = widgets("dash-a-finance", a).get("activity.recent").path("data").path("items");
        List<String> actions = new ArrayList<>();
        for (JsonNode i : items) actions.add(i.path("action").asText());
        assertThat(actions).containsExactly("BILLING_PLAN_CHANGE", "OPS_TIMESHEET_APPROVE");
    }

    @Test
    void recentActivityIsEmptyWhenThereAreNoRows() throws Exception {
        Organization c = fx.org("dash-e-" + System.nanoTime(), OrgStatus.ACTIVE);
        staff(c, "dash-e-owner", OrgRole.OWNER, now.minus(Duration.ofDays(5)));
        JsonNode w = widgets("dash-e-owner", c).get("activity.recent");
        assertThat(w.path("state").asText()).isEqualTo("empty");
        assertThat(w.path("reason").asText()).isEqualTo("NO_ACTIVITY");
        assertThat(w.has("data")).isFalse();
    }

    // ---- permissions, scope, isolation ----------------------------------------------------------------------------

    @Test
    void aWidgetTheCallerHasNoPermissionForIsAbsentNotGreyed() throws Exception {
        customActor(a, "dash-a-viewer", row("dashboard.view_org", "ORG"));
        assertThat(dashboard("dash-a-viewer", a).path("widgets")).isEmpty();

        customActor(a, "dash-a-hr", row("dashboard.view_org", "ORG"), row("hr.view", "ORG"));
        assertThat(widgets("dash-a-hr", a).keySet()).containsExactly("employees.active");
    }

    @Test
    void anExecutiveViewerSeesOnlyWhatItsPermissionsReachWithNoPeople() throws Exception {
        staff(a, "dash-a-exec", OrgRole.MEMBER, now.minus(Duration.ofDays(5)));
        OrgMember exec = members.findByOrgIdAndUserIdAndStatusIn(a.getId(), users.findOneByLogin("dash-a-exec").orElseThrow().getId(), List.of(OrgMemberStatus.ACTIVE)).get(0);
        for (OrgMemberRole r : memberRoles.findLiveByOrgIdAndMemberId(a.getId(), exec.getId())) { // swap the member role for the executive viewer
            r.setEndsAt(Instant.now());
            r.setPrimary(false);
            memberRoles.saveAndFlush(r);
        }
        exec.setRole(LegacyRoleMirror.toEnum(RoleTemplates.EXECUTIVE_VIEWER).orElseThrow()); // the seat's enum must mirror its primary role
        members.saveAndFlush(exec);
        grant(a, exec, roleRows.findSystemByRoleKey(RoleTemplates.EXECUTIVE_VIEWER).orElseThrow().getId(), true);
        Map<String, JsonNode> w = widgets("dash-a-exec", a);
        assertThat(w.keySet()).containsExactly("applications.active", "interviews.upcoming", "finance.summary", "team.performance", "pipeline.overview", "quick.actions", "alerts", "subscription.summary");
        assertThat(w.get("applications.active").path("state").asText()).isEqualTo("unavailable");
        assertThat(w.get("alerts").path("state").asText()).as("billing.view reaches only ORG_PAST_DUE, which does not hold").isEqualTo("empty");
        assertThat(w.get("subscription.summary").path("data").path("orgStatus").asText()).isEqualTo("ACTIVE");
        assertThat(w.get("subscription.summary").path("data").has("name")).isFalse();
    }

    @Test
    void aTeamScopedActorSeesOnlyTheConsultantsOfTheirTeam() throws Exception {
        OrgGroup team = new OrgGroup();
        team.setOrgId(a.getId());
        team.setName("Team Alpha");
        team.setKind(OrgGroupKind.TEAM);
        team = groups.saveAndFlush(team);
        OrgMember lead = customActor(a, "dash-a-lead", row("dashboard.view_org", "ORG"), row("member.view_summary", "TEAM"));
        lead.setGroupId(team.getId());
        members.saveAndFlush(lead);
        OrgMember c1 = members.findByOrgIdAndUserIdAndStatusIn(a.getId(), users.findOneByLogin("dash-a-c1").orElseThrow().getId(), List.of(OrgMemberStatus.ACTIVE)).get(0);
        c1.setGroupId(team.getId());
        members.saveAndFlush(c1);

        JsonNode ownerView = widgets("dash-a-owner", a).get("consultants.total").path("data");
        assertThat(ownerView.path("value").asLong()).isEqualTo(2);
        JsonNode leadView = widgets("dash-a-lead", a).get("consultants.total").path("data");
        assertThat(leadView.path("value").asLong()).as("only c1 is in the lead's team").isEqualTo(1);
        assertThat(leadView.path("counts").path("invited").asLong()).isEqualTo(0);
        assertThat(leadView.path("counts").path("suspended").asLong()).isEqualTo(0);
    }

    @Test
    void anotherOrganizationNeverLeaksIn() throws Exception {
        JsonNode d = widgets("dash-b-owner", b).get("employees.active").path("data");
        assertThat(d.path("value").asLong()).as("B has one active staff member").isEqualTo(1);
        assertThat(widgets("dash-b-owner", b).get("consultants.total").path("state").asText()).isEqualTo("empty");
    }

    @Test
    void everyoneWhoMayNotSeeThePageGetsTheGeneric404() throws Exception {
        for (String login : new String[] { "dash-b-owner", "dash-loner", "dash-a-gone", "dash-a-c4", "ghost-login", "dash-a-member", "dash-a-marketer" }) {
            assertGeneric404(call(login, get("/api/orgs/" + a.getId() + "/dashboard")), login);
        }
        assertGeneric404(call("dash-a-owner", get("/api/orgs/999999999/dashboard")), "an organization that does not exist");
    }

    @Test
    void theRouteIsA404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        flags(true, false);
        assertGeneric404(call("dash-a-owner", get("/api/orgs/" + a.getId() + "/dashboard")), "roles flag off");
        flags(false, true);
        assertGeneric404(call("dash-a-owner", get("/api/orgs/" + a.getId() + "/dashboard")), "master flag off");
    }

    // ---- failure isolation ----------------------------------------------------------------------------------------

    @Test
    void oneFailingProviderIsAnErrorWidgetAndTheRestOfThePageStillWorks() throws Exception {
        MvcResult r = call("dash-a-owner", get("/api/orgs/" + a.getId() + "/dashboard"));
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(r.getResponse().getContentAsString()).doesNotContain("secret internal detail");
        Map<String, JsonNode> w = byKey(om.readTree(r.getResponse().getContentAsString()));
        assertThat(w.get("test.boom").path("state").asText()).isEqualTo("error");
        assertThat(w.get("test.boom").path("reason").asText()).isEqualTo("PROVIDER_FAILED");
        assertThat(w.get("test.boom").has("data")).isFalse();
        assertThat(w.get("consultants.total").path("state").asText()).isEqualTo("ok");
        assertThat(w.get("employees.active").path("state").asText()).isEqualTo("ok");
    }
}
