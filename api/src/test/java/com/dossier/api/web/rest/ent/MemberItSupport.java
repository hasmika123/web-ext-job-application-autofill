package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;

import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgAssignment;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgAssignmentRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.org.OrgAuditAsserts;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Shared world of the Employees API tests (X4.3 / X4.4): two organizations with the enterprise and roles flags on, a person for every kind of
 * caller, a department tree, and helpers for calling the API as a login and reading what came back. Subclasses carry the Spring annotations.
 *
 * <p>Organization A: an owner, an administrator, an HR specialist, a marketing manager (TEAM scope, in team T1), a marketing specialist
 * (ASSIGNED scope), two consultants (c1 in team T1, c2 in team T2, c2 assigned to the specialist), a plain member, and the departments D1
 * (teams T1 and T2) and D2, plus T3, a team under no department. Organization B has an owner and a member.
 */
abstract class MemberItSupport {

    static final String WHO = "members-it";
    private static final AtomicInteger SEQ = new AtomicInteger();

    @Autowired protected MockMvc mockMvc;
    @Autowired protected ObjectMapper om;
    @Autowired protected UserRepository users;
    @Autowired protected OrganizationRepository orgs;
    @Autowired protected OrgMemberRepository members;
    @Autowired protected OrgGroupRepository groups;
    @Autowired protected OrgRoleRepository roleRepo;
    @Autowired protected OrgRolePermissionRepository permissionRepo;
    @Autowired protected OrgMemberRoleRepository memberRoleRepo;
    @Autowired protected OrgAssignmentRepository assignments;
    @Autowired protected OrgAuditEventRepository audit;
    @Autowired protected OrgRoleService roleService;
    @Autowired protected AppSettingRepository settingRows;
    @Autowired protected ResumeBuilderSettings settingsCache;
    @Autowired protected EntityManager em;

    protected OrgFixtures fx;
    protected String p;
    protected Organization a;
    protected Organization b;
    protected OrgMember owner;
    protected OrgMember admin;
    protected OrgMember hr;
    protected OrgMember mktMgr;
    protected OrgMember mktSpec;
    protected OrgMember c1;
    protected OrgMember c2;
    protected OrgMember plain;
    protected OrgMember bOwner;
    protected OrgMember bMember;
    protected OrgGroup d1;
    protected OrgGroup d2;
    protected OrgGroup t1;
    protected OrgGroup t2;
    protected OrgGroup t3;

    @BeforeEach
    void seedWorld() {
        p = "m" + SEQ.incrementAndGet() + "x" + (System.nanoTime() % 100000);
        fx = new OrgFixtures(users, orgs, members);
        a = fx.org("mem-a-" + p, OrgStatus.ACTIVE);
        b = fx.org("mem-b-" + p, OrgStatus.ACTIVE);
        owner = person(a, "owner", OrgRole.OWNER, "Olivia", "Owner");
        admin = person(a, "admin", OrgRole.ADMIN, "Adam", "Admin");
        hr = person(a, "hr", OrgRole.STAFF, "Hannah", "Hart");
        mktMgr = person(a, "mgr", OrgRole.MARKETER, "Maria", "Lopez");
        mktSpec = person(a, "spec", OrgRole.MARKETER, "Sam", "Spec");
        c1 = person(a, "c1", OrgRole.MEMBER, "Anika", "Khan");
        c2 = person(a, "c2", OrgRole.MEMBER, "Anita", "Rao");
        plain = person(a, "plain", OrgRole.MEMBER, "Pat", "Plain");
        bOwner = person(b, "bowner", OrgRole.OWNER, "Bo", "Owner");
        bMember = person(b, "bmember", OrgRole.MEMBER, "Bea", "Member");
        for (OrgMember m : List.of(owner, admin, hr, mktMgr, mktSpec, c1, c2, plain, bOwner, bMember)) roleService.syncFromLegacy(m);
        assign(hr, "HR_SPECIALIST");
        assign(mktMgr, "MARKETING_MANAGER");
        assign(mktSpec, "MARKETING_SPECIALIST");
        assign(c1, "CONSULTANT");
        assign(c2, "CONSULTANT");

        d1 = group(a, "Delivery", OrgGroupKind.DEPARTMENT, null);
        d2 = group(a, "People", OrgGroupKind.DEPARTMENT, null);
        t1 = group(a, "Bench NY", OrgGroupKind.TEAM, d1);
        t2 = group(a, "Bench TX", OrgGroupKind.TEAM, d1);
        t3 = group(a, "Floaters", OrgGroupKind.TEAM, null);
        place(mktMgr, d1, t1);
        place(c1, d1, t1);
        place(c2, d1, t2);
        place(hr, d2, null);
        assignment(c2, mktSpec, AssignmentKind.PRIMARY);
        flags(true, true);
        flushIfInTransaction();
    }

    @AfterEach
    void cleanFlags() {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        settingsCache.invalidate();
    }

    /** Flushes the persistence context; a no-op in a test that runs without the class transaction (NOT_SUPPORTED: its fixtures commit as they are written). */
    protected void flushIfInTransaction() {
        if (TestTransaction.isActive()) em.flush();
    }

    protected void flags(boolean master, boolean roles) {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":" + master + "}", WHO, Instant.now()));
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":" + roles + "}", WHO, Instant.now()));
        settingsCache.invalidate();
    }

    // ---- building the world ------------------------------------------------------------------------------------------

    protected String login(String who) {
        return p + "-" + who;
    }

    protected OrgMember person(Organization org, String who, OrgRole role, String first, String last) {
        OrgMember m = fx.active(org, login(who), role);
        User u = users.findById(m.getUserId()).orElseThrow();
        u.setFirstName(first);
        u.setLastName(last);
        users.saveAndFlush(u);
        return m;
    }

    /** Another ACTIVE member of A with this name and legacy role (and the matching role row). */
    protected OrgMember extra(Organization org, String who, OrgRole role, String first, String last) {
        OrgMember m = person(org, who, role, first, last);
        roleService.syncFromLegacy(m);
        return m;
    }

    protected OrgGroup group(Organization org, String name, OrgGroupKind kind, OrgGroup parent) {
        OrgGroup g = new OrgGroup();
        g.setOrgId(org.getId());
        g.setName(name);
        g.setKind(kind);
        if (parent != null) g.setParentGroupId(parent.getId());
        return groups.saveAndFlush(g);
    }

    protected void place(OrgMember m, OrgGroup department, OrgGroup team) {
        m.setDepartmentGroupId(department == null ? null : department.getId());
        m.setTeamGroupId(team == null ? null : team.getId());
        members.saveAndFlush(m);
    }

    /** Replaces the seat's live roles with one system template (primary), mirroring the legacy enum like the real write does. */
    protected void assign(OrgMember seat, String templateKey) {
        assignRole(seat, roleRepo.findSystemByRoleKey(templateKey).orElseThrow());
    }

    /** Replaces the seat's live roles with this one role (primary). */
    protected void assignRole(OrgMember seat, OrgRoleDefinition def) {
        Instant now = Instant.now();
        for (OrgMemberRole r : memberRoleRepo.findLiveByOrgIdAndMemberId(seat.getOrgId(), seat.getId())) {
            r.setPrimary(false);
            r.setEndsAt(now);
            memberRoleRepo.saveAndFlush(r);
        }
        OrgMemberRole row = new OrgMemberRole();
        row.setOrgId(seat.getOrgId());
        row.setMemberId(seat.getId());
        row.setRoleId(def.getId());
        row.setPrimary(true);
        row.setGrantedAt(now);
        memberRoleRepo.saveAndFlush(row);
        seat.setPrimaryRoleId(def.getId());
        seat.setRole(LegacyRoleMirror.forRole(def).orElse(OrgRole.MEMBER));
        members.saveAndFlush(seat);
    }

    /**
     * A person who may do everything an Owner may but is not the Owner (a custom role holding every permission row of the Owner template): the
     * caller the last-owner guard exists for, since the Owner role itself is then the only one of its kind.
     */
    protected OrgMember superActor(String who) {
        OrgRoleDefinition ownerRole = roleRepo.findSystemByRoleKey("OWNER").orElseThrow();
        OrgRoleDefinition custom = new OrgRoleDefinition();
        custom.setOrgId(a.getId());
        custom.setRoleKey("CUSTOM_SUPER_" + p.toUpperCase());
        custom.setName("Super " + p);
        custom = roleRepo.saveAndFlush(custom);
        for (OrgRolePermission r : permissionRepo.findForRoles(a.getId(), List.of(ownerRole.getId()))) {
            permissionRepo.saveAndFlush(new OrgRolePermission(custom.getId(), r.getPermissionKey(), r.getScope(), r.getCeilingRoleKey(), r.getRowFilter()));
        }
        OrgMember seat = extra(a, who, OrgRole.MEMBER, "Super", "Actor");
        assignRole(seat, custom);
        return seat;
    }

    protected void assignment(OrgMember consultant, OrgMember assignee, AssignmentKind kind) {
        OrgAssignment row = new OrgAssignment();
        row.setOrgId(consultant.getOrgId());
        row.setConsultantMemberId(consultant.getId());
        row.setAssigneeMemberId(assignee.getId());
        row.setKind(kind);
        row.setStartsAt(Instant.now().minusSeconds(3600));
        row.setCreatedByMemberId(owner.getId());
        assignments.saveAndFlush(row);
    }

    protected OrgMember seatWithStatus(Organization org, String who, OrgRole role, OrgMemberStatus status) {
        OrgMember m = fx.seat(org, login(who), role, status);
        roleService.syncFromLegacy(m);
        return m;
    }

    // ---- calling -------------------------------------------------------------------------------------------------------

    protected static String membersUrl(Organization o) {
        return "/api/orgs/" + o.getId() + "/members";
    }

    protected static String memberUrl(Organization o, OrgMember m) {
        return membersUrl(o) + "/" + m.getId();
    }

    protected MvcResult call(String login, MockHttpServletRequestBuilder req) throws Exception {
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    protected MvcResult call(String login, MockHttpServletRequestBuilder req, String body) throws Exception {
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON).content(body)).andReturn();
    }

    /** A call with the headers a write needs (If-Match and/or an Idempotency-Key). */
    protected MvcResult call(String login, MockHttpServletRequestBuilder req, String body, String ifMatch, String idempotencyKey) throws Exception {
        req.with(user(login)).contentType(MediaType.APPLICATION_JSON);
        if (body != null) req.content(body);
        if (ifMatch != null) req.header("If-Match", ifMatch);
        if (idempotencyKey != null) req.header("Idempotency-Key", idempotencyKey);
        return mockMvc.perform(req).andReturn();
    }

    protected static String key() {
        return UUID.randomUUID().toString();
    }

    protected JsonNode json(MvcResult r) throws Exception {
        return om.readTree(r.getResponse().getContentAsString());
    }

    protected void assertStatus(MvcResult r, int status) throws Exception {
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(status);
    }

    protected void assertCode(MvcResult r, int status, String code) throws Exception {
        assertStatus(r, status);
        assertThat(r.getResponse().getContentAsString()).as("code").contains("\"code\":\"" + code + "\"");
    }

    protected void assertGeneric404(MvcResult r, String what) throws Exception {
        String text = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + text).isEqualTo(404);
        String lower = text.toLowerCase().replaceAll("\"(instance|path)\":\"[^\"]*\"", "");
        assertThat(lower).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("ceiling").doesNotContain("denied");
    }

    // ---- reading back ----------------------------------------------------------------------------------------------------

    protected OrgMember reload(OrgMember m) {
        flushIfInTransaction();
        if (TestTransaction.isActive()) em.clear();
        return members.findByOrgIdAndId(m.getOrgId(), m.getId()).orElseThrow();
    }

    protected long auditCount(Organization o) {
        flushIfInTransaction();
        return audit.countByOrgId(o.getId());
    }

    protected long auditCount(Organization o, String action) {
        flushIfInTransaction();
        return OrgAuditAsserts.rows(audit, o.getId()).stream().filter(e -> action.equals(e.getAction())).count();
    }

    protected OrgAuditEvent newestAudit(Organization o) {
        flushIfInTransaction();
        return OrgAuditAsserts.rows(audit, o.getId()).get(0);
    }

    /** The ids (as numbers) of the {@code items} of a list response, in order. */
    protected static List<Long> ids(JsonNode page) {
        java.util.ArrayList<Long> out = new java.util.ArrayList<>();
        for (JsonNode n : page.path("items")) out.add(n.path("id").asLong());
        return out;
    }

    protected static List<String> names(JsonNode page) {
        java.util.ArrayList<String> out = new java.util.ArrayList<>();
        for (JsonNode n : page.path("items")) out.add(n.path("name").asText());
        return out;
    }
}
