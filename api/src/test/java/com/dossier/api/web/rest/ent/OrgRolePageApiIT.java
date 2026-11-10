package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.authz.EntPermissions;
import com.dossier.api.service.org.OrgAuditAsserts;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.time.Instant;
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
 * X4.1: what the Roles and Permissions page needs on top of the role writes: the permissions catalog with per-key {@code grantable}
 * flags computed against the caller's ceiling, the diff against the template, the change history, and the resync, with If-Match,
 * the generic 404 for outsiders and one audit row per real change.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgRolePageApiIT {

    private static final String WHO = "role-page-api-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgRoleRepository roleRepo;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private OrgRoleService roleService;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private EntityManager em;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private OrgMember aMember;
    private OrgMember aHr;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        a = fx.org("rp-a-" + System.nanoTime(), OrgStatus.ACTIVE);
        b = fx.org("rp-b-" + System.nanoTime(), OrgStatus.ACTIVE);
        OrgMember aOwner = fx.active(a, "rp-a-owner", OrgRole.OWNER);
        OrgMember aAdmin = fx.active(a, "rp-a-admin", OrgRole.ADMIN);
        aMember = fx.active(a, "rp-a-member", OrgRole.MEMBER);
        aHr = fx.active(a, "rp-a-hr", OrgRole.STAFF);
        OrgMember bOwner = fx.active(b, "rp-b-owner", OrgRole.OWNER);
        for (OrgMember m : List.of(aOwner, aAdmin, aMember, aHr, bOwner)) roleService.syncFromLegacy(m);
        flags(true, true);
    }

    @AfterEach
    void clean() {
        for (AppSetting s : rows.findAll()) if (WHO.equals(s.getUpdatedBy())) rows.delete(s);
        cache.invalidate();
    }

    private void flags(boolean master, boolean roles) {
        for (AppSetting s : rows.findAll()) if (WHO.equals(s.getUpdatedBy())) rows.delete(s);
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":" + master + "}", WHO, Instant.now()));
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":" + roles + "}", WHO, Instant.now()));
        cache.invalidate();
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------

    private MvcResult call(String login, MockHttpServletRequestBuilder req, String ifMatch) throws Exception {
        req.with(user(login)).contentType(MediaType.APPLICATION_JSON);
        if (ifMatch != null) req.header("If-Match", ifMatch);
        return mockMvc.perform(req).andReturn();
    }

    private MvcResult call(String login, MockHttpServletRequestBuilder req) throws Exception {
        return call(login, req, null);
    }

    private JsonNode body(MvcResult r) throws Exception {
        return om.readTree(r.getResponse().getContentAsString());
    }

    private void assertStatus(MvcResult r, int status) throws Exception {
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(status);
    }

    private void assertCode(MvcResult r, int status, String code) throws Exception {
        assertStatus(r, status);
        assertThat(r.getResponse().getContentAsString()).as("code").contains("\"code\":\"" + code + "\"");
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        assertThat(r.getResponse().getStatus()).as(what + " -> " + r.getResponse().getContentAsString()).isEqualTo(404);
        String text = r.getResponse().getContentAsString().toLowerCase().replaceAll("\"(instance|path)\":\"[^\"]*\"", "");
        assertThat(text).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("ceiling").doesNotContain("denied");
    }

    private static String roles(Organization o) {
        return "/api/orgs/" + o.getId() + "/roles";
    }

    private static String catalog(Organization o) {
        return "/api/orgs/" + o.getId() + "/permissions";
    }

    private Long template(String key) {
        return roleRepo.findSystemByRoleKey(key).orElseThrow().getId();
    }

    private JsonNode createRole(String login, String json) throws Exception {
        MvcResult r = call(login, post(roles(a)).content(json));
        assertStatus(r, 201);
        return body(r);
    }

    private static String grid(String... keyScope) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < keyScope.length; i += 2) {
            if (i > 0) sb.append(',');
            sb.append("{\"key\":\"").append(keyScope[i]).append("\",\"scope\":\"").append(keyScope[i + 1]).append("\"}");
        }
        return sb.append(']').toString();
    }

    private long auditCount() {
        em.flush();
        return audit.countByOrgId(a.getId());
    }

    private OrgAuditEvent newestAudit() {
        em.flush();
        return OrgAuditAsserts.rows(audit, a.getId()).get(0);
    }

    private static JsonNode entry(JsonNode catalog, String key) {
        for (JsonNode c : catalog.path("categories")) for (JsonNode p : c.path("permissions")) if (key.equals(p.path("key").asText())) return p;
        return null;
    }

    private static JsonNode scope(JsonNode entry, String scope) {
        for (JsonNode s : entry.path("scopes")) if (scope.equals(s.path("scope").asText())) return s;
        return null;
    }

    // ---- the catalog --------------------------------------------------------------------------------------------------

    @Test
    void theCatalogListsEveryRegisteredKeyInTheFiveBoardCategories() throws Exception {
        MvcResult r = call("rp-a-owner", get(catalog(a)));
        assertStatus(r, 200);
        JsonNode c = body(r);
        assertThat(c.path("canManage").asBoolean()).isTrue();
        assertThat(c.path("totalKeys").asInt()).isEqualTo(EntPermissions.all().size());
        assertThat(c.path("categories")).extracting(n -> n.path("label").asText()).containsExactly("Core Platform", "Recruiting", "Consultants", "Finance", "Administration");
        int keys = 0;
        int sets = 0;
        for (JsonNode cat : c.path("categories")) {
            keys += cat.path("permissions").size();
            sets += cat.path("permissionSets").asInt();
            assertThat(cat.path("keyCount").asInt()).isEqualTo(cat.path("permissions").size());
        }
        assertThat(keys).isEqualTo(EntPermissions.all().size());
        assertThat(sets).as("permission sets = families, each in exactly one category").isEqualTo(c.path("permissionSets").asInt());
        JsonNode close = entry(c, "org.close");
        assertThat(close.path("dangerous").asBoolean()).isTrue();
        assertThat(close.path("description").asText()).isNotBlank();
        assertThat(close.path("grantable").asBoolean()).as("the Owner may grant everything").isTrue();
        assertThat(entry(c, "resumes.manage").path("scopes")).as("a consultant's own work is OWN only").extracting(s -> s.path("scope").asText()).containsExactly("OWN");
        assertThat(entry(c, "member.act_for").path("scopes")).extracting(s -> s.path("scope").asText()).as("acting for others is never OWN").doesNotContain("OWN");
    }

    @Test
    void anOrgAdminSeesCloseAndTransferAsOwnerOnlyAndEverythingElseGrantable() throws Exception {
        JsonNode c = body(call("rp-a-admin", get(catalog(a))));
        assertThat(c.path("canManage").asBoolean()).isTrue();
        for (String key : new String[] { "org.close", "org.transfer_ownership" }) {
            assertThat(entry(c, key).path("grantable").asBoolean()).as(key).isFalse();
            assertThat(entry(c, key).path("reason").asText()).as(key).isEqualTo("OWNER_ONLY");
        }
        assertThat(entry(c, "assignments.manage").path("grantable").asBoolean()).isTrue();
        assertThat(scope(entry(c, "assignments.manage"), "TEAM").path("grantable").asBoolean()).isTrue();
        assertThat(scope(entry(c, "approvals.decide"), "TEAM").path("grantable").asBoolean()).as("a marketing key is within an admin's reach now").isTrue();
        JsonNode setter = scope(entry(c, "members.role.set"), "ORG");
        assertThat(setter.path("grantable").asBoolean()).isTrue();
        assertThat(setter.path("ceilingRoleKey").asText()).as("the editor must send the narrowing the admin holds").isEqualTo("BELOW_ADMIN");
        // what the catalog says is grantable is what the API accepts: a role built from the advertised attribute is created
        assertStatus(call("rp-a-admin", post(roles(a)).content("{\"name\":\"Setter\",\"permissions\":[{\"key\":\"members.role.set\",\"scope\":\"ORG\",\"ceilingRoleKey\":\"BELOW_ADMIN\"}]}")), 201);
    }

    @Test
    void aCallerWhoCannotManageRolesSeesNothingGrantable() throws Exception {
        // the HR specialist holds hr.* and members.invite but not roles.manage
        MvcResult assign = call("rp-a-owner", put("/api/orgs/" + a.getId() + "/members/" + aHr.getId() + "/roles").content("{\"roleIds\":[" + template("HR_SPECIALIST") + "]}"));
        assertStatus(assign, 200);
        JsonNode c = body(call("rp-a-hr", get(catalog(a))));
        assertThat(c.path("canManage").asBoolean()).isFalse();
        for (JsonNode cat : c.path("categories")) {
            for (JsonNode p : cat.path("permissions")) {
                assertThat(p.path("grantable").asBoolean()).as(p.path("key").asText()).isFalse();
                assertThat(p.path("reason").asText()).isEqualTo("NO_PERMISSION");
                for (JsonNode s : p.path("scopes")) assertThat(s.path("grantable").asBoolean()).isFalse();
            }
        }
        // a plain member reads it too, with the same answer
        assertThat(body(call("rp-a-member", get(catalog(a)))).path("canManage").asBoolean()).isFalse();
    }

    @Test
    void theCatalogIsTheGenericNotFoundForOutsidersAndWhenTheFlagIsOff() throws Exception {
        assertGeneric404(call("rp-b-owner", get(catalog(a))), "another org's owner");
        assertGeneric404(call("nobody-at-all", get(catalog(a))), "a stranger");
        flags(true, false);
        assertGeneric404(call("rp-a-owner", get(catalog(a))), "flag off");
    }

    // ---- diff ---------------------------------------------------------------------------------------------------------

    @Test
    void theDiffShowsWhatACloneAddedDroppedAndChanged() throws Exception {
        JsonNode role = createRole("rp-a-owner", "{\"name\":\"Mkt lite\",\"templateKey\":\"MARKETING_SPECIALIST\"}");
        String url = roles(a) + "/" + role.path("id").asLong();
        JsonNode same = body(call("rp-a-member", get(url + "/diff")));
        assertThat(same.path("hasTemplate").asBoolean()).isTrue();
        assertThat(same.path("template").asText()).isEqualTo("MARKETING_SPECIALIST");
        assertThat(same.path("templateName").asText()).isEqualTo("Marketing Specialist");
        assertThat(same.path("matches").asBoolean()).isTrue();

        // drop reports.view, widen pipeline.view to TEAM, add billing.view
        List<JsonNode> keep = new java.util.ArrayList<>();
        for (JsonNode p : role.path("permissions")) {
            String k = p.path("key").asText();
            if (k.equals("reports.view")) continue;
            keep.add(om.createObjectNode().put("key", k).put("scope", k.equals("pipeline.view") ? "TEAM" : p.path("scope").asText()));
        }
        keep.add(om.createObjectNode().put("key", "billing.view").put("scope", "ORG"));
        MvcResult edit = call("rp-a-owner", patch(url).content("{\"permissions\":" + om.writeValueAsString(keep) + "}"), role.path("version").asText());
        assertStatus(edit, 200);
        JsonNode diff = body(call("rp-a-member", get(url + "/diff")));
        assertThat(diff.path("matches").asBoolean()).isFalse();
        assertThat(diff.path("added")).extracting(n -> n.path("key").asText() + "@" + n.path("scope").asText()).containsExactly("billing.view@ORG");
        assertThat(diff.path("removed")).extracting(n -> n.path("key").asText()).containsExactly("reports.view");
        assertThat(diff.path("scopeChanged")).hasSize(1);
        assertThat(diff.path("scopeChanged").get(0).path("key").asText()).isEqualTo("pipeline.view");
        assertThat(diff.path("scopeChanged").get(0).path("from").asText()).isEqualTo("ASSIGNED");
        assertThat(diff.path("scopeChanged").get(0).path("to").asText()).isEqualTo("TEAM");
    }

    @Test
    void aBlankRoleAndASystemRoleHaveNothingToCompareWith() throws Exception {
        JsonNode blank = createRole("rp-a-owner", "{\"name\":\"Blank one\",\"permissions\":" + grid("reports.view", "ORG") + "}");
        JsonNode d = body(call("rp-a-owner", get(roles(a) + "/" + blank.path("id").asLong() + "/diff")));
        assertThat(d.path("hasTemplate").asBoolean()).isFalse();
        assertThat(d.path("matches").asBoolean()).isTrue();
        JsonNode sys = body(call("rp-a-owner", get(roles(a) + "/" + template("STAFF") + "/diff")));
        assertThat(sys.path("hasTemplate").asBoolean()).isFalse();
    }

    @Test
    void anotherOrganizationsRoleIsAGeneric404ForTheDiffAndTheHistory() throws Exception {
        JsonNode role = createRole("rp-a-owner", "{\"name\":\"Mine\",\"templateKey\":\"EXECUTIVE_VIEWER\"}");
        long id = role.path("id").asLong();
        assertGeneric404(call("rp-b-owner", get("/api/orgs/" + b.getId() + "/roles/" + id + "/diff")), "diff of A's role from B");
        assertGeneric404(call("rp-b-owner", get("/api/orgs/" + b.getId() + "/roles/" + id + "/history")), "history of A's role from B");
        assertGeneric404(call("rp-b-owner", get("/api/orgs/" + a.getId() + "/roles/" + id + "/diff")), "diff of A's role with A's id");
        assertGeneric404(call("rp-b-owner", post("/api/orgs/" + b.getId() + "/roles/" + id + "/resync"), role.path("version").asText()), "resync of A's role from B");
    }

    // ---- history ------------------------------------------------------------------------------------------------------

    @Test
    void theHistoryOfARoleListsItsChangesNewestFirstWithTheActorAndTheDiff() throws Exception {
        JsonNode role = createRole("rp-a-owner", "{\"name\":\"Lead\",\"permissions\":" + grid("assignments.manage", "TEAM") + "}");
        String url = roles(a) + "/" + role.path("id").asLong();
        MvcResult widened = call("rp-a-admin", patch(url).content("{\"permissions\":" + grid("assignments.manage", "ORG", "reports.view", "ORG") + "}"), role.path("version").asText());
        assertStatus(widened, 200);

        MvcResult r = call("rp-a-owner", get(url + "/history"));
        assertStatus(r, 200);
        JsonNode h = body(r);
        assertThat(h).hasSize(2);
        assertThat(h.get(0).path("action").asText()).isEqualTo("ROLE_UPDATE");
        assertThat(h.get(0).path("risk").asText()).isEqualTo("HIGH");
        assertThat(h.get(0).path("actor").asText()).isEqualTo("rp-a-admin");
        assertThat(h.get(0).path("roleName").asText()).isEqualTo("Lead");
        assertThat(h.get(0).path("details").path("added").toString()).contains("reports.view@ORG");
        assertThat(h.get(0).path("details").path("scopeChanged").toString()).contains("assignments.manage");
        assertThat(h.get(1).path("action").asText()).isEqualTo("ROLE_CREATE");
        assertThat(h.get(1).path("actor").asText()).isEqualTo("rp-a-owner");
        assertThat(h.get(0).path("at").isTextual() || h.get(0).path("at").isNumber()).isTrue();
    }

    @Test
    void theOrganizationWideHistoryIncludesAssignmentsAndDeletes() throws Exception {
        JsonNode role = createRole("rp-a-owner", "{\"name\":\"Viewer copy\",\"templateKey\":\"EXECUTIVE_VIEWER\"}");
        long id = role.path("id").asLong();
        assertStatus(call("rp-a-owner", put("/api/orgs/" + a.getId() + "/members/" + aMember.getId() + "/roles").content("{\"roleIds\":[" + id + "]}")), 200);
        assertStatus(call("rp-a-owner", put("/api/orgs/" + a.getId() + "/members/" + aMember.getId() + "/roles").content("{\"roleIds\":[" + template("MEMBER") + "]}")), 200);
        MvcResult del = call("rp-a-owner", org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(roles(a) + "/" + id), role.path("version").asText());
        assertStatus(del, 204);
        JsonNode h = body(call("rp-a-owner", get(roles(a) + "/history?limit=10")));
        assertThat(h).extracting(n -> n.path("action").asText()).containsExactly("ROLE_DELETE", "ROLE_ASSIGN", "ROLE_ASSIGN", "ROLE_CREATE");
        assertThat(h.get(0).path("roleName").asText()).as("a deleted role keeps its name in the trail").isEqualTo("Viewer copy");
        assertThat(body(call("rp-a-owner", get(roles(a) + "/history?limit=2")))).hasSize(2);
        // B never sees A's rows
        assertThat(body(call("rp-b-owner", get("/api/orgs/" + b.getId() + "/roles/history")))).isEmpty();
    }

    @Test
    void theHistoryNeedsRolesManage() throws Exception {
        JsonNode role = createRole("rp-a-owner", "{\"name\":\"Secret\",\"templateKey\":\"EXECUTIVE_VIEWER\"}");
        assertGeneric404(call("rp-a-member", get(roles(a) + "/" + role.path("id").asLong() + "/history")), "a plain member");
        assertGeneric404(call("rp-a-member", get(roles(a) + "/history")), "a plain member, org wide");
        assertGeneric404(call("rp-a-hr", get(roles(a) + "/history")), "staff");
    }

    // ---- resync -------------------------------------------------------------------------------------------------------

    @Test
    void resyncRestoresTheTemplateRowsWithOneHighAuditRowAndNeedsTheVersion() throws Exception {
        JsonNode role = createRole("rp-a-owner", "{\"name\":\"Exec\",\"templateKey\":\"EXECUTIVE_VIEWER\"}");
        String url = roles(a) + "/" + role.path("id").asLong();
        MvcResult edited = call("rp-a-owner", patch(url).content("{\"permissions\":" + grid("dashboard.view_org", "ORG", "billing.manage", "ORG") + "}"), role.path("version").asText());
        assertStatus(edited, 200);
        String v2 = edited.getResponse().getHeader("ETag");
        long before = auditCount();

        assertCode(call("rp-a-owner", post(url + "/resync")), 428, "PRECONDITION_REQUIRED");
        assertCode(call("rp-a-owner", post(url + "/resync"), "W/\"0000000000000000\""), 412, "PRECONDITION_FAILED");
        assertThat(auditCount()).isEqualTo(before);

        MvcResult r = call("rp-a-owner", post(url + "/resync"), v2);
        assertStatus(r, 200);
        JsonNode restored = body(r);
        List<String> keys = new java.util.ArrayList<>();
        restored.path("permissions").forEach(p -> keys.add(p.path("key").asText()));
        assertThat(keys).contains("dashboard.view_org", "reports.view", "pipeline.view", "billing.view").doesNotContain("billing.manage");
        assertThat(auditCount()).isEqualTo(before + 1);
        OrgAuditEvent ev = newestAudit();
        assertThat(ev.getAction()).isEqualTo("ROLE_RESYNC");
        assertThat(ev.getRisk()).isEqualTo("HIGH");
        assertThat(ev.getDetails()).contains("billing.manage").contains("EXECUTIVE_VIEWER");
        assertThat(body(call("rp-a-owner", get(url + "/diff"))).path("matches").asBoolean()).isTrue();

        // already identical: no write, no audit row
        MvcResult again = call("rp-a-owner", post(url + "/resync"), r.getResponse().getHeader("ETag"));
        assertStatus(again, 200);
        assertThat(auditCount()).isEqualTo(before + 1);
        assertThat(body(call("rp-a-owner", get(url + "/history"))).get(0).path("action").asText()).isEqualTo("ROLE_RESYNC");
    }

    @Test
    void resyncRefusesBlankRolesSystemRolesAndRolesBeyondTheCallersCeiling() throws Exception {
        JsonNode blank = createRole("rp-a-owner", "{\"name\":\"Blank\",\"permissions\":" + grid("reports.view", "ORG") + "}");
        assertCode(call("rp-a-owner", post(roles(a) + "/" + blank.path("id").asLong() + "/resync"), blank.path("version").asText()), 422, "ORG_INVALID");
        assertCode(call("rp-a-owner", post(roles(a) + "/" + template("STAFF") + "/resync"), "W/\"x\""), 409, "ROLE_SYSTEM");
        // a role the Owner made with org.close: an admin may not rewrite it
        JsonNode closer = createRole("rp-a-owner", "{\"name\":\"Closer\",\"templateKey\":\"EXECUTIVE_VIEWER\",\"permissions\":" + grid("dashboard.view_org", "ORG", "org.close", "ORG") + "}");
        long before = auditCount();
        assertCode(call("rp-a-admin", post(roles(a) + "/" + closer.path("id").asLong() + "/resync"), closer.path("version").asText()), 422, "ROLE_CEILING");
        assertThat(auditCount()).isEqualTo(before);
        // a plain member cannot resync anything, and learns nothing
        assertGeneric404(call("rp-a-member", post(roles(a) + "/" + closer.path("id").asLong() + "/resync"), closer.path("version").asText()), "member");
    }

    // ---- the board data -----------------------------------------------------------------------------------------------

    @Test
    void theOverviewCountsPermissionSetsAsFamiliesAndReportsHonestNumbers() throws Exception {
        JsonNode o = body(call("rp-a-owner", get(roles(a) + "/overview")));
        assertThat(o.path("permissionSetCount").asInt()).isGreaterThan(15);
        int sets = 0;
        int keys = 0;
        for (JsonNode s : o.path("permissionOverview")) {
            sets += s.path("permissionSets").asInt();
            keys += s.path("keys").asInt();
        }
        assertThat(sets).isEqualTo(o.path("permissionSetCount").asInt());
        assertThat(keys).isEqualTo(o.path("totalPermissionKeys").asInt()).isEqualTo(EntPermissions.all().size());
        assertThat(o.path("systemRoleCount").asInt()).isEqualTo(12);
        assertThat(o.path("roles").size()).isEqualTo(o.path("totalRoles").asInt());
    }
}
