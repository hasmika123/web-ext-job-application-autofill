package com.dossier.api.service.ent.authz;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.IntegrationTest;
import com.dossier.api.config.OrgPermissionInterceptor;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgAssignment;
import com.dossier.api.domain.enumeration.AssignmentHealth;
import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgAssignmentRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgFeatureFlag;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import jakarta.persistence.EntityManager;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerMapping;

/**
 * X1.7 against MySQL with the real beans: assignments are "effective" only while started, not ended and healthy, in THEIR
 * organization; TEAM and DEPARTMENT read the real groups; a member of another organization is outside every scope; the state of
 * the organization is enforced; and the interceptor wired with the real service turns all of it into the same generic 404 for
 * outsiders. Roles come from role DATA here (the roles flag is on), the AC's marketing specialist is a real {@code MARKETER} seat
 * mirrored to MARKETING_SPECIALIST.
 */
@IntegrationTest
@Transactional
class AuthorizationServiceIT {

    private static final String WHO = "authz-it";

    @Autowired private AuthorizationService authorization;
    @Autowired private OrgAccessService access;
    @Autowired private OrgRoleService roleService;
    @Autowired private OrgAssignments assignments;
    @Autowired private OrgAssignmentRepository assignmentRepository;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgGroupRepository groups;
    @Autowired private UserRepository users;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private EnterpriseFeatureFlag enterpriseFlag;
    @Autowired private ScopeEvaluator evaluator;
    @Autowired private EntityManager em;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private OrgMember sarah; // A: marketing specialist
    private OrgMember anika; // A: consultant (MEMBER seat)
    private OrgMember priya; // A: another consultant
    private OrgMember owner; // A: owner
    private OrgMember bob; // B: a consultant of the OTHER organization
    private OrgMember bobsOwner; // B: owner

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        a = fx.org("az-a-" + System.nanoTime(), OrgStatus.ACTIVE);
        b = fx.org("az-b-" + System.nanoTime(), OrgStatus.ACTIVE);
        owner = sync(fx.active(a, "az-a-owner", OrgRole.OWNER));
        sarah = sync(fx.active(a, "az-a-sarah", OrgRole.MARKETER));
        anika = sync(fx.active(a, "az-a-anika", OrgRole.MEMBER));
        priya = sync(fx.active(a, "az-a-priya", OrgRole.MEMBER));
        bobsOwner = sync(fx.active(b, "az-b-owner", OrgRole.OWNER));
        bob = sync(fx.active(b, "az-b-bob", OrgRole.MEMBER));
        flags(true);
    }

    @AfterEach
    void clean() {
        SecurityContextHolder.clearContext();
        em.clear();
        for (AppSetting s : rows.findAll()) if (WHO.equals(s.getUpdatedBy())) rows.delete(s);
        cache.invalidate();
    }

    private OrgMember sync(OrgMember seat) {
        roleService.syncFromLegacy(seat);
        return seat;
    }

    private void flags(boolean on) {
        for (AppSetting s : rows.findAll()) if (WHO.equals(s.getUpdatedBy())) rows.delete(s);
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":" + on + "}", WHO, Instant.now()));
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":" + on + "}", WHO, Instant.now()));
        cache.invalidate();
    }

    private void signIn(String login, String... authorities) {
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(login, null, java.util.Arrays.stream(authorities).map(SimpleGrantedAuthority::new).toList())
        );
    }

    private OrgAssignment assign(Organization org, OrgMember assignee, OrgMember consultant, AssignmentKind kind, Instant starts, Instant ends, AssignmentHealth health) {
        OrgAssignment x = new OrgAssignment();
        x.setOrgId(org.getId());
        x.setAssigneeMemberId(assignee.getId());
        x.setConsultantMemberId(consultant.getId());
        x.setKind(kind);
        x.setStartsAt(starts);
        x.setEndsAt(ends);
        x.setHealth(health);
        x.setCreatedByMemberId(assignee.getId());
        return assignmentRepository.saveAndFlush(x);
    }

    private OrgAssignment assign(OrgMember assignee, OrgMember consultant, AssignmentKind kind) {
        return assign(a, assignee, consultant, kind, Instant.now().minus(Duration.ofDays(1)), null, AssignmentHealth.OK);
    }

    private AuthzRequest read(Organization org, Long target, String... keys) {
        return AuthzRequest.of(org.getId(), List.of(keys), target == null ? Beneficiary.NONE : Beneficiary.PATH_MEMBER, target, AuthzOperation.READ);
    }

    private AuthzRequest write(Organization org, Long target, String... keys) {
        return AuthzRequest.of(org.getId(), List.of(keys), target == null ? Beneficiary.NONE : Beneficiary.PATH_MEMBER, target, AuthzOperation.WRITE);
    }

    // ---- "effective" is one definition ------------------------------------------------------------------------------

    @Test
    void anAssignmentGrantsOnlyWhileItIsStartedNotEndedAndHealthy() {
        Instant now = Instant.now();
        assign(a, sarah, anika, AssignmentKind.PRIMARY, now.minus(Duration.ofDays(30)), now.minus(Duration.ofDays(1)), AssignmentHealth.OK); // ended
        assertThat(assignments.isActingFor(a.getId(), sarah.getId(), anika.getId(), AssignmentKind.ACTING)).as("ended").isFalse();

        assign(a, sarah, priya, AssignmentKind.PRIMARY, now.plus(Duration.ofDays(2)), null, AssignmentHealth.OK); // scheduled handover
        assertThat(assignments.isActingFor(a.getId(), sarah.getId(), priya.getId(), AssignmentKind.ACTING)).as("not started").isFalse();

        OrgAssignment unhealthy = assign(a, sarah, anika, AssignmentKind.BACKUP, now.minus(Duration.ofDays(1)), null, AssignmentHealth.ROLE_LOST);
        assertThat(assignments.isActingFor(a.getId(), sarah.getId(), anika.getId(), AssignmentKind.ACTING)).as("ROLE_LOST").isFalse();

        unhealthy.setHealth(AssignmentHealth.OK);
        assignmentRepository.saveAndFlush(unhealthy);
        assertThat(assignments.isActingFor(a.getId(), sarah.getId(), anika.getId(), AssignmentKind.ACTING)).as("healthy and open").isTrue();
        assertThat(assignments.isActingFor(a.getId(), sarah.getId(), anika.getId(), List.of(AssignmentKind.PRIMARY))).as("a BACKUP row is not a PRIMARY row").isFalse();
        assertThat(assignments.isActingFor(a.getId(), sarah.getId(), anika.getId(), List.of())).isFalse();
        assertThat(assignments.isAssignedToAny(a.getId(), List.of(), anika.getId(), AssignmentKind.ACTING)).as("no assignees, no query, no grant").isFalse();
        assertThat(assignments.isAssignedToAny(a.getId(), List.of(owner.getId(), sarah.getId()), anika.getId(), AssignmentKind.ACTING)).isTrue();
        assertThat(assignments.isAssignedToAny(null, List.of(sarah.getId()), anika.getId(), AssignmentKind.ACTING)).isFalse();
    }

    @Test
    void anAssignmentOfAnotherOrganizationGrantsNothingHere() {
        // a stray row stamped with organization B that names A's two members (the FKs cannot forbid it, the queries must)
        assign(b, sarah, anika, AssignmentKind.PRIMARY, Instant.now().minus(Duration.ofDays(1)), null, AssignmentHealth.OK);
        assertThat(assignments.isActingFor(a.getId(), sarah.getId(), anika.getId(), AssignmentKind.ACTING)).isFalse();
        assertThat(assignments.isActingFor(b.getId(), sarah.getId(), anika.getId(), AssignmentKind.ACTING)).as("it is B's row, in B").isTrue();
        assertThat(assignmentRepository.countByOrgId(a.getId())).isZero();
        assertThat(assignmentRepository.countByOrgId(b.getId())).isEqualTo(1);
        // and the same row does not open the door in A's authorization either
        signIn("az-a-sarah");
        assertThat(authorization.authorize(read(a, anika.getId(), "consultants.view")).reason()).isEqualTo(AuthzReason.NOT_ASSIGNED);
    }

    // ---- the acceptance cases, against real role data -------------------------------------------------------------

    @Test
    void aMarketingSpecialistReadsOnlyConsultantsWithAnOpenAssignment() {
        signIn("az-a-sarah");
        OrgAssignment row;
        AuthzDecision none = authorization.authorize(read(a, anika.getId(), "consultants.view"));
        assertThat(none.reason()).as("no assignment").isEqualTo(AuthzReason.NOT_ASSIGNED);
        assertThatThrownBy(() -> authorization.require(read(a, anika.getId(), "consultants.view"))).isInstanceOf(OrgNotFoundException.class);

        row = assign(sarah, anika, AssignmentKind.PRIMARY);
        AuthzDecision open = authorization.authorize(read(a, anika.getId(), "consultants.view"));
        assertThat(open.allowed()).as("open PRIMARY").isTrue();
        assertThat(open.membership().roles()).extracting(r -> r.key()).as("read from role data").containsExactly("MARKETING_SPECIALIST");
        assertThat(open.scopes()).containsEntry("consultants.view", PermissionScope.ASSIGNED);
        assertThat(authorization.authorize(read(a, priya.getId(), "consultants.view")).reason()).as("her other colleague is not hers").isEqualTo(AuthzReason.NOT_ASSIGNED);

        row.setEndsAt(Instant.now().minusSeconds(1));
        assignmentRepository.saveAndFlush(row);
        assertThat(authorization.authorize(read(a, anika.getId(), "consultants.view")).reason()).as("ended").isEqualTo(AuthzReason.NOT_ASSIGNED);
    }

    @Test
    void actingForNeedsAnActingAssignmentEvenWithTheScope() {
        signIn("az-a-sarah");
        assign(sarah, anika, AssignmentKind.MANAGER); // a MANAGER row does not count for ASSIGNED scope or acting
        assertThat(authorization.authorize(write(a, anika.getId(), "submissions.prepare")).reason()).isEqualTo(AuthzReason.NOT_ASSIGNED);
        assign(sarah, anika, AssignmentKind.DELEGATE);
        assertThat(authorization.authorize(write(a, anika.getId(), "submissions.prepare")).allowed()).isTrue();
    }

    @Test
    void theOwnerReadsAnyMemberOfHisOrgAndNobodyOfAnother() {
        signIn("az-a-owner");
        assertThat(authorization.authorize(read(a, anika.getId(), "consultants.view")).allowed()).isTrue();
        assertThat(authorization.authorize(read(a, bob.getId(), "consultants.view")).reason()).as("B's member through A's route").isEqualTo(AuthzReason.OUT_OF_SCOPE);
        assertThat(authorization.authorize(write(a, bob.getId(), "consultants.edit")).reason()).isEqualTo(AuthzReason.OUT_OF_SCOPE);
        // the same ids through B's organization: A's owner is no member of it
        assertThat(authorization.authorize(read(b, bob.getId(), "consultants.view")).reason()).isEqualTo(AuthzReason.NOT_MEMBER);
    }

    // ---- TEAM and DEPARTMENT over the real groups -------------------------------------------------------------------

    private OrgGroup group(Organization org, String name, OrgGroupKind kind) {
        OrgGroup g = new OrgGroup();
        g.setOrgId(org.getId());
        g.setName(name);
        g.setKind(kind);
        return groups.saveAndFlush(g);
    }

    private void putIn(OrgMember m, OrgGroup g) {
        m.setGroupId(g.getId());
        members.saveAndFlush(m);
    }

    @Test
    void teamAndDepartmentScopeFollowTheMembersGroupAndItsKind() {
        OrgGroup team = group(a, "Bench team", OrgGroupKind.TEAM);
        OrgGroup cohort = group(a, "Cohort 1", OrgGroupKind.COHORT);
        OrgGroup dept = group(a, "Delivery", OrgGroupKind.DEPARTMENT);
        OrgGroup foreignTeam = group(b, "Their team", OrgGroupKind.TEAM);
        putIn(sarah, team);
        putIn(anika, team);
        putIn(priya, cohort);
        OrgMember teamless = sync(fx.active(a, "az-a-teamless", OrgRole.MEMBER));
        OrgMember deptMate = sync(fx.active(a, "az-a-deptmate", OrgRole.MEMBER));
        putIn(deptMate, dept);
        em.flush();
        em.clear();

        signIn("az-a-sarah");
        OrgMembership me = access.requireMember(a.getId());
        assertThat(evaluator.inScope(me, PermissionScope.TEAM, anika.getId())).as("same TEAM group").isTrue();
        assertThat(evaluator.inScope(me, PermissionScope.TEAM, priya.getId())).as("a COHORT is not a team").isFalse();
        assertThat(evaluator.inScope(me, PermissionScope.TEAM, teamless.getId())).isFalse();
        assertThat(evaluator.inScope(me, PermissionScope.DEPARTMENT, deptMate.getId())).as("I am in no department: nothing is in my department").isFalse();
        assertThat(evaluator.inScope(me, PermissionScope.TEAM, bob.getId())).as("another organization").isFalse();
        assertThat(evaluator.inScope(me, PermissionScope.ORG, bob.getId())).as("ORG stops at the tenant").isFalse();
        assertThat(evaluator.inScope(me, PermissionScope.ORG, teamless.getId())).isTrue();
        assertThat(foreignTeam.getId()).isNotEqualTo(team.getId());

        // a member of the department sees his department mates
        signIn("az-a-deptmate");
        OrgMembership dm = access.requireMember(a.getId());
        OrgMember deptMate2 = sync(fx.active(a, "az-a-deptmate2", OrgRole.MEMBER));
        putIn(deptMate2, dept);
        assertThat(evaluator.inScope(dm, PermissionScope.DEPARTMENT, deptMate2.getId())).isTrue();
        assertThat(evaluator.inScope(dm, PermissionScope.DEPARTMENT, anika.getId())).isFalse();
        assertThat(evaluator.inScope(dm, PermissionScope.TEAM, deptMate2.getId())).as("TEAM is narrower than DEPARTMENT").isFalse();
    }

    @Test
    void anErasedMemberIsInNoScope() {
        signIn("az-a-owner");
        anika.setStatus(OrgMemberStatus.ERASED);
        anika.setUserId(null);
        members.saveAndFlush(anika);
        assertThat(authorization.authorize(read(a, anika.getId(), "consultants.view")).reason()).isEqualTo(AuthzReason.OUT_OF_SCOPE);
    }

    // ---- organization state ---------------------------------------------------------------------------------------

    private void setStatus(Organization org, OrgStatus status) {
        org.setStatus(status);
        orgs.saveAndFlush(org);
    }

    @Test
    void aSuspendedOrganizationRefusesWritesAndPastDueStillReads() {
        signIn("az-a-owner");
        assertThat(authorization.authorize(write(a, null, "org.settings.manage")).allowed()).isTrue();

        setStatus(a, OrgStatus.PAST_DUE);
        assertThat(authorization.authorize(read(a, null, "reports.view")).allowed()).as("PAST_DUE reads").isTrue();
        assertThat(authorization.authorize(write(a, null, "billing.manage")).allowed()).as("PAST_DUE may pay").isTrue();
        assertThat(authorization.authorize(write(a, null, "org.settings.manage")).reason()).isEqualTo(AuthzReason.ORG_INACTIVE);

        setStatus(a, OrgStatus.SUSPENDED);
        AuthzDecision refused = authorization.authorize(write(a, null, "org.settings.manage"));
        assertThat(refused.reason()).isEqualTo(AuthzReason.ORG_INACTIVE);
        assertThatThrownBy(() -> authorization.require(write(a, null, "org.settings.manage"))).isInstanceOf(OrgNotFoundException.class);
        AuthzRequest closeIt = write(a, null, "org.close").withStateAction(true);
        assertThatThrownBy(() -> authorization.require(closeIt)).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("ORG_STATE");
        });
        assertThat(authorization.authorize(read(a, null, "billing.view")).allowed()).as("reads stay open").isTrue();
    }

    // ---- hostile callers through the interceptor wired with the real service ----------------------------------------

    static class Controller {

        @OrgPermissionRequired(value = OrgPermission.MEMBER_VIEW_SUMMARY, beneficiary = com.dossier.api.service.ent.authz.Beneficiary.PATH_MEMBER)
        public void viewMember() {}

        @OrgPermissionRequired(OrgPermission.REPORTS_VIEW)
        public void reports() {}
    }

    private OrgPermissionInterceptor interceptor() {
        OrgFeatureFlag orgFlag = mock(OrgFeatureFlag.class);
        when(orgFlag.isEnabled()).thenReturn(true);
        return new OrgPermissionInterceptor(access, orgFlag, enterpriseFlag, authorization);
    }

    private boolean call(String handler, Organization org, String memberId) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/orgs/" + org.getId() + "/members/" + memberId);
        Map<String, String> vars = memberId == null ? Map.of("orgId", String.valueOf(org.getId())) : Map.of("orgId", String.valueOf(org.getId()), "memberId", memberId);
        req.setAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE, vars);
        return interceptor().preHandle(req, new MockHttpServletResponse(), new HandlerMethod(new Controller(), Controller.class.getMethod(handler)));
    }

    @Test
    void outsidersAreTheSame404WhoeverTheyAreAndTheOwnerGetsThrough() throws Exception {
        for (String login : new String[] { "az-b-owner", "az-b-bob", "ghost-login" }) {
            signIn(login);
            assertThatThrownBy(() -> call("viewMember", a, String.valueOf(anika.getId()))).as(login).isInstanceOf(OrgNotFoundException.class);
            assertThatThrownBy(() -> call("reports", a, null)).as(login).isInstanceOf(OrgNotFoundException.class);
        }
        signIn("az-b-owner", "ROLE_ADMIN", "ROLE_USER"); // a platform admin who is a member of B only
        assertThatThrownBy(() -> call("viewMember", a, String.valueOf(anika.getId()))).isInstanceOf(OrgNotFoundException.class);

        signIn("az-a-owner");
        assertThat(call("viewMember", a, String.valueOf(anika.getId()))).isTrue();
        assertThat(call("reports", a, null)).isTrue();
        // A's owner naming B's member through A's route, and through B's route
        assertThatThrownBy(() -> call("viewMember", a, String.valueOf(bob.getId()))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> call("viewMember", b, String.valueOf(bob.getId()))).isInstanceOf(OrgNotFoundException.class);
        // an ordinary member lacks the permission; a marketer without the assignment is refused, with it she gets through
        signIn("az-a-anika");
        assertThatThrownBy(() -> call("reports", a, null)).isInstanceOf(OrgNotFoundException.class);
        signIn("az-a-sarah");
        assertThatThrownBy(() -> call("viewMember", a, String.valueOf(anika.getId()))).isInstanceOf(OrgNotFoundException.class);
        assign(sarah, anika, AssignmentKind.PRIMARY);
        assertThat(call("viewMember", a, String.valueOf(anika.getId()))).isTrue();
        assertThatThrownBy(() -> call("viewMember", a, String.valueOf(priya.getId()))).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void withTheEnterpriseFlagOffTheSameInterceptorUsesTheLegacyChecksAndIgnoresBeneficiaries() throws Exception {
        flags(false);
        signIn("az-a-sarah");
        // legacy: a MARKETER holds member.view_summary; the beneficiary and the assignment are not consulted at all
        assertThat(call("viewMember", a, String.valueOf(anika.getId()))).isTrue();
        assertThat(call("viewMember", a, "not-a-number")).as("legacy never parses the member id").isTrue();
        signIn("az-b-owner");
        assertThatThrownBy(() -> call("viewMember", a, String.valueOf(anika.getId()))).isInstanceOf(OrgNotFoundException.class);
    }
}
