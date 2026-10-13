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
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
 * X1.6 through the real chain: {@code GET /api/orgs/{orgId}/roles} shows the twelve system templates with their permission
 * rows to any ACTIVE member, is the same generic 404 as a missing organization for everybody else and whenever the roles flag
 * is off, never shows another organization's roles, and has no write routes yet.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgRoleResourceIT {

    private static final String WHO = "roles-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings cache;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        a = fx.org("roles-a-" + System.nanoTime(), OrgStatus.ACTIVE);
        b = fx.org("roles-b-" + System.nanoTime(), OrgStatus.ACTIVE);
        fx.active(a, "roles-a-owner", OrgRole.OWNER);
        fx.active(a, "roles-a-member", OrgRole.MEMBER);
        fx.active(a, "roles-a-marketer", OrgRole.MARKETER);
        fx.seat(a, "roles-a-suspended", OrgRole.ADMIN, OrgMemberStatus.SUSPENDED);
        fx.seat(a, "roles-a-invited", OrgRole.MEMBER, OrgMemberStatus.INVITED);
        fx.active(b, "roles-b-owner", OrgRole.OWNER);
        fx.user("roles-loner");
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

    private MvcResult call(String login, MockHttpServletRequestBuilder req) throws Exception {
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("not a member").doesNotContain("denied");
    }

    private String uri(Organization o) {
        return "/api/orgs/" + o.getId() + "/roles";
    }

    @Test
    void anyActiveMemberReadsTheTwelveSystemTemplatesWithTheirPermissionRows() throws Exception {
        for (String login : new String[] { "roles-a-owner", "roles-a-member", "roles-a-marketer" }) {
            MvcResult r = call(login, get(uri(a)));
            assertThat(r.getResponse().getStatus()).as(login).isEqualTo(200);
            JsonNode list = om.readTree(r.getResponse().getContentAsString());
            assertThat(list).as(login).hasSize(12);
            for (RoleTemplates.Template t : RoleTemplates.all()) {
                JsonNode role = find(list, t.key());
                assertThat(role).as(t.key()).isNotNull();
                assertThat(role.path("system").asBoolean()).isTrue();
                assertThat(role.path("editable").asBoolean()).isFalse();
                assertThat(role.has("orgId")).as("no organization id in the DTO").isFalse();
                assertThat(role.path("permissions")).as(t.key() + " permission rows").hasSize(t.grants().size());
            }
            JsonNode admin = find(list, "ORG_ADMIN");
            assertThat(permission(admin, "members.role.set").path("ceilingRoleKey").asText()).isEqualTo("BELOW_ADMIN");
            assertThat(permission(find(list, "FINANCE_SPECIALIST"), "audit.view").path("rowFilter").asText()).isEqualTo("BILLING_OPS");
            assertThat(permission(find(list, "MARKETING_MANAGER"), "approvals.decide").path("scope").asText()).isEqualTo("TEAM");
        }
    }

    private static JsonNode find(JsonNode list, String key) {
        for (JsonNode n : list) if (key.equals(n.path("key").asText())) return n;
        return null;
    }

    private static JsonNode permission(JsonNode role, String key) {
        for (JsonNode p : role.path("permissions")) if (key.equals(p.path("key").asText())) return p;
        throw new AssertionError("no permission " + key + " in " + role.path("key").asText());
    }

    @Test
    void everyoneWhoIsNotAnActiveMemberOfThatOrganizationGetsTheGeneric404() throws Exception {
        for (String login : new String[] { "roles-b-owner", "roles-loner", "roles-a-suspended", "roles-a-invited", "ghost-login" }) {
            assertGeneric404(call(login, get(uri(a))), login);
        }
        // cross-tenant: B's owner asking for his own org's roles sees B's list, never A's, and A's id stays a 404 for him
        MvcResult own = call("roles-b-owner", get(uri(b)));
        assertThat(own.getResponse().getStatus()).isEqualTo(200);
        assertThat(om.readTree(own.getResponse().getContentAsString())).hasSize(12);
        for (String bad : new String[] { "0", "-1", "999999999", "abc", "9999999999999999999999" }) {
            assertGeneric404(call("roles-a-owner", get("/api/orgs/" + bad + "/roles")), "orgId " + bad);
        }
    }

    @Test
    void withTheRolesFlagOffTheRouteDoesNotExistForAnyone() throws Exception {
        flags(true, false);
        assertGeneric404(call("roles-a-owner", get(uri(a))), "owner, roles flag off");
        flags(false, true);
        assertGeneric404(call("roles-a-owner", get(uri(a))), "owner, master flag off (a sub-flag alone enables nothing)");
        for (AppSetting s : rows.findAll()) if (WHO.equals(s.getUpdatedBy())) rows.delete(s);
        cache.invalidate();
        assertGeneric404(call("roles-a-owner", get(uri(a))), "owner, shipped defaults");
    }

    @Test
    void theRolesFlagCanBeLimitedToOrganizations() throws Exception {
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":true,\"allow\":[" + a.getId() + "]}", WHO, Instant.now()));
        cache.invalidate();
        assertThat(call("roles-a-owner", get(uri(a))).getResponse().getStatus()).isEqualTo(200);
        assertGeneric404(call("roles-b-owner", get(uri(b))), "an organization outside the allow list");
    }

    @Test
    void thereAreNoWriteRoutesYet() throws Exception {
        for (MockHttpServletRequestBuilder req : new MockHttpServletRequestBuilder[] {
            post(uri(a)).content("{\"templateKey\":\"ORG_ADMIN\",\"name\":\"x\"}"),
            patch(uri(a) + "/1").content("{\"name\":\"x\"}"),
            put(uri(a) + "/1/permissions").content("{}"),
            delete(uri(a) + "/1"),
            get(uri(a) + "/1"),
        }) {
            MvcResult r = call("roles-a-owner", req);
            assertThat(r.getResponse().getStatus()).as(req.toString() + " -> " + r.getResponse().getContentAsString()).isIn(404, 405);
        }
        // and nothing changed: still twelve system rows, none owned by an organization
        assertThat(om.readTree(call("roles-a-owner", get(uri(a))).getResponse().getContentAsString())).hasSize(12);
    }

    @Test
    void membersOfOtherRolesGetTheSameListNotAFilteredOne() throws Exception {
        JsonNode owner = om.readTree(call("roles-a-owner", get(uri(a))).getResponse().getContentAsString());
        JsonNode member = om.readTree(call("roles-a-member", get(uri(a))).getResponse().getContentAsString());
        assertThat(member).isEqualTo(owner);
        OrgMember seat = members.findByOrgIdAndUserIdAndStatusIn(a.getId(), users.findOneByLogin("roles-a-member").orElseThrow().getId(), java.util.List.of(OrgMemberStatus.ACTIVE)).get(0);
        assertThat(seat.getRole()).isEqualTo(OrgRole.MEMBER);
    }
}
