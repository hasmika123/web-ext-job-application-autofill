package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.service.dto.ent.MeTenantDTO;
import com.dossier.api.service.ent.WorkspaceService.NavPrefs;
import com.dossier.api.service.ent.WorkspaceService.RoleWorkspace;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.org.OrgMembership;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * Navigation derived from real permissions (X2.2): the member's roles pick the candidate workspaces, the evaluator
 * ({@code AuthorizationService}) decides each page, the modules gate the rest, and the primary role chooses where they land.
 * Memberships are built from the real {@link RoleTemplates}, so a template change that breaks a role's menu fails here.
 */
class WorkspaceServiceTest {

    private static final Long ORG = 7L;
    private static final WorkspaceDefinitions DEFS = new WorkspaceDefinitions();
    private static final AuthorizationService AUTHZ = new AuthorizationService(null, null, null, List.<com.dossier.api.service.ent.authz.AuthzStep>of());
    private static final WorkspaceService SERVICE = new WorkspaceService(DEFS, AUTHZ, new ObjectMapper());
    private static final TenantContext TENANT = TenantContext.tenant(ORG, null, "acme.localhost");

    private static final Map<String, Boolean> ALL_ON = modules(true);
    private static final Map<String, Boolean> ALL_OFF = modules(false);

    private static Map<String, Boolean> modules(boolean on) {
        Map<String, Boolean> m = new LinkedHashMap<>();
        for (TenantModule t : TenantModule.values()) m.put(t.wire(), on);
        return m;
    }

    /** A membership holding the union of these templates (the widest scope wins), the first being primary. */
    private static OrgMembership member(String... templates) {
        Map<String, PermissionScope> grants = new LinkedHashMap<>();
        List<OrgMembership.RoleRef> refs = new ArrayList<>();
        for (int i = 0; i < templates.length; i++) {
            RoleTemplates.Template t = RoleTemplates.find(templates[i]).orElseThrow();
            t.grants().forEach(g -> grants.merge(g.key(), g.scope(), PermissionScope::widest));
            refs.add(new OrgMembership.RoleRef((long) i + 1, t.key(), t.name(), i == 0));
        }
        return new OrgMembership(ORG, 11L, 21L, "u", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, refs, grants);
    }

    private static List<RoleWorkspace> roles(String... templates) {
        List<RoleWorkspace> out = new ArrayList<>();
        for (int i = 0; i < templates.length; i++) out.add(new RoleWorkspace(templates[i], i == 0, RoleTemplates.find(templates[i]).orElseThrow().workspaceKey()));
        return out;
    }

    private static WorkspaceService.Result compute(Map<String, Boolean> modules, NavPrefs prefs, String landingPref, String... templates) {
        return SERVICE.compute(member(templates), roles(templates), modules, TENANT, ORG, prefs, landingPref);
    }

    private static WorkspaceService.Result compute(Map<String, Boolean> modules, String... templates) {
        return compute(modules, NavPrefs.NONE, null, templates);
    }

    private static List<String> navKeys(WorkspaceService.Result r, String slug) {
        return r.workspaces().stream().filter(w -> w.key().equals(slug)).findFirst().orElseThrow().nav().stream().map(MeTenantDTO.NavItem::key).toList();
    }

    private static List<String> slugs(WorkspaceService.Result r) {
        return r.workspaces().stream().map(MeTenantDTO.Workspace::key).toList();
    }

    @Test
    void anOwnerSeesEveryAdminPageTheirRoleAndModulesAllow() {
        WorkspaceService.Result all = compute(ALL_ON, "OWNER");
        assertThat(slugs(all)).containsExactly("admin");
        assertThat(navKeys(all, "admin")).containsExactly(
            "home", "employees", "invitations", "teams", "departments", "roles", "consultants", "resumes", "assignments", "jobs", "applications", "interviews", "clients",
            "placements", "subscription", "licenses", "billing", "usage", "hr", "finance", "reports", "branding", "domains", "integrations", "audit", "settings"
        );
        assertThat(all.landingKey()).isEqualTo("ADMIN");
        assertThat(all.landingHome()).isEqualTo("/w/admin");
    }

    @Test
    void withTheModulesOffTheAdminMenuLosesExactlyTheModulePages() {
        WorkspaceService.Result off = compute(ALL_OFF, "ORG_ADMIN");
        assertThat(navKeys(off, "admin")).containsExactly(
            "home", "employees", "invitations", "teams", "departments", "assignments", "applications", "interviews", "placements", "reports", "branding", "audit", "settings"
        );
        Map<String, Boolean> rolesAndDomains = new LinkedHashMap<>(ALL_OFF);
        rolesAndDomains.put("roles", true);
        rolesAndDomains.put("domains", true);
        assertThat(navKeys(compute(rolesAndDomains, "ORG_ADMIN"), "admin")).contains("roles", "domains").doesNotContain("billing", "consultants");
    }

    @Test
    void aMarketingSpecialistHasOnlyTheMarketingWorkspaceAndNothingOfAdministration() {
        WorkspaceService.Result r = compute(ALL_ON, "MARKETING_SPECIALIST");
        assertThat(slugs(r)).containsExactly("marketing");
        assertThat(navKeys(r, "marketing")).containsExactly(
            "home", "talent", "resumes", "jobs", "matches", "opportunities", "submissions", "applications", "interviews", "followups", "tasks", "activity", "performance"
        );
        assertThat(r.landingHome()).isEqualTo("/w/marketing");
        // the module is part of the home page: with marketing off she has no workspace at all, and nothing leaks in instead
        WorkspaceService.Result off = compute(ALL_OFF, "MARKETING_SPECIALIST");
        assertThat(off.workspaces()).isEmpty();
        assertThat(off.landingKey()).isNull();
        assertThat(off.landingHome()).isNull();
    }

    @Test
    void aConsultantSeesOnlyTheirOwnPagesAndNoOrganizationWidePage() {
        WorkspaceService.Result r = compute(ALL_ON, "CONSULTANT");
        assertThat(slugs(r)).containsExactly("consultant");
        assertThat(navKeys(r, "consultant")).containsExactly(
            "home", "profile", "resumes", "matches", "opportunities", "applications", "interviews", "interview-prep", "offers", "placements", "features", "notifications", "settings"
        );
        assertThat(r.landingHome()).isEqualTo("/w/consultant");
    }

    @Test
    void aFinanceSpecialistGetsFinancePagesByModule() {
        assertThat(navKeys(compute(ALL_ON, "FINANCE_SPECIALIST"), "finance"))
            .containsExactly("home", "subscriptions", "billing", "invoices", "placements", "timesheets", "approvals", "payments", "reports");
        Map<String, Boolean> billingOnly = new LinkedHashMap<>(ALL_OFF);
        billingOnly.put("billing", true);
        assertThat(navKeys(compute(billingOnly, "FINANCE_SPECIALIST"), "finance")).containsExactly("home", "subscriptions", "billing", "invoices", "reports");
        assertThat(navKeys(compute(ALL_OFF, "FINANCE_SPECIALIST"), "finance")).containsExactly("home", "reports");
    }

    @Test
    void everyOtherTemplateOpensItsOwnWorkspaceOnly() {
        assertThat(slugs(compute(ALL_ON, "MARKETING_MANAGER"))).containsExactly("marketing-mgmt");
        assertThat(slugs(compute(ALL_ON, "HR_SPECIALIST"))).containsExactly("hr");
        assertThat(slugs(compute(ALL_ON, "TALENT_ACQUISITION"))).containsExactly("hr");
        assertThat(slugs(compute(ALL_ON, "ACCOUNT_MANAGER"))).containsExactly("accounts");
        assertThat(navKeys(compute(ALL_ON, "EXECUTIVE_VIEWER"), "exec")).containsExactly("home", "reports");
        // the school templates have no tenant-host workspace in this release
        assertThat(compute(ALL_ON, "STAFF").workspaces()).isEmpty();
        assertThat(compute(ALL_ON, "MEMBER").workspaces()).isEmpty();
    }

    @Test
    void anAdminDoesNotGetTheHrWorkspaceJustBecauseTheyHoldHrView() {
        assertThat(member("ORG_ADMIN").canKey("hr.view")).isTrue();
        assertThat(slugs(compute(ALL_ON, "ORG_ADMIN"))).containsExactly("admin");
    }

    @Test
    void severalRolesGiveTheUnionAndTheFirstRoleChoosesTheLanding() {
        // Sarah: Org Admin and Marketing Manager (the E2E-B member)
        WorkspaceService.Result sarah = compute(ALL_ON, "ORG_ADMIN", "MARKETING_MANAGER");
        assertThat(slugs(sarah)).containsExactly("admin", "marketing-mgmt");
        assertThat(sarah.landingHome()).isEqualTo("/w/admin");
        assertThat(sarah.workspaces().get(0).roleKeys()).containsExactly("ORG_ADMIN");
        assertThat(sarah.workspaces().get(1).roleKeys()).containsExactly("MARKETING_MANAGER");
        // the other way round the primary role is the manager role, so she lands in marketing management
        WorkspaceService.Result flipped = compute(ALL_ON, "MARKETING_MANAGER", "ORG_ADMIN");
        assertThat(slugs(flipped)).containsExactly("admin", "marketing-mgmt"); // display order is the definitions' order, not the roles'
        assertThat(flipped.landingHome()).isEqualTo("/w/marketing-mgmt");
        // the union of permissions reaches the menu: a manager who is also finance sees the finance pages
        assertThat(navKeys(compute(ALL_ON, "MARKETING_MANAGER", "FINANCE_SPECIALIST"), "finance")).contains("billing", "payments");
    }

    @Test
    void aSavedLandingPreferenceWinsOnlyWhileItIsStillAllowed() {
        assertThat(compute(ALL_ON, NavPrefs.NONE, "MARKETING_MGMT", "ORG_ADMIN", "MARKETING_MANAGER").landingHome()).isEqualTo("/w/marketing-mgmt");
        assertThat(compute(ALL_ON, NavPrefs.NONE, "HR", "ORG_ADMIN", "MARKETING_MANAGER").landingHome()).as("a workspace they may not open").isEqualTo("/w/admin");
        assertThat(compute(ALL_ON, NavPrefs.NONE, "NOT_A_WORKSPACE", "ORG_ADMIN").landingHome()).isEqualTo("/w/admin");
        assertThat(compute(ALL_ON, NavPrefs.NONE, "MARKETING", "ORG_ADMIN").landingHome()).as("a workspace of a role they do not hold").isEqualTo("/w/admin");
    }

    @Test
    void organizationNavPreferencesHideAndReorderButNeverAddOrHideHome() {
        NavPrefs prefs = SERVICE.parsePrefs("{\"hidden\":[\"reports\",\"home\",\"finance\",\"nonsense\"],\"order\":[\"settings\",\"admin.audit\",\"payments\"],\"greeting\":false}");
        assertThat(prefs.hidden()).containsExactlyInAnyOrder("reports", "home", "finance");
        assertThat(prefs.order()).containsExactly("settings", "admin.audit", "payments");
        assertThat(prefs.greeting()).isFalse();
        List<String> keys = navKeys(compute(ALL_ON, prefs, null, "ORG_ADMIN"), "admin");
        assertThat(keys.get(0)).isEqualTo("home");
        assertThat(keys.subList(1, 3)).containsExactly("settings", "audit");
        assertThat(keys).doesNotContain("reports", "finance").contains("hr", "billing");
        // a page the member may not open is not added by a preference
        assertThat(navKeys(compute(ALL_ON, SERVICE.parsePrefs("{\"order\":[\"billing\"]}"), null, "EXECUTIVE_VIEWER"), "exec")).containsExactly("home", "reports");
        // "finance" in the admin workspace is hidden, in the finance workspace it is not even a page: qualified keys name one workspace
        assertThat(navKeys(compute(ALL_ON, SERVICE.parsePrefs("{\"hidden\":[\"admin.billing\"]}"), null, "ORG_ADMIN", "FINANCE_SPECIALIST"), "finance")).contains("billing");
    }

    @Test
    void malformedPreferencesAreIgnoredNotTrusted() {
        for (String bad : new String[] { null, "", "not json", "[]", "{\"hidden\":\"reports\"}", "{\"hidden\":[1,2]}" }) {
            NavPrefs p = SERVICE.parsePrefs(bad);
            assertThat(p.hidden()).as(bad).isEmpty();
            assertThat(p.greeting()).isTrue();
        }
        assertThat(SERVICE.parsePrefs("{\"greeting\":\"no\"}").greeting()).isTrue();
    }

    @Test
    void theBottomTabsAreTheDocumentedOnesThatSurvivedFiltering() {
        MeTenantDTO.Workspace admin = compute(ALL_ON, "ORG_ADMIN").workspaces().get(0);
        assertThat(admin.bottomTabs()).containsExactly("home", "employees", "consultants", "billing");
        MeTenantDTO.Workspace noBilling = compute(ALL_OFF, "ORG_ADMIN").workspaces().get(0);
        assertThat(noBilling.bottomTabs()).containsExactly("home", "employees");
    }

    @Test
    void aMemberOfAnotherOrganizationGetsNothingFromAnAuthorizationStepThatSeesTheWrongTenant() {
        // the evaluator's first step: the host is organization 99 but the membership is for organization 7 -> every page refused
        TenantContext other = TenantContext.tenant(99L, null, "beta.localhost");
        WorkspaceService.Result r = SERVICE.compute(member("OWNER"), roles("OWNER"), ALL_ON, other, ORG, NavPrefs.NONE, null);
        assertThat(r.workspaces()).isEmpty();
        // and the same for a token that is for another tenant
        WorkspaceService.Result t = SERVICE.compute(member("OWNER"), roles("OWNER"), ALL_ON, TENANT, 99L, NavPrefs.NONE, null);
        assertThat(t.workspaces()).isEmpty();
    }

    @Test
    void theMenuNamesPagesNotPermissions() {
        String json = new ObjectMapper().valueToTree(compute(ALL_ON, "OWNER").workspaces()).toString();
        assertThat(json).doesNotContain("needs").doesNotContain("members.invite").doesNotContain("module");
        assertThat(compute(ALL_ON, "OWNER").workspaces().stream().flatMap(w -> w.nav().stream()).map(MeTenantDTO.NavItem::href).collect(Collectors.toSet())).allMatch(h -> h.startsWith("/w/"));
    }
}
