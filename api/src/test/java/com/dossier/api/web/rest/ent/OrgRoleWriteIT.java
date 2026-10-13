package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
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
 * X1.14 through the real chain: create, edit and delete organization roles and give members their roles, with the ceiling rule,
 * the system-role and last-admin guards, If-Match versions, one audit row per write, the dual write of the legacy enum, the
 * escalation attempts of 42-threat-model.md (T7), cross-tenant and mass-assignment attacks, and the data of the board.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgRoleWriteIT {

    private static final String WHO = "role-write-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgRoleRepository roleRepo;
    @Autowired private OrgRolePermissionRepository permissionRepo;
    @Autowired private OrgMemberRoleRepository memberRoleRepo;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private OrgRoleService roleService;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private EntityManager em;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private OrgMember aOwner;
    private OrgMember aAdmin;
    private OrgMember aMember;
    private OrgMember aMarketer;
    private OrgMember aStaff;
    private OrgMember bOwner;
    private OrgMember bMember;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        a = fx.org("rw-a-" + System.nanoTime(), OrgStatus.ACTIVE);
        b = fx.org("rw-b-" + System.nanoTime(), OrgStatus.ACTIVE);
        aOwner = fx.active(a, "rw-a-owner", OrgRole.OWNER);
        aAdmin = fx.active(a, "rw-a-admin", OrgRole.ADMIN);
        aMember = fx.active(a, "rw-a-member", OrgRole.MEMBER);
        aMarketer = fx.active(a, "rw-a-marketer", OrgRole.MARKETER);
        aStaff = fx.active(a, "rw-a-staff", OrgRole.STAFF);
        bOwner = fx.active(b, "rw-b-owner", OrgRole.OWNER);
        bMember = fx.active(b, "rw-b-member", OrgRole.MEMBER);
        for (OrgMember m : List.of(aOwner, aAdmin, aMember, aMarketer, aStaff, bOwner, bMember)) roleService.syncFromLegacy(m);
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

    private static String roles(Organization o) {
        return "/api/orgs/" + o.getId() + "/roles";
    }

    private static String memberRoles(Organization o, OrgMember m) {
        return "/api/orgs/" + o.getId() + "/members/" + m.getId() + "/roles";
    }

    private Long template(String key) {
        return roleRepo.findSystemByRoleKey(key).orElseThrow().getId();
    }

    private void assertStatus(MvcResult r, int status) throws Exception {
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(status);
    }

    private void assertCode(MvcResult r, int status, String code) throws Exception {
        assertStatus(r, status);
        assertThat(r.getResponse().getContentAsString()).as("code").contains("\"code\":\"" + code + "\"");
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String text = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + text).isEqualTo(404);
        String lower = text.toLowerCase().replaceAll("\"(instance|path)\":\"[^\"]*\"", "");
        assertThat(lower).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("ceiling").doesNotContain("denied");
    }

    /** Creates a role as {@code login} and returns the detail. */
    private JsonNode createRole(String login, Organization o, String json) throws Exception {
        MvcResult r = call(login, post(roles(o)).content(json));
        assertStatus(r, 201);
        return body(r);
    }

    private String etag(MvcResult r) {
        return r.getResponse().getHeader("ETag");
    }

    private long auditCount(Organization o) {
        em.flush();
        return audit.countByOrgId(o.getId());
    }

    private OrgAuditEvent newestAudit(Organization o) {
        em.flush();
        return OrgAuditAsserts.rows(audit, o.getId()).get(0);
    }

    private OrgMember reload(OrgMember m) {
        em.flush();
        em.clear();
        return members.findByOrgIdAndId(m.getOrgId(), m.getId()).orElseThrow();
    }

    private static JsonNode permission(JsonNode role, String key) {
        for (JsonNode p : role.path("permissions")) if (key.equals(p.path("key").asText())) return p;
        return null;
    }

    private static String grid(String... keyScope) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < keyScope.length; i += 2) {
            if (i > 0) sb.append(',');
            sb.append("{\"key\":\"").append(keyScope[i]).append("\",\"scope\":\"").append(keyScope[i + 1]).append("\"}");
        }
        return sb.append(']').toString();
    }

    // ---- create -------------------------------------------------------------------------------------------------------

    @Test
    void theOwnerClonesATemplateIntoAnIndependentOrganizationRole() throws Exception {
        long before = auditCount(a);
        MvcResult r = call("rw-a-owner", post(roles(a)).content("{\"name\":\"Exec copy\",\"templateKey\":\"EXECUTIVE_VIEWER\"}"));
        assertStatus(r, 201);
        JsonNode role = body(r);
        assertThat(etag(r)).startsWith("W/\"").isEqualTo(role.path("version").asText());
        assertThat(role.path("system").asBoolean()).isFalse();
        assertThat(role.path("editable").asBoolean()).isTrue();
        assertThat(role.path("templateKey").asText()).isEqualTo("EXECUTIVE_VIEWER");
        assertThat(role.path("key").asText()).isEqualTo("CUSTOM_EXEC_COPY");
        assertThat(role.path("scopeLabel").asText()).isEqualTo("Custom");
        assertThat(role.path("assignedUsers").asLong()).isZero();
        assertThat(permission(role, "dashboard.view_org").path("scope").asText()).isEqualTo("ORG");
        assertThat(permission(role, "self.leave")).as("every role keeps the self rows").isNotNull();
        assertThat(role.has("orgId")).isFalse();
        OrgRoleDefinition stored = roleRepo.findOwnedByOrgIdAndId(a.getId(), role.path("id").asLong()).orElseThrow();
        assertThat(stored.getOrgId()).isEqualTo(a.getId());

        OrgAuditEvent ev = newestAudit(a);
        assertThat(auditCount(a)).isEqualTo(before + 1);
        assertThat(ev.getAction()).isEqualTo("ROLE_CREATE");
        assertThat(ev.getRisk()).isEqualTo("MEDIUM");
        assertThat(ev.getActorLogin()).isEqualTo("rw-a-owner");

        // independent: the template is untouched, and the new role is listed for the organization
        assertThat(permissionRepo.findForRoles(a.getId(), List.of(template("EXECUTIVE_VIEWER")))).hasSize(RoleTemplates.find("EXECUTIVE_VIEWER").orElseThrow().grants().size());
        assertThat(body(call("rw-a-owner", get(roles(a))))).hasSize(13);
        assertThat(body(call("rw-b-owner", get(roles(b))))).as("another organization never sees it").hasSize(12);
    }

    @Test
    void aBlankRoleAndADuplicateWork() throws Exception {
        JsonNode blank = createRole("rw-a-owner", a, "{\"name\":\"Report reader\",\"permissions\":" + grid("reports.view", "ORG") + "}");
        assertThat(blank.path("templateKey").isNull()).isTrue();
        assertThat(blank.path("permissions")).hasSize(3); // reports.view + the two self rows
        JsonNode copy = createRole("rw-a-owner", a, "{\"name\":\"Report reader 2\",\"sourceRoleId\":" + blank.path("id").asLong() + "}");
        assertThat(copy.path("permissions")).hasSize(3);
        assertThat(copy.path("id").asLong()).isNotEqualTo(blank.path("id").asLong());
    }

    @Test
    void theOwnerTemplateCannotBeCloned() throws Exception {
        assertCode(call("rw-a-owner", post(roles(a)).content("{\"name\":\"Second owner\",\"templateKey\":\"OWNER\"}")), 409, "ROLE_SYSTEM");
        assertCode(call("rw-a-owner", post(roles(a)).content("{\"name\":\"Second owner\",\"sourceRoleId\":" + template("OWNER") + "}")), 409, "ROLE_SYSTEM");
    }

    @Test
    void anOrgAdminCannotCreateARoleWithAnythingTheyDoNotHold() throws Exception {
        long before = auditCount(a);
        // org.close is the Owner's alone
        MvcResult r = call("rw-a-admin", post(roles(a)).content("{\"name\":\"Closer\",\"templateKey\":\"EXECUTIVE_VIEWER\",\"permissions\":" + grid("dashboard.view_org", "ORG", "org.close", "ORG") + "}"));
        assertCode(r, 422, "ROLE_CEILING");
        assertThat(body(r).path("key").asText()).isEqualTo("org.close");
        assertThat(body(r).path("scope").asText()).isEqualTo("ORG");
        // the owner's create is the only one that writes
        JsonNode team = createRole("rw-a-owner", a, "{\"name\":\"Team lead\",\"permissions\":" + grid("assignments.manage", "TEAM") + "}");
        assertThat(team.path("id").asLong()).isPositive();
        assertThat(auditCount(a)).isEqualTo(before + 1); // only the owner's create
    }

    /** Doc 05 section 3 read literally: an Organization Admin holds everything except org.close / org.transfer_ownership. */
    @Test
    void anOrgAdminClonesAndAssignsTheMarketingRolesButNeverCloseTransferOrOwner() throws Exception {
        for (String key : new String[] { "MARKETING_MANAGER", "ACCOUNT_MANAGER", "HR_SPECIALIST", "FINANCE_SPECIALIST" }) {
            JsonNode copy = createRole("rw-a-admin", a, "{\"name\":\"Mine " + key + "\",\"templateKey\":\"" + key + "\"}");
            assertThat(copy.path("templateKey").asText()).isEqualTo(key);
        }
        JsonNode mkt = createRole("rw-a-admin", a, "{\"name\":\"Mkt lead\",\"templateKey\":\"MARKETING_MANAGER\"}");
        long mktId = mkt.path("id").asLong();
        assertStatus(call("rw-a-admin", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + mktId + "]}")), 200);
        // the system template itself is assignable too
        assertStatus(call("rw-a-admin", put(memberRoles(a, aStaff)).content("{\"roleIds\":[" + template("MARKETING_MANAGER") + "]}")), 200);
        // org.close / org.transfer_ownership stay out of reach
        MvcResult close = call("rw-a-admin", patch(roles(a) + "/" + mktId).content("{\"permissions\":" + grid("assignments.manage", "TEAM", "org.close", "ORG") + "}"), mkt.path("version").asText());
        assertCode(close, 422, "ROLE_CEILING");
        assertThat(body(close).path("key").asText()).isEqualTo("org.close");
        assertCode(call("rw-a-admin", post(roles(a)).content("{\"name\":\"Giver\",\"permissions\":" + grid("org.transfer_ownership", "ORG") + "}")), 422, "ROLE_CEILING");
        // the Owner template can neither be cloned nor handed out by an admin
        assertCode(call("rw-a-admin", post(roles(a)).content("{\"name\":\"Second owner\",\"templateKey\":\"OWNER\"}")), 409, "ROLE_SYSTEM");
        assertCode(call("rw-a-admin", put(memberRoles(a, aMarketer)).content("{\"roleIds\":[" + template("OWNER") + "]}")), 422, "ROLE_CEILING");
        // the Owner is the only holder of the two keys
        for (String key : new String[] { "ORG_ADMIN", "MARKETING_MANAGER", "FINANCE_SPECIALIST" }) {
            JsonNode t = body(call("rw-a-owner", get(roles(a) + "/" + template(key))));
            assertThat(permission(t, "org.close")).as(key).isNull();
            assertThat(permission(t, "org.transfer_ownership")).as(key).isNull();
        }
        assertThat(permission(body(call("rw-a-owner", get(roles(a) + "/" + template("OWNER")))), "org.close")).isNotNull();
    }

    @Test
    void aNarrowingAttributeCannotBeLoosenedByAnOrgAdmin() throws Exception {
        String ok = "{\"name\":\"Role setter\",\"permissions\":[{\"key\":\"members.role.set\",\"scope\":\"ORG\",\"ceilingRoleKey\":\"BELOW_ADMIN\"}]}";
        assertStatus(call("rw-a-admin", post(roles(a)).content(ok)), 201);
        // no attribute at all would let the holder touch owners
        assertCode(call("rw-a-admin", post(roles(a)).content("{\"name\":\"Role setter 2\",\"permissions\":" + grid("members.role.set", "ORG") + "}")), 422, "ROLE_CEILING");
        // the owner may
        assertStatus(call("rw-a-owner", post(roles(a)).content("{\"name\":\"Role setter 3\",\"permissions\":" + grid("members.role.set", "ORG") + "}")), 201);
    }

    @Test
    void theAttributesOfAClonedTemplateAreKeptWhenTheGridSaysNothingAboutThem() throws Exception {
        JsonNode copy = createRole("rw-a-owner", a, "{\"name\":\"Admin copy\",\"templateKey\":\"ORG_ADMIN\"}");
        assertThat(permission(copy, "members.role.set").path("ceilingRoleKey").asText()).isEqualTo("BELOW_ADMIN");
        // the editor sends {key, scope} only: the narrowing stays (it is never silently dropped)
        MvcResult r = call("rw-a-owner", patch(roles(a) + "/" + copy.path("id").asLong()).content("{\"permissions\":" + grid("members.role.set", "ORG", "reports.view", "ORG") + "}"), copy.path("version").asText());
        assertStatus(r, 200);
        assertThat(permission(body(r), "members.role.set").path("ceilingRoleKey").asText()).isEqualTo("BELOW_ADMIN");
    }

    // ---- validation ---------------------------------------------------------------------------------------------------

    @Test
    void invalidInputIsA422AndWritesNothing() throws Exception {
        long before = auditCount(a);
        String[] bad = {
            "{}",
            "{\"name\":\"  \"}",
            "{\"name\":\"" + "x".repeat(81) + "\"}",
            "{\"name\":\"<script>\"}",
            "{\"name\":\"Ok\",\"templateKey\":\"NOPE\"}",
            "{\"name\":\"Ok\",\"templateKey\":\"STAFF\",\"sourceRoleId\":1}",
            "{\"name\":\"Ok\",\"permissions\":" + grid("not.a.permission", "ORG") + "}",
            "{\"name\":\"Ok\",\"permissions\":" + grid("reports.view", "GALAXY") + "}",
            "{\"name\":\"Ok\",\"permissions\":" + grid("reports.view", "ORG", "reports.view", "ORG") + "}",
            "{\"name\":\"Ok\",\"permissions\":" + grid("member.act_for", "OWN") + "}",
            "{\"name\":\"Ok\",\"permissions\":" + grid("self.leave", "ORG") + "}",
            "{\"name\":\"Ok\",\"permissions\":[{\"key\":\"reports.view\",\"scope\":\"ORG\",\"ceilingRoleKey\":\"GOD\"}]}",
            "{\"name\":\"Ok\",\"permissions\":[{\"key\":\"audit.view\",\"scope\":\"ORG\",\"rowFilter\":\"ALL_OF_IT\"}]}",
        };
        for (String json : bad) {
            MvcResult r = call("rw-a-owner", post(roles(a)).content(json));
            assertThat(r.getResponse().getStatus()).as(json + " -> " + r.getResponse().getContentAsString()).isIn(409, 422);
            assertThat(r.getResponse().getStatus()).as(json).isNotEqualTo(500);
        }
        assertThat(auditCount(a)).isEqualTo(before);
        assertThat(body(call("rw-a-owner", get(roles(a))))).hasSize(12);
        // a duplicate name (also of a system role) is a 409
        assertCode(call("rw-a-owner", post(roles(a)).content("{\"name\":\"Owner\"}")), 409, "ROLE_NAME_TAKEN");
        createRole("rw-a-owner", a, "{\"name\":\"Twin\"}");
        assertCode(call("rw-a-owner", post(roles(a)).content("{\"name\":\"twin\"}")), 409, "ROLE_NAME_TAKEN");
    }

    // ---- update -------------------------------------------------------------------------------------------------------

    @Test
    void editingNeedsTheCurrentVersionAndEveryRealChangeWritesOneAuditRow() throws Exception {
        MvcResult created = call("rw-a-owner", post(roles(a)).content("{\"name\":\"Lead\",\"permissions\":" + grid("assignments.manage", "TEAM") + "}"));
        JsonNode role = body(created);
        String url = roles(a) + "/" + role.path("id").asLong();
        long before = auditCount(a);

        assertCode(call("rw-a-owner", patch(url).content("{\"name\":\"Lead 2\"}")), 428, "PRECONDITION_REQUIRED");
        MvcResult stale = call("rw-a-owner", patch(url).content("{\"name\":\"Lead 2\"}"), "W/\"0000000000000000\"");
        assertCode(stale, 412, "PRECONDITION_FAILED");
        assertThat(body(stale).path("currentVersion").asText()).isEqualTo(role.path("version").asText());
        assertThat(auditCount(a)).isEqualTo(before);

        // rename only: LOW, one row
        MvcResult renamed = call("rw-a-owner", patch(url).content("{\"name\":\"Lead 2\",\"description\":\"Leads a team\"}"), etag(created));
        assertStatus(renamed, 200);
        assertThat(body(renamed).path("name").asText()).isEqualTo("Lead 2");
        assertThat(etag(renamed)).isNotEqualTo(etag(created));
        assertThat(auditCount(a)).isEqualTo(before + 1);
        assertThat(newestAudit(a).getAction()).isEqualTo("ROLE_UPDATE");
        assertThat(newestAudit(a).getRisk()).isEqualTo("LOW");

        // the old version is now stale
        assertCode(call("rw-a-owner", patch(url).content("{\"name\":\"Lead 3\"}"), etag(created)), 412, "PRECONDITION_FAILED");

        // a change that changes nothing writes nothing
        MvcResult same = call("rw-a-owner", patch(url).content("{\"name\":\"Lead 2\"}"), etag(renamed));
        assertStatus(same, 200);
        assertThat(etag(same)).isEqualTo(etag(renamed));
        assertThat(auditCount(a)).isEqualTo(before + 1);

        // a permission change: HIGH, with the diff
        MvcResult widened = call("rw-a-owner", patch(url).content("{\"permissions\":" + grid("assignments.manage", "ORG", "reports.view", "ORG") + "}"), etag(renamed));
        assertStatus(widened, 200);
        assertThat(permission(body(widened), "assignments.manage").path("scope").asText()).isEqualTo("ORG");
        OrgAuditEvent ev = newestAudit(a);
        assertThat(ev.getRisk()).isEqualTo("HIGH");
        assertThat(ev.getDetails()).contains("scopeChanged").contains("assignments.manage").contains("reports.view@ORG");
        assertThat(auditCount(a)).isEqualTo(before + 2);

        // GET returns the same version the write returned
        MvcResult read = call("rw-a-member", get(url));
        assertStatus(read, 200);
        assertThat(etag(read)).isEqualTo(etag(widened));
    }

    @Test
    void anOrgAdminWidensWhatTheyHoldAtOrgButNeverBeyond() throws Exception {
        JsonNode role = createRole("rw-a-owner", a, "{\"name\":\"Lead\",\"permissions\":" + grid("assignments.manage", "TEAM") + "}");
        String url = roles(a) + "/" + role.path("id").asLong();
        MvcResult ok = call("rw-a-admin", patch(url).content("{\"permissions\":" + grid("assignments.manage", "ORG") + "}"), role.path("version").asText());
        assertStatus(ok, 200);
        assertThat(permission(body(ok), "assignments.manage").path("scope").asText()).isEqualTo("ORG");
        MvcResult beyond = call("rw-a-admin", patch(url).content("{\"permissions\":" + grid("assignments.manage", "ORG", "org.close", "ORG") + "}"), etag(ok));
        assertCode(beyond, 422, "ROLE_CEILING");
        assertThat(body(beyond).path("key").asText()).isEqualTo("org.close");
        // the role is unchanged by the refused call
        assertThat(etag(call("rw-a-admin", get(url)))).isEqualTo(etag(ok));
    }

    @Test
    void aRoleHoldingMoreThanTheEditorHoldsCannotBeEditedOrDeletedByThem() throws Exception {
        JsonNode closer = createRole("rw-a-owner", a, "{\"name\":\"Closer\",\"permissions\":" + grid("org.close", "ORG", "reports.view", "ORG") + "}");
        String url = roles(a) + "/" + closer.path("id").asLong();
        long before = auditCount(a);
        MvcResult rename = call("rw-a-admin", patch(url).content("{\"name\":\"Renamed\"}"), closer.path("version").asText());
        assertCode(rename, 422, "ROLE_CEILING");
        assertThat(body(rename).path("key").asText()).isEqualTo("org.close");
        assertCode(call("rw-a-admin", delete(url), closer.path("version").asText()), 422, "ROLE_CEILING");
        assertThat(auditCount(a)).isEqualTo(before);
        assertStatus(call("rw-a-owner", delete(url), closer.path("version").asText()), 204);
    }

    @Test
    void systemRolesAreImmutable() throws Exception {
        for (String key : new String[] { "OWNER", "ORG_ADMIN", "EXECUTIVE_VIEWER" }) {
            String url = roles(a) + "/" + template(key);
            long before = auditCount(a);
            assertCode(call("rw-a-owner", patch(url).content("{\"name\":\"Mine\",\"permissions\":" + grid("org.close", "ORG") + "}"), "W/\"abc\""), 409, "ROLE_SYSTEM");
            assertCode(call("rw-a-owner", delete(url), "W/\"abc\""), 409, "ROLE_SYSTEM");
            assertThat(auditCount(a)).isEqualTo(before);
        }
        assertThat(body(call("rw-a-owner", get(roles(a) + "/" + template("OWNER")))).path("permissions")).hasSize(RoleTemplates.find("OWNER").orElseThrow().grants().size());
    }

    // ---- delete -------------------------------------------------------------------------------------------------------

    @Test
    void aRoleInUseCannotBeDeletedAndAnUnusedOneCan() throws Exception {
        JsonNode role = createRole("rw-a-owner", a, "{\"name\":\"Temp\",\"templateKey\":\"EXECUTIVE_VIEWER\"}");
        long roleId = role.path("id").asLong();
        String url = roles(a) + "/" + roleId;
        assertStatus(call("rw-a-owner", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + roleId + "],\"primaryRoleId\":" + roleId + "}")), 200);

        long before = auditCount(a);
        assertCode(call("rw-a-owner", delete(url)), 428, "PRECONDITION_REQUIRED");
        MvcResult inUse = call("rw-a-owner", delete(url), body(call("rw-a-owner", get(url))).path("version").asText());
        assertCode(inUse, 409, "ROLE_IN_USE");
        assertThat(body(inUse).path("count").asLong()).isEqualTo(1);
        assertThat(body(call("rw-a-owner", get(url))).path("assignedUsers").asLong()).isEqualTo(1);
        assertThat(auditCount(a)).isEqualTo(before);

        // hand the member another role: the first one is free
        assertStatus(call("rw-a-owner", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + template("MEMBER") + "]}")), 200);
        MvcResult current = call("rw-a-owner", get(url));
        long beforeDelete = auditCount(a);
        assertStatus(call("rw-a-owner", delete(url), etag(current)), 204);
        assertThat(auditCount(a)).isEqualTo(beforeDelete + 1);
        assertThat(newestAudit(a).getAction()).isEqualTo("ROLE_DELETE");
        assertGeneric404(call("rw-a-owner", get(url)), "a deleted role");
        assertThat(roleRepo.findOwnedByOrgIdAndId(a.getId(), roleId)).isEmpty();
    }

    // ---- member roles -------------------------------------------------------------------------------------------------

    @Test
    void anOwnerGivesAMemberTwoRolesAndThePrimaryDecidesTheLegacyMirror() throws Exception {
        Long manager = template("MARKETING_MANAGER");
        Long member = template("MEMBER");
        long before = auditCount(a);
        MvcResult r = call("rw-a-owner", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + member + "," + manager + "],\"primaryRoleId\":" + manager + "}"));
        assertStatus(r, 200);
        JsonNode out = body(r);
        assertThat(out.path("legacyRole").asText()).isEqualTo("MARKETER");
        assertThat(out.path("roles")).hasSize(2);
        assertThat(auditCount(a)).isEqualTo(before + 1);
        OrgAuditEvent ev = newestAudit(a);
        assertThat(ev.getAction()).isEqualTo("ROLE_ASSIGN");
        assertThat(ev.getTargetLogin()).isEqualTo("rw-a-member");
        assertThat(ev.getDetails()).contains("MARKETING_MANAGER").contains("primaryAfter");

        OrgMember seat = reload(aMember);
        assertThat(seat.getRole()).isEqualTo(OrgRole.MARKETER);
        assertThat(seat.getPrimaryRoleId()).isEqualTo(manager);
        var grants = roleService.resolveGrants(a.getId(), seat).orElseThrow();
        assertThat(grants.roles()).hasSize(2);
        assertThat(grants.grants()).containsKey("approvals.decide").containsKey("ops.own_hours"); // the union

        // the widest scope wins when two roles grant the same key: ORG_ADMIN holds assignments.manage at ORG, the manager at TEAM
        Long admin = template("ORG_ADMIN");
        assertCode(call("rw-a-admin", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + admin + "," + manager + "],\"primaryRoleId\":" + manager + "}")), 422, "ROLE_CEILING");
        assertStatus(call("rw-a-owner", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + admin + "," + manager + "],\"primaryRoleId\":" + manager + "}")), 200);
        var union = roleService.resolveGrants(a.getId(), reload(aMember)).orElseThrow();
        assertThat(union.grants().get("assignments.manage")).hasToString("ORG");
        assertThat(union.grants()).containsKey("approvals.decide");
        // revoking one role is a ROLE_REVOKE
        MvcResult revoke = call("rw-a-owner", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + manager + "]}"));
        assertStatus(revoke, 200);
        assertThat(newestAudit(a).getAction()).isEqualTo("ROLE_REVOKE");
        assertThat(memberRoleRepo.findLiveByOrgIdAndMemberId(a.getId(), aMember.getId())).hasSize(1);
    }

    @Test
    void theRoleRowsKeepTheirHistoryWhenARoleIsTakenAway() throws Exception {
        Long manager = template("MARKETING_MANAGER");
        assertStatus(call("rw-a-owner", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + manager + "]}")), 200);
        assertStatus(call("rw-a-owner", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + template("MEMBER") + "]}")), 200);
        // one live row, and the ended one is kept (ends_at set), never deleted
        em.flush();
        em.clear();
        assertThat(memberRoleRepo.findLiveByOrgIdAndMemberId(a.getId(), aMember.getId())).hasSize(1);
        assertThat(memberRoleRepo.countLiveByOrgIdAndRoleId(a.getId(), manager)).isZero();
        long rowsForManager = em.createQuery("select count(m) from OrgMemberRole m where m.orgId = :o and m.memberId = :m and m.roleId = :r", Long.class)
            .setParameter("o", a.getId()).setParameter("m", aMember.getId()).setParameter("r", manager).getSingleResult();
        assertThat(rowsForManager).isEqualTo(1);
    }

    @Test
    void thePrimaryRulesAreEnforced() throws Exception {
        Long manager = template("MARKETING_MANAGER");
        Long member = template("MEMBER");
        long before = auditCount(a);
        for (String json : new String[] {
            "{}",
            "{\"roleIds\":[]}",
            "{\"roleIds\":[" + member + "," + manager + "]}", // two roles, no primary
            "{\"roleIds\":[" + member + "," + manager + "],\"primaryRoleId\":" + template("STAFF") + "}", // primary not in the list
            "{\"roleIds\":[" + member + "," + member + "],\"primaryRoleId\":" + member + "}", // duplicate
            "{\"roleIds\":[null],\"primaryRoleId\":null}",
        }) {
            MvcResult r = call("rw-a-owner", put(memberRoles(a, aMember)).content(json));
            assertThat(r.getResponse().getStatus()).as(json + " -> " + r.getResponse().getContentAsString()).isEqualTo(422);
        }
        assertThat(auditCount(a)).isEqualTo(before);
        assertThat(reload(aMember).getRole()).isEqualTo(OrgRole.MEMBER);
    }

    @Test
    void nobodyChangesTheirOwnRoles() throws Exception {
        MvcResult r = call("rw-a-owner", put(memberRoles(a, aOwner)).content("{\"roleIds\":[" + template("OWNER") + "]}"));
        assertCode(r, 422, "ROLE_CEILING");
        assertThat(body(r).path("reason").asText()).isEqualTo("SELF");
        assertCode(call("rw-a-admin", put(memberRoles(a, aAdmin)).content("{\"roleIds\":[" + template("ORG_ADMIN") + "]}")), 422, "ROLE_CEILING");
    }

    @Test
    void anOrgAdminCannotTouchOwnersOrAdminsInEitherDirection() throws Exception {
        // taking the Owner role away from the owner, or demoting him
        assertCode(call("rw-a-admin", put(memberRoles(a, aOwner)).content("{\"roleIds\":[" + template("MEMBER") + "]}")), 422, "ROLE_CEILING");
        // handing out ORG_ADMIN (within the admin's own permissions, but capped by BELOW_ADMIN)
        MvcResult r = call("rw-a-admin", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + template("ORG_ADMIN") + "]}"));
        assertCode(r, 422, "ROLE_CEILING");
        assertThat(body(r).path("reason").asText()).isEqualTo("ADMIN_ROLE");
        // a role that holds roles.manage is admin level too, even with another name
        JsonNode sneaky = createRole("rw-a-owner", a, "{\"name\":\"Sneaky\",\"permissions\":" + grid("roles.manage", "ORG") + "}");
        MvcResult s = call("rw-a-admin", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + sneaky.path("id").asLong() + "]}"));
        assertCode(s, 422, "ROLE_CEILING");
        assertThat(body(s).path("reason").asText()).isEqualTo("ADMIN_ROLE");
        // ... but an ordinary role is fine
        assertStatus(call("rw-a-admin", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + template("EXECUTIVE_VIEWER") + "]}")), 200);
        // nothing of the refused calls took effect
        assertThat(reload(aOwner).getRole()).isEqualTo(OrgRole.OWNER);
    }

    @Test
    void theLastOwnerCannotBeDemoted() throws Exception {
        // somebody who is allowed to reach everything the Owner role holds, but is not an Owner: a custom "Super" role
        JsonNode ownerRole = body(call("rw-a-owner", get(roles(a) + "/" + template("OWNER"))));
        StringBuilder grid = new StringBuilder("[");
        for (JsonNode p : ownerRole.path("permissions")) {
            if (grid.length() > 1) grid.append(',');
            grid.append("{\"key\":\"").append(p.path("key").asText()).append("\",\"scope\":\"").append(p.path("scope").asText()).append("\"}");
        }
        grid.append(']');
        JsonNode sup = createRole("rw-a-owner", a, "{\"name\":\"Super\",\"permissions\":" + grid + "}");
        assertStatus(call("rw-a-owner", put(memberRoles(a, aStaff)).content("{\"roleIds\":[" + sup.path("id").asLong() + "]}")), 200);
        long before = auditCount(a);
        // Super is within the owner's reach, so the ceiling passes; the guard is what refuses
        MvcResult r = call("rw-a-staff", put(memberRoles(a, aOwner)).content("{\"roleIds\":[" + template("MEMBER") + "]}"));
        assertCode(r, 409, "LAST_ADMIN");
        assertThat(auditCount(a)).isEqualTo(before);
        assertThat(reload(aOwner).getRole()).isEqualTo(OrgRole.OWNER);
        // with a second Owner the first can step down
        assertStatus(call("rw-a-owner", put(memberRoles(a, aMarketer)).content("{\"roleIds\":[" + template("OWNER") + "]}")), 200);
        assertStatus(call("rw-a-staff", put(memberRoles(a, aOwner)).content("{\"roleIds\":[" + template("MEMBER") + "]}")), 200);
        // and the remaining Owner is now the last one
        assertCode(call("rw-a-staff", put(memberRoles(a, aMarketer)).content("{\"roleIds\":[" + template("MEMBER") + "]}")), 409, "LAST_ADMIN");
    }

    @Test
    void aMemberWhoHasLeftOrNeverBelongedIsRefused() throws Exception {
        OrgMember left = fx.seat(a, "rw-a-left", OrgRole.MEMBER, OrgMemberStatus.LEFT);
        assertCode(call("rw-a-owner", put(memberRoles(a, left)).content("{\"roleIds\":[" + template("MEMBER") + "]}")), 409, "SEAT_STATE");
        assertGeneric404(call("rw-a-owner", put("/api/orgs/" + a.getId() + "/members/999999999/roles").content("{\"roleIds\":[" + template("MEMBER") + "]}")), "a member that does not exist");
    }

    // ---- who may write ------------------------------------------------------------------------------------------------

    @Test
    void everyoneWithoutThePermissionGetsTheGeneric404OnEveryWriteRoute() throws Exception {
        JsonNode role = createRole("rw-a-owner", a, "{\"name\":\"Victim\",\"templateKey\":\"EXECUTIVE_VIEWER\"}");
        String url = roles(a) + "/" + role.path("id").asLong();
        long before = auditCount(a);
        for (String login : new String[] { "rw-a-member", "rw-a-marketer", "rw-a-staff" }) {
            assertGeneric404(call(login, post(roles(a)).content("{\"name\":\"Mine\"}")), login + " POST");
            assertGeneric404(call(login, patch(url).content("{\"name\":\"Mine\"}"), role.path("version").asText()), login + " PATCH");
            assertGeneric404(call(login, delete(url), role.path("version").asText()), login + " DELETE");
            assertGeneric404(call(login, put(memberRoles(a, aMember)).content("{\"roleIds\":[" + template("OWNER") + "]}")), login + " PUT");
        }
        // a seat that still reads the enum (no role rows) cannot manage roles even if its enum says OWNER
        OrgMember legacy = fx.active(a, "rw-a-legacy-owner", OrgRole.OWNER);
        assertGeneric404(call("rw-a-legacy-owner", post(roles(a)).content("{\"name\":\"Mine\"}")), "legacy owner POST");
        assertThat(legacy.getId()).isNotNull();
        // an outsider, a stranger and a suspended seat
        fx.user("rw-loner");
        fx.seat(a, "rw-a-suspended", OrgRole.ADMIN, OrgMemberStatus.SUSPENDED);
        for (String login : new String[] { "rw-loner", "rw-a-suspended", "ghost" }) {
            assertGeneric404(call(login, post(roles(a)).content("{\"name\":\"Mine\"}")), login + " POST");
        }
        assertThat(auditCount(a)).isEqualTo(before);
        assertThat(body(call("rw-a-owner", get(roles(a))))).hasSize(13);
        assertThat(reload(aMember).getRole()).isEqualTo(OrgRole.MEMBER);
    }

    @Test
    void aMemberCannotEscalateByEditingARoleTheyHold() throws Exception {
        // the owner gives the staff member a custom role that may manage roles but nothing else of weight
        JsonNode manager = createRole("rw-a-owner", a, "{\"name\":\"Role editor\",\"permissions\":" + grid("roles.manage", "ORG", "reports.view", "ORG") + "}");
        assertStatus(call("rw-a-owner", put(memberRoles(a, aStaff)).content("{\"roleIds\":[" + manager.path("id").asLong() + "]}")), 200);
        String url = roles(a) + "/" + manager.path("id").asLong();
        MvcResult current = call("rw-a-staff", get(url));
        // the role editor tries to add everything to the role they hold
        for (String key : new String[] { "org.close", "billing.manage", "members.role.set", "org.transfer_ownership", "finance.manage" }) {
            MvcResult r = call("rw-a-staff", patch(url).content("{\"permissions\":" + grid("roles.manage", "ORG", key, "ORG") + "}"), etag(current));
            assertCode(r, 422, "ROLE_CEILING");
            assertThat(body(r).path("key").asText()).isEqualTo(key);
        }
        // nor can they clone the Owner's or the admin's power into a new role
        assertCode(call("rw-a-staff", post(roles(a)).content("{\"name\":\"Clone\",\"templateKey\":\"ORG_ADMIN\"}")), 422, "ROLE_CEILING");
        // and they cannot give themselves roles (self) nor reach another role they do not cover
        assertCode(call("rw-a-staff", put(memberRoles(a, aStaff)).content("{\"roleIds\":[" + template("OWNER") + "]}")), 404, "NOT_FOUND"); // no members.role.set at all
        assertThat(etag(call("rw-a-staff", get(url)))).as("the role is unchanged").isEqualTo(etag(current));
    }

    @Test
    void aWriteInAnOrganizationThatIsNotActiveIsRefused() throws Exception {
        Organization pastDue = orgs.findByOrgId(a.getId()).orElseThrow();
        pastDue.setStatus(OrgStatus.PAST_DUE);
        orgs.saveAndFlush(pastDue);
        assertGeneric404(call("rw-a-owner", post(roles(a)).content("{\"name\":\"Late\"}")), "write while PAST_DUE");
        assertGeneric404(call("rw-a-owner", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + template("STAFF") + "]}")), "assign while PAST_DUE");
        assertThat(call("rw-a-owner", get(roles(a))).getResponse().getStatus()).as("reads stay open").isEqualTo(200);
    }

    @Test
    void withTheRolesFlagOffEveryWriteIsA404() throws Exception {
        JsonNode role = createRole("rw-a-owner", a, "{\"name\":\"Soon off\"}");
        flags(true, false);
        assertGeneric404(call("rw-a-owner", post(roles(a)).content("{\"name\":\"X\"}")), "POST flag off");
        assertGeneric404(call("rw-a-owner", patch(roles(a) + "/" + role.path("id").asLong()).content("{\"name\":\"X\"}"), role.path("version").asText()), "PATCH flag off");
        assertGeneric404(call("rw-a-owner", delete(roles(a) + "/" + role.path("id").asLong()), role.path("version").asText()), "DELETE flag off");
        assertGeneric404(call("rw-a-owner", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + template("STAFF") + "]}")), "PUT flag off");
        assertGeneric404(call("rw-a-owner", get(roles(a) + "/overview")), "overview flag off");
        flags(false, true);
        assertGeneric404(call("rw-a-owner", post(roles(a)).content("{\"name\":\"X\"}")), "POST master flag off");
    }

    // ---- cross tenant ---------------------------------------------------------------------------------------------------

    @Test
    void theOwnerOfAnotherOrganizationCanWriteNothingOfOurs() throws Exception {
        JsonNode role = createRole("rw-a-owner", a, "{\"name\":\"Ours\",\"templateKey\":\"EXECUTIVE_VIEWER\"}");
        long roleId = role.path("id").asLong();
        long beforeA = auditCount(a);
        long beforeB = auditCount(b);
        // B's owner against A's organization
        assertGeneric404(call("rw-b-owner", post(roles(a)).content("{\"name\":\"Hijack\"}")), "POST /A/roles");
        assertGeneric404(call("rw-b-owner", patch(roles(a) + "/" + roleId).content("{\"name\":\"Hijack\"}"), role.path("version").asText()), "PATCH /A/roles/x");
        assertGeneric404(call("rw-b-owner", delete(roles(a) + "/" + roleId), role.path("version").asText()), "DELETE /A/roles/x");
        assertGeneric404(call("rw-b-owner", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + template("OWNER") + "]}")), "PUT /A/members/x/roles");
        // B's owner in B, naming A's rows by id
        assertGeneric404(call("rw-b-owner", patch(roles(b) + "/" + roleId).content("{\"name\":\"Hijack\"}"), role.path("version").asText()), "PATCH /B/roles/A's role");
        assertGeneric404(call("rw-b-owner", delete(roles(b) + "/" + roleId), role.path("version").asText()), "DELETE /B/roles/A's role");
        assertGeneric404(call("rw-b-owner", get(roles(b) + "/" + roleId)), "GET /B/roles/A's role");
        assertGeneric404(call("rw-b-owner", put(memberRoles(b, aMember)).content("{\"roleIds\":[" + template("MEMBER") + "]}")), "PUT /B/members/A's member");
        assertGeneric404(call("rw-b-owner", put(memberRoles(b, bMember)).content("{\"roleIds\":[" + roleId + "]}")), "assign A's role to B's member");
        assertGeneric404(call("rw-b-owner", post(roles(b)).content("{\"name\":\"Copy of theirs\",\"sourceRoleId\":" + roleId + "}")), "clone A's role into B");
        // and the other way round
        JsonNode theirs = createRole("rw-b-owner", b, "{\"name\":\"Theirs\"}");
        assertGeneric404(call("rw-a-owner", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + theirs.path("id").asLong() + "]}")), "assign B's role to A's member");
        assertThat(auditCount(a)).isEqualTo(beforeA);
        assertThat(auditCount(b)).isEqualTo(beforeB + 1); // only B's own create
        assertThat(roleRepo.findOwnedByOrgIdAndId(a.getId(), roleId).orElseThrow().getName()).isEqualTo("Ours");
        assertThat(reload(aMember).getRole()).isEqualTo(OrgRole.MEMBER);
        assertThat(reload(bMember).getRole()).isEqualTo(OrgRole.MEMBER);
    }

    // ---- mass assignment ------------------------------------------------------------------------------------------------

    @Test
    void unknownFieldsInABodyAreIgnoredAndNeverReachTheRow() throws Exception {
        MvcResult r = call(
            "rw-a-owner",
            post(roles(a)).content(
                "{\"name\":\"Mass\",\"id\":1,\"orgId\":" + b.getId() + ",\"system\":true,\"editable\":false,\"roleKey\":\"OWNER\",\"templateKey\":\"EXECUTIVE_VIEWER\",\"createdAt\":\"2001-01-01T00:00:00Z\",\"isSystem\":true}"
            )
        );
        assertStatus(r, 201);
        JsonNode role = body(r);
        OrgRoleDefinition stored = roleRepo.findOwnedByOrgIdAndId(a.getId(), role.path("id").asLong()).orElseThrow();
        assertThat(stored.getOrgId()).isEqualTo(a.getId());
        assertThat(stored.isSystem()).isFalse();
        assertThat(stored.isEditable()).isTrue();
        assertThat(stored.getRoleKey()).isEqualTo("CUSTOM_MASS");
        assertThat(stored.getId()).isNotEqualTo(1L);
        assertThat(roleRepo.findOwnedByOrgIdAndId(b.getId(), stored.getId())).isEmpty();

        MvcResult p = call(
            "rw-a-owner",
            patch(roles(a) + "/" + stored.getId()).content("{\"description\":\"d\",\"orgId\":" + b.getId() + ",\"system\":true,\"editable\":false,\"roleKey\":\"X\",\"templateKey\":\"OWNER\"}"),
            role.path("version").asText()
        );
        assertStatus(p, 200);
        OrgRoleDefinition after = roleRepo.findOwnedByOrgIdAndId(a.getId(), stored.getId()).orElseThrow();
        assertThat(after.getOrgId()).isEqualTo(a.getId());
        assertThat(after.isSystem()).isFalse();
        assertThat(after.isEditable()).isTrue();
        assertThat(after.getTemplateKey()).isEqualTo("EXECUTIVE_VIEWER");
        assertThat(after.getRoleKey()).isEqualTo("CUSTOM_MASS");
        assertThat(after.getDescription()).isEqualTo("d");

        // the member route binds the roles and the primary only: status, role, org and member id in the body do nothing
        MvcResult m = call(
            "rw-a-owner",
            put(memberRoles(a, aMember)).content("{\"roleIds\":[" + template("STAFF") + "],\"memberId\":" + aOwner.getId() + ",\"orgId\":" + b.getId() + ",\"role\":\"OWNER\",\"status\":\"REMOVED\"}")
        );
        assertStatus(m, 200);
        OrgMember seat = reload(aMember);
        assertThat(seat.getRole()).isEqualTo(OrgRole.STAFF);
        assertThat(seat.getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(seat.getOrgId()).isEqualTo(a.getId());
        assertThat(reload(aOwner).getRole()).isEqualTo(OrgRole.OWNER);
    }

    @Test
    void malformedBodiesAndIdsAreNeverA500() throws Exception {
        for (String json : new String[] { "", "[]", "\"x\"", "{\"permissions\":\"all\"}", "{\"name\":\"ok\",\"permissions\":[null]}" }) {
            MvcResult r = call("rw-a-owner", post(roles(a)).content(json));
            assertThat(r.getResponse().getStatus()).as(json).isBetween(400, 499);
        }
        for (String bad : new String[] { "abc", "-1", "0", "99999999999999999999" }) {
            MvcResult r = call("rw-a-owner", get(roles(a) + "/" + bad));
            assertThat(r.getResponse().getStatus()).as(bad).isBetween(400, 404);
        }
    }

    // ---- the board ------------------------------------------------------------------------------------------------------

    @Test
    void theOverviewGivesTheBoardItsTableCountsAndPermissionDonut() throws Exception {
        createRole("rw-a-owner", a, "{\"name\":\"Exec copy\",\"templateKey\":\"EXECUTIVE_VIEWER\"}");
        assertStatus(call("rw-a-owner", put(memberRoles(a, aMember)).content("{\"roleIds\":[" + template("STAFF") + "]}")), 200);
        MvcResult r = call("rw-a-member", get(roles(a) + "/overview")); // any active member reads it
        assertStatus(r, 200);
        JsonNode ov = body(r);
        assertThat(ov.path("customRoleCount").asInt()).isEqualTo(1);
        assertThat(ov.path("systemRoleCount").asInt()).isEqualTo(12);
        assertThat(ov.path("roles")).hasSize(13);
        JsonNode staff = null;
        JsonNode owner = null;
        JsonNode custom = null;
        for (JsonNode row : ov.path("roles")) {
            if ("STAFF".equals(row.path("key").asText())) staff = row;
            if ("OWNER".equals(row.path("key").asText())) owner = row;
            if ("CUSTOM_EXEC_COPY".equals(row.path("key").asText())) custom = row;
        }
        assertThat(staff.path("assignedUsers").asLong()).as("STAFF: the staff seat and the member moved to it").isEqualTo(2);
        assertThat(owner.path("assignedUsers").asLong()).isEqualTo(1);
        assertThat(owner.path("scopeLabel").asText()).isEqualTo("Organization");
        assertThat(owner.path("scopeLevel").asText()).isEqualTo("ORG");
        assertThat(ov.path("totalRoles").asInt()).isEqualTo(13);
        assertThat(ov.path("activeUsers").asLong()).as("the five ACTIVE seats of the organization").isEqualTo(5);
        for (JsonNode row : ov.path("roles")) {
            if ("MARKETING_MANAGER".equals(row.path("key").asText())) assertThat(row.path("scopeLabel").asText()).isEqualTo("Team");
            if ("CONSULTANT".equals(row.path("key").asText())) assertThat(row.path("scopeLabel").asText()).isEqualTo("Personal");
        }
        assertThat(owner.path("editable").asBoolean()).isFalse();
        assertThat(owner.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(custom.path("scopeLabel").asText()).isEqualTo("Custom");
        assertThat(custom.path("assignedUsers").asLong()).isZero();
        assertThat(custom.path("permissionCount").asInt()).isEqualTo(RoleTemplates.find("EXECUTIVE_VIEWER").orElseThrow().grants().size());
        assertThat(custom.path("version").asText()).startsWith("W/\"");
        List<String> labels = new java.util.ArrayList<>();
        int keys = 0;
        int percent = 0;
        for (JsonNode c : ov.path("permissionOverview")) {
            labels.add(c.path("label").asText());
            keys += c.path("keys").asInt();
            percent += c.path("percent").asInt();
            assertThat(c.path("grantedKeys").asInt()).isLessThanOrEqualTo(c.path("keys").asInt());
        }
        assertThat(labels).containsExactly("Core Platform", "Recruiting", "Consultants", "Finance", "Administration");
        assertThat(keys).isEqualTo(ov.path("totalPermissionKeys").asInt());
        assertThat(percent).isBetween(98, 102);
        // another organization's custom role does not count here
        assertThat(body(call("rw-b-owner", get(roles(b) + "/overview"))).path("customRoleCount").asInt()).isZero();
        // outsiders get the generic 404
        assertGeneric404(call("rw-b-owner", get(roles(a) + "/overview")), "overview as an outsider");
    }
}
