package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.enumeration.OrgGroupKind;
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
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.authz.ScopeEvaluator;
import com.dossier.api.service.org.OrgAuditAsserts;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.time.Instant;
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
 * X4.5 through the real chain (Enterprise flag on for two organizations, off for a third): the tree of departments and teams, leads,
 * moving people one by one and in bulk, the directory with its KPI numbers, the structure, If-Match versions, the empty-only delete,
 * scope-aware reads (a lead sees their group), the {@code departments.manage} alias, every cross-tenant and mass-assignment attack of
 * 42-threat-model.md, one audit row per mutation with the right risk, and {@code JpaScopeDirectory} feeding {@code ScopeEvaluator}.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgGroupEnterpriseIT {

    private static final String WHO = "group-ent-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgGroupRepository groups;
    @Autowired private OrgRoleRepository roleRepo;
    @Autowired private OrgMemberRoleRepository memberRoleRepo;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private OrgRoleService roleService;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private ScopeEvaluator evaluator;
    @Autowired private EntityManager em;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private Organization legacy;
    private OrgMember aOwner;
    private OrgMember aHr;
    private OrgMember aConsultant;
    private OrgMember aManager;
    private OrgMember bOwner;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        a = fx.org("ge-a-" + System.nanoTime(), OrgStatus.ACTIVE);
        b = fx.org("ge-b-" + System.nanoTime(), OrgStatus.ACTIVE);
        legacy = fx.org("ge-l-" + System.nanoTime(), OrgStatus.ACTIVE);
        aOwner = fx.active(a, "ge-a-owner", OrgRole.OWNER);
        aHr = fx.active(a, "ge-a-hr", OrgRole.MEMBER);
        aConsultant = fx.active(a, "ge-a-consultant", OrgRole.MEMBER);
        aManager = fx.active(a, "ge-a-manager", OrgRole.MEMBER);
        bOwner = fx.active(b, "ge-b-owner", OrgRole.OWNER);
        fx.active(legacy, "ge-l-owner", OrgRole.OWNER);
        for (OrgMember m : List.of(aOwner, bOwner)) roleService.syncFromLegacy(m);
        assign(aHr, RoleTemplates.HR_SPECIALIST);
        assign(aConsultant, RoleTemplates.CONSULTANT);
        assign(aManager, RoleTemplates.MARKETING_MANAGER);
        flags();
    }

    @AfterEach
    void clean() {
        for (AppSetting s : rows.findAll()) if (WHO.equals(s.getUpdatedBy())) rows.delete(s);
        cache.invalidate();
    }

    private void flags() {
        for (AppSetting s : rows.findAll()) if (WHO.equals(s.getUpdatedBy())) rows.delete(s);
        String allow = "\"allow\":[" + a.getId() + "," + b.getId() + "]";
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true," + allow + "}", WHO, Instant.now()));
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":true," + allow + "}", WHO, Instant.now()));
        cache.invalidate();
    }

    private void assign(OrgMember m, String template) {
        OrgRoleDefinition def = roleRepo.findSystemByRoleKey(template).orElseThrow();
        OrgMemberRole r = new OrgMemberRole();
        r.setOrgId(m.getOrgId());
        r.setMemberId(m.getId());
        r.setRoleId(def.getId());
        r.setPrimary(true);
        r.setGrantedAt(Instant.now());
        memberRoleRepo.saveAndFlush(r);
        m.setPrimaryRoleId(def.getId());
        members.saveAndFlush(m);
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

    private void status(MvcResult r, int status) throws Exception {
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(status);
    }

    private void code(MvcResult r, int status, String code) throws Exception {
        status(r, status);
        assertThat(r.getResponse().getContentAsString()).contains("\"code\":\"" + code + "\"");
    }

    private void generic404(MvcResult r, String what) throws Exception {
        String text = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + text).isEqualTo(404);
        assertThat(text.toLowerCase().replaceAll("\"(instance|path)\":\"[^\"]*\"", "")).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission");
    }

    private static String url(Organization o) {
        return "/api/orgs/" + o.getId() + "/groups";
    }

    private long create(String login, Organization o, String json) throws Exception {
        MvcResult r = call(login, post(url(o)).content(json));
        status(r, 201);
        return body(r).path("id").asLong();
    }

    private String etagOf(String login, Organization o, long id) throws Exception {
        MvcResult r = call(login, get(url(o) + "/" + id));
        status(r, 200);
        return r.getResponse().getHeader("ETag");
    }

    private OrgMember person(Organization o, String login) {
        return fx.active(o, login, OrgRole.MEMBER);
    }

    private static String ids(OrgMember... ms) {
        StringBuilder sb = new StringBuilder("{\"memberIds\":[");
        for (int i = 0; i < ms.length; i++) sb.append(i > 0 ? "," : "").append(ms[i].getId());
        return sb.append("]}").toString();
    }

    private OrgMember reload(OrgMember m) {
        em.flush();
        em.clear();
        return members.findByOrgIdAndId(m.getOrgId(), m.getId()).orElseThrow();
    }

    private long auditCount(Organization o) {
        em.flush();
        return audit.countByOrgId(o.getId());
    }

    // ---- the tree, leads and counts ----------------------------------------------------------------------------------

    @Test
    void aTeamUnderADepartmentWithALeadAppearsInTheListWithItsCounts() throws Exception {
        OrgMember lead = person(a, "ge-lead-1");
        OrgMember p1 = person(a, "ge-p-1");
        long dept = create("ge-a-owner", a, "{\"name\":\"Delivery\",\"kind\":\"DEPARTMENT\",\"leadMemberId\":" + lead.getId() + ",\"icon\":\"briefcase\",\"color\":\"primary\"}");
        long team = create("ge-a-owner", a, "{\"name\":\"Bench NY\",\"kind\":\"TEAM\",\"parentGroupId\":" + dept + "}");
        status(call("ge-a-owner", post(url(a) + "/" + team + "/members").content(ids(p1))), 200);

        MvcResult list = call("ge-a-owner", get(url(a)));
        status(list, 200);
        JsonNode delivery = null;
        JsonNode bench = null;
        for (JsonNode g : body(list)) {
            if (g.path("id").asLong() == dept) delivery = g;
            if (g.path("id").asLong() == team) bench = g;
        }
        assertThat(delivery.path("lead").path("memberId").asLong()).isEqualTo(lead.getId());
        assertThat(delivery.path("teamCount").asInt()).isEqualTo(1);
        assertThat(delivery.path("activeCount").asInt()).as("the person in the team is in the department too").isEqualTo(1);
        assertThat(delivery.path("icon").asText()).isEqualTo("briefcase");
        assertThat(bench.path("parentGroupId").asLong()).isEqualTo(dept);
        assertThat(bench.path("parentName").asText()).isEqualTo("Delivery");
        assertThat(bench.path("memberCount").asInt()).isEqualTo(1);
        assertThat(bench.path("version").asText()).startsWith("W/\"");
        assertThat(bench.has("openRoles") || bench.has("workload")).as("no invented numbers").isFalse();
    }

    @Test
    void movingThreeMembersIntoATeamSetsBothColumnsAndMovingTheTeamRepointsTheirDepartmentInOneTransaction() throws Exception {
        long d1 = create("ge-a-owner", a, "{\"name\":\"One\",\"kind\":\"DEPARTMENT\"}");
        long d2 = create("ge-a-owner", a, "{\"name\":\"Two\",\"kind\":\"DEPARTMENT\"}");
        long team = create("ge-a-owner", a, "{\"name\":\"T\",\"parentGroupId\":" + d1 + "}");
        OrgMember m1 = person(a, "ge-m-1");
        OrgMember m2 = person(a, "ge-m-2");
        OrgMember m3 = person(a, "ge-m-3");
        MvcResult moved = call("ge-a-owner", post(url(a) + "/" + team + "/members").content(ids(m1, m2, m3)));
        status(moved, 200);
        assertThat(body(moved).path("moved").asInt()).isEqualTo(3);
        for (OrgMember m : List.of(m1, m2, m3)) {
            OrgMember r = reload(m);
            assertThat(r.getTeamGroupId()).isEqualTo(team);
            assertThat(r.getDepartmentGroupId()).isEqualTo(d1);
        }
        long before = auditCount(a);
        MvcResult re = call("ge-a-owner", patch(url(a) + "/" + team).content("{\"parentGroupId\":" + d2 + "}"), etagOf("ge-a-owner", a, team));
        status(re, 200);
        for (OrgMember m : List.of(m1, m2, m3)) {
            OrgMember r = reload(m);
            assertThat(r.getTeamGroupId()).isEqualTo(team);
            assertThat(r.getDepartmentGroupId()).as("the department followed the team").isEqualTo(d2);
        }
        OrgAuditEvent row = OrgAuditAsserts.assertOneNewRow(audit, a.getId(), before, OrgAuditService.GROUP_MOVE);
        assertThat(row.getDetails()).contains("members=3");
        assertThat(row.getRisk()).isEqualTo("LOW");
    }

    @Test
    void deletingATeamWithSevenMembersIs409UntilTheyAreMovedThenItIs204() throws Exception {
        long team = create("ge-a-owner", a, "{\"name\":\"Seven\"}");
        long other = create("ge-a-owner", a, "{\"name\":\"Elsewhere\"}");
        List<OrgMember> seven = new ArrayList<>();
        for (int i = 0; i < 7; i++) seven.add(person(a, "ge-s-" + i));
        status(call("ge-a-owner", post(url(a) + "/" + team + "/members").content(ids(seven.toArray(new OrgMember[0])))), 200);

        MvcResult refused = call("ge-a-owner", delete(url(a) + "/" + team), etagOf("ge-a-owner", a, team));
        code(refused, 409, "GROUP_NOT_EMPTY");
        assertThat(body(refused).path("count").asInt()).isEqualTo(7);
        assertThat(groups.findByOrgIdAndId(a.getId(), team)).isPresent();

        status(call("ge-a-owner", post(url(a) + "/" + other + "/members").content(ids(seven.toArray(new OrgMember[0])))), 200);
        long before = auditCount(a);
        status(call("ge-a-owner", delete(url(a) + "/" + team), etagOf("ge-a-owner", a, team)), 204);
        OrgAuditEvent row = OrgAuditAsserts.assertOneNewRow(audit, a.getId(), before, OrgAuditService.GROUP_DELETE);
        assertThat(row.getRisk()).isEqualTo("MEDIUM");
        assertThat(reload(seven.get(0)).getTeamGroupId()).isEqualTo(other);
    }

    @Test
    void aDepartmentWithAParentIs422AndALeadWhoIsInvitedIs422() throws Exception {
        long dept = create("ge-a-owner", a, "{\"name\":\"Top\",\"kind\":\"DEPARTMENT\"}");
        code(call("ge-a-owner", post(url(a)).content("{\"name\":\"Nested\",\"kind\":\"DEPARTMENT\",\"parentGroupId\":" + dept + "}")), 422, "GROUP_PARENT_INVALID");
        OrgMember invited = fx.seat(a, "ge-invited", OrgRole.MEMBER, OrgMemberStatus.INVITED);
        code(call("ge-a-owner", post(url(a)).content("{\"name\":\"Led\",\"leadMemberId\":" + invited.getId() + "}")), 422, "LEAD_NOT_ACTIVE");
        OrgMember suspended = fx.seat(a, "ge-suspended", OrgRole.MEMBER, OrgMemberStatus.SUSPENDED);
        code(call("ge-a-owner", patch(url(a) + "/" + dept).content("{\"leadMemberId\":" + suspended.getId() + "}"), etagOf("ge-a-owner", a, dept)), 422, "LEAD_NOT_ACTIVE");
        assertThat(groups.findByOrgIdOrderBySortOrderAscNameAsc(a.getId())).hasSize(1);
    }

    @Test
    void cyclesAndWrongParentsAreRefused() throws Exception {
        long dept = create("ge-a-owner", a, "{\"name\":\"Dept\",\"kind\":\"DEPARTMENT\"}");
        long team = create("ge-a-owner", a, "{\"name\":\"Team\",\"parentGroupId\":" + dept + "}");
        long team2 = create("ge-a-owner", a, "{\"name\":\"Team2\"}");
        long cohort = create("ge-a-owner", a, "{\"name\":\"Cohort\",\"kind\":\"COHORT\"}");
        code(call("ge-a-owner", patch(url(a) + "/" + team).content("{\"parentGroupId\":" + team + "}"), etagOf("ge-a-owner", a, team)), 422, "GROUP_PARENT_INVALID"); // itself
        code(call("ge-a-owner", patch(url(a) + "/" + team2).content("{\"parentGroupId\":" + team + "}"), etagOf("ge-a-owner", a, team2)), 422, "GROUP_PARENT_INVALID"); // a team is not a parent
        code(call("ge-a-owner", patch(url(a) + "/" + dept).content("{\"parentGroupId\":" + team + "}"), etagOf("ge-a-owner", a, dept)), 422, "GROUP_PARENT_INVALID"); // a department has no parent
        code(call("ge-a-owner", patch(url(a) + "/" + team2).content("{\"parentGroupId\":" + cohort + "}"), etagOf("ge-a-owner", a, team2)), 422, "GROUP_PARENT_INVALID");
        // a department that has teams cannot become a team
        code(call("ge-a-owner", patch(url(a) + "/" + dept).content("{\"kind\":\"TEAM\"}"), etagOf("ge-a-owner", a, dept)), 409, "GROUP_NOT_EMPTY");
        // clearing the parent is explicit
        status(call("ge-a-owner", patch(url(a) + "/" + team).content("{\"clearParent\":true}"), etagOf("ge-a-owner", a, team)), 200);
        assertThat(groups.findByOrgIdAndId(a.getId(), team).orElseThrow().getParentGroupId()).isNull();
    }

    // ---- who may ---------------------------------------------------------------------------------------------------------

    @Test
    void hrManagesGroupsThroughTheAliasAndAConsultantGets404() throws Exception {
        long id = create("ge-a-hr", a, "{\"name\":\"Created by HR\",\"kind\":\"DEPARTMENT\"}");
        MvcResult dir = call("ge-a-hr", get(url(a) + "/directory"));
        status(dir, 200);
        assertThat(body(dir).path("items").size()).isEqualTo(1);
        long before = auditCount(a);
        generic404(call("ge-a-consultant", get(url(a))), "consultant list");
        generic404(call("ge-a-consultant", get(url(a) + "/directory")), "consultant directory");
        generic404(call("ge-a-consultant", get(url(a) + "/structure")), "consultant structure");
        generic404(call("ge-a-consultant", get(url(a) + "/" + id)), "consultant detail");
        generic404(call("ge-a-consultant", post(url(a)).content("{\"name\":\"Nope\"}")), "consultant create");
        generic404(call("ge-a-consultant", delete(url(a) + "/" + id), "W/\"0\""), "consultant delete");
        assertThat(auditCount(a)).isEqualTo(before);
    }

    @Test
    void aTeamLeadSeesOnlyTheirGroupsAndCannotChangeOrCreateAnything() throws Exception {
        long dept = create("ge-a-owner", a, "{\"name\":\"Visible dept\",\"kind\":\"DEPARTMENT\"}");
        long mine = create("ge-a-owner", a, "{\"name\":\"Mine\",\"parentGroupId\":" + dept + ",\"leadMemberId\":" + aManager.getId() + "}");
        long sibling = create("ge-a-owner", a, "{\"name\":\"Sibling\",\"parentGroupId\":" + dept + "}");
        long hidden = create("ge-a-owner", a, "{\"name\":\"Hidden dept\",\"kind\":\"DEPARTMENT\"}");
        OrgMember teammate = person(a, "ge-teammate");
        OrgMember stranger = person(a, "ge-stranger");
        status(call("ge-a-owner", post(url(a) + "/" + mine + "/members").content(ids(teammate))), 200);
        status(call("ge-a-owner", post(url(a) + "/" + hidden + "/members").content(ids(stranger))), 200);

        MvcResult list = call("ge-a-manager", get(url(a)));
        status(list, 200);
        List<Long> seen = new ArrayList<>();
        for (JsonNode g : body(list)) seen.add(g.path("id").asLong());
        assertThat(seen).as("the team they lead, not the departments").contains(mine).doesNotContain(hidden, dept, sibling);
        generic404(call("ge-a-manager", get(url(a) + "/" + hidden)), "a department they have nothing to do with");
        MvcResult detail = call("ge-a-manager", get(url(a) + "/" + mine));
        status(detail, 200);
        // the manager's TEAM scope reaches the teammate (and the lead, themself); a stranger never appears
        assertThat(body(detail).path("members").toString()).contains("ge-teammate");
        MvcResult tree = call("ge-a-manager", get(url(a) + "/structure"));
        status(tree, 200);
        assertThat(tree.getResponse().getContentAsString()).doesNotContain("Hidden dept");
        generic404(call("ge-a-manager", post(url(a)).content("{\"name\":\"Mine now\",\"kind\":\"DEPARTMENT\"}")), "create (no groups.manage)");
        generic404(call("ge-a-manager", patch(url(a) + "/" + mine).content("{\"name\":\"X\"}"), etagOf("ge-a-owner", a, mine)), "update (no groups.manage)");
    }

    // ---- cross-tenant and mass assignment (42-threat-model.md) --------------------------------------------------------

    @Test
    void foreignIdsAreTheSame404Or422AsMissingOnesAndChangeNothing() throws Exception {
        long foreignDept = create("ge-b-owner", b, "{\"name\":\"B dept\",\"kind\":\"DEPARTMENT\"}");
        OrgMember foreignMember = person(b, "ge-b-person");
        long mine = create("ge-a-owner", a, "{\"name\":\"Mine\"}");
        OrgMember mineMember = person(a, "ge-a-person");
        long before = auditCount(b);

        // a group of another organization in the path: 404, nothing written
        generic404(call("ge-a-owner", get(url(a) + "/" + foreignDept)), "foreign detail");
        generic404(call("ge-a-owner", patch(url(a) + "/" + foreignDept).content("{\"name\":\"Mine\"}"), "W/\"0\""), "foreign patch");
        generic404(call("ge-a-owner", delete(url(a) + "/" + foreignDept), "W/\"0\""), "foreign delete");
        generic404(call("ge-a-owner", post(url(a) + "/" + foreignDept + "/members").content(ids(mineMember))), "foreign move target");
        generic404(call("ge-a-owner", get(url(b))), "the other organization's list");

        // a foreign parent and a foreign lead read exactly like a missing one
        MvcResult foreignParent = call("ge-a-owner", post(url(a)).content("{\"name\":\"X1\",\"parentGroupId\":" + foreignDept + "}"));
        MvcResult missingParent = call("ge-a-owner", post(url(a)).content("{\"name\":\"X2\",\"parentGroupId\":99999999}"));
        status(foreignParent, 422);
        assertThat(foreignParent.getResponse().getContentAsString().replaceAll("\"(instance|path)\":\"[^\"]*\"", "")).isEqualTo(missingParent.getResponse().getContentAsString().replaceAll("\"(instance|path)\":\"[^\"]*\"", ""));
        MvcResult foreignLead = call("ge-a-owner", post(url(a)).content("{\"name\":\"X3\",\"leadMemberId\":" + foreignMember.getId() + "}"));
        MvcResult missingLead = call("ge-a-owner", post(url(a)).content("{\"name\":\"X4\",\"leadMemberId\":99999999}"));
        code(foreignLead, 422, "LEAD_NOT_ACTIVE");
        assertThat(foreignLead.getResponse().getContentAsString().replaceAll("\"(instance|path)\":\"[^\"]*\"", "")).isEqualTo(missingLead.getResponse().getContentAsString().replaceAll("\"(instance|path)\":\"[^\"]*\"", ""));
        code(call("ge-a-owner", patch(url(a) + "/" + mine).content("{\"leadMemberId\":" + foreignMember.getId() + "}"), etagOf("ge-a-owner", a, mine)), 422, "LEAD_NOT_ACTIVE");

        // a foreign member id in a move is a skipped row and the person is untouched
        MvcResult moved = call("ge-a-owner", post(url(a) + "/" + mine + "/members").content(ids(foreignMember, mineMember)));
        status(moved, 200);
        JsonNode rowsOut = body(moved).path("results");
        assertThat(rowsOut.get(0).path("status").asText()).isEqualTo("SKIPPED");
        assertThat(rowsOut.get(0).path("code").asText()).isEqualTo("NOT_FOUND");
        assertThat(rowsOut.get(1).path("status").asText()).isEqualTo("MOVED");
        assertThat(reload(foreignMember).getTeamGroupId()).isNull();
        assertThat(groups.findByOrgIdAndId(b.getId(), foreignDept).orElseThrow().getName()).isEqualTo("B dept");
        assertThat(auditCount(b)).isEqualTo(before + 0); // nothing was written in B by A's owner
        assertThat(audit.countByOrgIdAndActorLogin(b.getId(), "ge-a-owner")).isZero();
    }

    @Test
    void theBodyIsNeverBoundToTheEntity() throws Exception {
        MvcResult r = call(
            "ge-a-owner",
            post(url(a)).content("{\"name\":\"Mass\",\"orgId\":" + b.getId() + ",\"id\":4242,\"version\":99,\"createdAt\":\"2001-01-01T00:00:00Z\",\"memberCount\":50}")
        );
        status(r, 201);
        OrgGroup g = groups.findByOrgIdAndId(a.getId(), body(r).path("id").asLong()).orElseThrow();
        assertThat(g.getOrgId()).isEqualTo(a.getId());
        assertThat(g.getId()).isNotEqualTo(4242L);
        assertThat(g.getVersion()).isZero();
        assertThat(g.getCreatedAt()).isAfter(Instant.parse("2020-01-01T00:00:00Z"));
        assertThat(groups.findByOrgIdOrderBySortOrderAscNameAsc(b.getId())).isEmpty();
        // and a patch cannot move the group to another organization or fake its version
        MvcResult p = call("ge-a-owner", patch(url(a) + "/" + g.getId()).content("{\"orgId\":" + b.getId() + ",\"version\":7,\"name\":\"Renamed\"}"), r.getResponse().getHeader("ETag"));
        status(p, 200);
        OrgGroup after = groups.findByOrgIdAndId(a.getId(), g.getId()).orElseThrow();
        assertThat(after.getName()).isEqualTo("Renamed");
        assertThat(after.getVersion()).isEqualTo(1L);
    }

    // ---- versions --------------------------------------------------------------------------------------------------------

    @Test
    void ifMatchIsRequiredInsideTheFlagAndStaleOnesAre412() throws Exception {
        long id = create("ge-a-owner", a, "{\"name\":\"Versioned\"}");
        code(call("ge-a-owner", patch(url(a) + "/" + id).content("{\"name\":\"A\"}")), 428, "PRECONDITION_REQUIRED");
        code(call("ge-a-owner", delete(url(a) + "/" + id)), 428, "PRECONDITION_REQUIRED");
        String v0 = etagOf("ge-a-owner", a, id);
        status(call("ge-a-owner", patch(url(a) + "/" + id).content("{\"name\":\"B\"}"), v0), 200);
        MvcResult stale = call("ge-a-owner", patch(url(a) + "/" + id).content("{\"name\":\"C\"}"), v0);
        code(stale, 412, "PRECONDITION_FAILED");
        assertThat(stale.getResponse().getContentAsString()).contains("currentVersion");
        assertThat(groups.findByOrgIdAndId(a.getId(), id).orElseThrow().getName()).isEqualTo("B");
    }

    @Test
    void anOrganizationOutsideTheFlagKeepsTheOriginalBehaviourAndHasNoNewReads() throws Exception {
        long id = create("ge-l-owner", legacy, "{\"name\":\"Cohort\"}");
        status(call("ge-l-owner", patch(url(legacy) + "/" + id).content("{\"name\":\"Cohort 2\"}")), 200); // no If-Match needed
        generic404(call("ge-l-owner", get(url(legacy) + "/directory")), "directory outside the flag");
        generic404(call("ge-l-owner", get(url(legacy) + "/structure")), "structure outside the flag");
        generic404(call("ge-l-owner", get(url(legacy) + "/" + id)), "detail outside the flag");
        status(call("ge-l-owner", delete(url(legacy) + "/" + id)), 204);
    }

    // ---- moving people -----------------------------------------------------------------------------------------------------

    @Test
    void movingReportsEveryRowAndSkipsPeopleWhoLeftOrCannotBeFound() throws Exception {
        long team = create("ge-a-owner", a, "{\"name\":\"Movers\"}");
        OrgMember ok = person(a, "ge-mv-ok");
        OrgMember again = person(a, "ge-mv-again");
        OrgMember left = fx.seat(a, "ge-mv-left", OrgRole.MEMBER, OrgMemberStatus.LEFT);
        status(call("ge-a-owner", post(url(a) + "/" + team + "/members").content(ids(again))), 200);
        long before = auditCount(a);
        MvcResult r = call("ge-a-owner", post(url(a) + "/" + team + "/members").content("{\"memberIds\":[" + ok.getId() + "," + again.getId() + "," + left.getId() + ",99999999," + ok.getId() + "]}"));
        status(r, 200);
        JsonNode out = body(r);
        assertThat(out.path("moved").asInt()).isEqualTo(1);
        assertThat(out.path("unchanged").asInt()).isEqualTo(1);
        assertThat(out.path("skipped").asInt()).isEqualTo(2);
        assertThat(out.path("results").size()).as("duplicate ids collapse").isEqualTo(4);
        OrgAuditAsserts.assertOneNewRow(audit, a.getId(), before, OrgAuditService.GROUP_MOVE);
        // validation
        code(call("ge-a-owner", post(url(a) + "/" + team + "/members").content("{\"memberIds\":[]}")), 422, "ORG_INVALID");
        List<String> many = new ArrayList<>();
        for (int i = 0; i < 501; i++) many.add(String.valueOf(i + 1));
        code(call("ge-a-owner", post(url(a) + "/" + team + "/members").content("{\"memberIds\":[" + String.join(",", many) + "]}")), 422, "ORG_INVALID");
    }

    @Test
    void movingAPersonToADepartmentDropsATeamThatBelongsToAnotherOne() throws Exception {
        long d1 = create("ge-a-owner", a, "{\"name\":\"D1\",\"kind\":\"DEPARTMENT\"}");
        long d2 = create("ge-a-owner", a, "{\"name\":\"D2\",\"kind\":\"DEPARTMENT\"}");
        long team = create("ge-a-owner", a, "{\"name\":\"In D1\",\"parentGroupId\":" + d1 + "}");
        OrgMember m = person(a, "ge-switch");
        status(call("ge-a-owner", post(url(a) + "/" + team + "/members").content(ids(m))), 200);
        status(call("ge-a-owner", post(url(a) + "/" + d2 + "/members").content(ids(m))), 200);
        OrgMember r = reload(m);
        assertThat(r.getDepartmentGroupId()).isEqualTo(d2);
        assertThat(r.getTeamGroupId()).as("their team is in the other department").isNull();
        // removing from a group clears just that placement
        status(call("ge-a-owner", delete(url(a) + "/" + d2 + "/members/" + m.getId())), 204);
        assertThat(reload(m).getDepartmentGroupId()).isNull();
        status(call("ge-a-owner", delete(url(a) + "/" + d2 + "/members/" + m.getId())), 204); // idempotent
        generic404(call("ge-a-owner", delete(url(a) + "/" + d2 + "/members/99999999")), "unknown person");
    }

    @Test
    void aLeadChangeIsAuditedAsMediumRiskAndAFieldEditAsLow() throws Exception {
        OrgMember lead = person(a, "ge-new-lead");
        long id = create("ge-a-owner", a, "{\"name\":\"Audited\"}");
        long before = auditCount(a);
        status(call("ge-a-owner", patch(url(a) + "/" + id).content("{\"leadMemberId\":" + lead.getId() + "}"), etagOf("ge-a-owner", a, id)), 200);
        OrgAuditEvent leadRow = OrgAuditAsserts.assertOneNewRow(audit, a.getId(), before, OrgAuditService.GROUP_LEAD);
        assertThat(leadRow.getRisk()).isEqualTo("MEDIUM");
        long mid = auditCount(a);
        status(call("ge-a-owner", patch(url(a) + "/" + id).content("{\"icon\":\"rocket\",\"color\":\"info\",\"status\":\"INACTIVE\"}"), etagOf("ge-a-owner", a, id)), 200);
        OrgAuditEvent edit = OrgAuditAsserts.assertOneNewRow(audit, a.getId(), mid, OrgAuditService.GROUP_UPDATE);
        assertThat(edit.getDetails()).isEqualTo("fields=status,icon,color");
        assertThat(edit.getRisk()).isEqualTo("LOW");
        // an inactive group takes nobody
        code(call("ge-a-owner", post(url(a) + "/" + id + "/members").content(ids(lead))), 409, "GROUP_INACTIVE");
        // closed pickers
        code(call("ge-a-owner", patch(url(a) + "/" + id).content("{\"icon\":\"skull\"}"), etagOf("ge-a-owner", a, id)), 422, "ORG_INVALID");
        code(call("ge-a-owner", patch(url(a) + "/" + id).content("{\"color\":\"#ff0000\"}"), etagOf("ge-a-owner", a, id)), 422, "ORG_INVALID");
        // clearing the lead
        status(call("ge-a-owner", patch(url(a) + "/" + id).content("{\"clearLead\":true}"), etagOf("ge-a-owner", a, id)), 200);
        assertThat(groups.findByOrgIdAndId(a.getId(), id).orElseThrow().getLeadMemberId()).isNull();
    }

    // ---- directory, structure, detail ------------------------------------------------------------------------------

    @Test
    void theDirectoryFiltersSortsPagesAndCountsHonestly() throws Exception {
        OrgMember l1 = person(a, "ge-dir-lead");
        long consulting = create("ge-a-owner", a, "{\"name\":\"Consulting\",\"kind\":\"DEPARTMENT\",\"leadMemberId\":" + l1.getId() + "}");
        long marketing = create("ge-a-owner", a, "{\"name\":\"Marketing\",\"kind\":\"DEPARTMENT\"}");
        long east = create("ge-a-owner", a, "{\"name\":\"East\",\"parentGroupId\":" + consulting + "}");
        create("ge-a-owner", a, "{\"name\":\"West\",\"parentGroupId\":" + consulting + ",\"status\":\"INACTIVE\"}");
        create("ge-a-owner", a, "{\"name\":\"Floating\"}");
        OrgMember p1 = person(a, "ge-dir-1");
        OrgMember p2 = person(a, "ge-dir-2");
        OrgMember p3 = person(a, "ge-dir-3");
        status(call("ge-a-owner", post(url(a) + "/" + east + "/members").content(ids(p1, p2))), 200);
        status(call("ge-a-owner", post(url(a) + "/" + marketing + "/members").content(ids(p3))), 200);

        JsonNode all = body(call("ge-a-owner", get(url(a) + "/directory?size=2&page=0&sort=name")));
        assertThat(all.path("total").asInt()).isEqualTo(5);
        assertThat(all.path("items").size()).isEqualTo(2);
        JsonNode s = all.path("summary");
        assertThat(s.path("departments").asInt()).isEqualTo(2);
        assertThat(s.path("teams").asInt()).as("the inactive team is not counted").isEqualTo(2);
        assertThat(s.path("inactive").asInt()).isEqualTo(1);
        assertThat(s.path("departmentLeads").asInt()).isEqualTo(1);
        assertThat(s.path("teamMembers").asInt()).isEqualTo(2);
        assertThat(s.path("averageTeamSize").asDouble()).isEqualTo(1.0); // (2 + 0) / 2 active teams
        assertThat(s.path("employees").asInt()).as("every active person of the organization: owner, HR, consultant, manager, the lead and three more").isEqualTo(8);
        assertThat(s.path("unplaced").asInt()).as("placed = the lead is not placed, the 3 are: 8 - 3").isEqualTo(5);
    }

    @Test
    void theDirectoryFiltersByKindDepartmentStatusAndSearch() throws Exception {
        long consulting = create("ge-a-owner", a, "{\"name\":\"Consulting\",\"kind\":\"DEPARTMENT\"}");
        create("ge-a-owner", a, "{\"name\":\"East\",\"parentGroupId\":" + consulting + "}");
        create("ge-a-owner", a, "{\"name\":\"West\",\"parentGroupId\":" + consulting + ",\"status\":\"INACTIVE\"}");
        create("ge-a-owner", a, "{\"name\":\"Floating\"}");
        assertThat(body(call("ge-a-owner", get(url(a) + "/directory?kind=TEAM"))).path("total").asInt()).isEqualTo(3);
        assertThat(body(call("ge-a-owner", get(url(a) + "/directory?departmentId=" + consulting))).path("total").asInt()).isEqualTo(2);
        assertThat(body(call("ge-a-owner", get(url(a) + "/directory?status=INACTIVE"))).path("items").get(0).path("name").asText()).isEqualTo("West");
        assertThat(body(call("ge-a-owner", get(url(a) + "/directory?q=flo"))).path("total").asInt()).isEqualTo(1);
        assertThat(body(call("ge-a-owner", get(url(a) + "/directory?sort=name&dir=desc"))).path("items").get(0).path("name").asText()).isEqualTo("West");
        assertThat(body(call("ge-a-owner", get(url(a) + "/directory?size=1000"))).path("size").asInt()).as("the page size is capped").isEqualTo(100);
    }

    @Test
    void theStructureNestsTeamsUnderDepartmentsAndListsTheRest() throws Exception {
        long dept = create("ge-a-owner", a, "{\"name\":\"Delivery\",\"kind\":\"DEPARTMENT\"}");
        create("ge-a-owner", a, "{\"name\":\"Bench\",\"parentGroupId\":" + dept + "}");
        create("ge-a-owner", a, "{\"name\":\"Loose team\"}");
        create("ge-a-owner", a, "{\"name\":\"Cohort 26\",\"kind\":\"COHORT\"}");
        JsonNode tree = body(call("ge-a-owner", get(url(a) + "/structure")));
        assertThat(tree.path("organizationName").asText()).isNotBlank();
        assertThat(tree.path("departments").size()).isEqualTo(1);
        assertThat(tree.path("departments").get(0).path("teams").get(0).path("name").asText()).isEqualTo("Bench");
        assertThat(tree.path("unassignedTeams").get(0).path("name").asText()).isEqualTo("Loose team");
        assertThat(tree.path("cohorts").get(0).path("name").asText()).isEqualTo("Cohort 26");
    }

    @Test
    void theDetailListsThePeopleLeadFirstAndAnAdminSeesAllOfThem() throws Exception {
        OrgMember lead = person(a, "ge-det-lead");
        OrgMember p = person(a, "ge-det-p");
        long team = create("ge-a-owner", a, "{\"name\":\"Detail\",\"leadMemberId\":" + lead.getId() + "}");
        status(call("ge-a-owner", post(url(a) + "/" + team + "/members").content(ids(p, lead))), 200);
        JsonNode d = body(call("ge-a-owner", get(url(a) + "/" + team)));
        assertThat(d.path("membersTotal").asInt()).isEqualTo(2);
        assertThat(d.path("members").get(0).path("lead").asBoolean()).isTrue();
        assertThat(d.path("group").path("lead").path("memberId").asLong()).isEqualTo(lead.getId());
        assertThat(d.toString()).as("never a login or email").doesNotContain("@example.com");
    }

    // ---- the scope directory ---------------------------------------------------------------------------------------

    @Test
    void theRealScopeDirectoryGrantsTeamAndDepartmentScopeThroughLeadsAndTheTree() throws Exception {
        OrgMember iyer = person(a, "ge-iyer"); // leads the team, has no team link of their own
        OrgMember mate = person(a, "ge-mate");
        OrgMember deptLead = person(a, "ge-deptlead");
        OrgMember inSiblingTeam = person(a, "ge-sibling");
        OrgMember outsider = person(a, "ge-outsider");
        long dept = create("ge-a-owner", a, "{\"name\":\"Delivery\",\"kind\":\"DEPARTMENT\",\"leadMemberId\":" + deptLead.getId() + "}");
        long team = create("ge-a-owner", a, "{\"name\":\"Bench\",\"parentGroupId\":" + dept + ",\"leadMemberId\":" + iyer.getId() + "}");
        long sibling = create("ge-a-owner", a, "{\"name\":\"Mobile\",\"parentGroupId\":" + dept + "}");
        status(call("ge-a-owner", post(url(a) + "/" + team + "/members").content(ids(mate, aManager))), 200);
        status(call("ge-a-owner", post(url(a) + "/" + sibling + "/members").content(ids(inSiblingTeam))), 200);
        em.flush();
        em.clear();

        OrgMembership manager = new OrgMembership(a.getId(), aManager.getId(), aManager.getUserId(), "ge-a-manager", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
        assertThat(evaluator.inScope(manager, PermissionScope.TEAM, iyer.getId())).as("the lead of my team is in my team").isTrue();
        assertThat(evaluator.inScope(manager, PermissionScope.TEAM, mate.getId())).isTrue();
        assertThat(evaluator.inScope(manager, PermissionScope.TEAM, inSiblingTeam.getId())).isFalse();
        assertThat(evaluator.inScope(manager, PermissionScope.DEPARTMENT, inSiblingTeam.getId())).as("the sibling team is in my department").isTrue();
        assertThat(evaluator.inScope(manager, PermissionScope.DEPARTMENT, deptLead.getId())).as("the department's lead is in it").isTrue();
        assertThat(evaluator.inScope(manager, PermissionScope.DEPARTMENT, outsider.getId())).isFalse();

        OrgMembership lead = new OrgMembership(a.getId(), iyer.getId(), iyer.getUserId(), "ge-iyer", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
        assertThat(evaluator.inScope(lead, PermissionScope.TEAM, mate.getId())).as("a lead reaches the team they lead").isTrue();
        assertThat(evaluator.inScope(lead, PermissionScope.TEAM, inSiblingTeam.getId())).isFalse();
        OrgMembership boss = new OrgMembership(a.getId(), deptLead.getId(), deptLead.getUserId(), "ge-deptlead", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
        assertThat(evaluator.inScope(boss, PermissionScope.DEPARTMENT, mate.getId())).isTrue();
        assertThat(evaluator.inScope(boss, PermissionScope.DEPARTMENT, inSiblingTeam.getId())).isTrue();
        assertThat(evaluator.inScope(boss, PermissionScope.DEPARTMENT, outsider.getId())).isFalse();
        assertThat(evaluator.inScope(boss, PermissionScope.TEAM, mate.getId())).as("TEAM is narrower: they lead no team").isFalse();

        // another organization's person is outside every scope, even for the organization's own owner
        OrgMembership owner = new OrgMembership(a.getId(), aOwner.getId(), aOwner.getUserId(), "ge-a-owner", OrgRole.OWNER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
        assertThat(evaluator.inScope(owner, PermissionScope.ORG, bOwner.getId())).isFalse();
        assertThat(OrgGroupKind.values()).contains(OrgGroupKind.TEAM);
    }
}
