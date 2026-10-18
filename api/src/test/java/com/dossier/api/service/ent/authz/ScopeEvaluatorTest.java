package com.dossier.api.service.ent.authz;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.service.org.OrgMembership;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Every (scope x relationship) cell of {@code ScopeEvaluator.inScope} (X1.7 acceptance): the actor, a teammate, a member of a
 * sibling team in the same department, someone in the department with no team, someone in another department, consultants
 * assigned to the actor (PRIMARY, BACKUP, DELEGATE) or only managed by them (MANAGER), consultants assigned to a teammate, a
 * sibling team's member, another department's member, a consultant with no relationship, a member of ANOTHER organization, an id
 * nobody has, and null. Then the leads, whose reach comes from leading rather than belonging.
 */
class ScopeEvaluatorTest {

    private static final long ORG = 10L;

    // the people of organization 10
    private static final long ACTOR = 1;
    private static final long TEAMMATE = 2; // team 100, dept 200
    private static final long SIBLING_TEAM_MEMBER = 3; // team 101 (under dept 200)
    private static final long DEPT_ONLY = 4; // dept 200, no team
    private static final long OTHER_DEPT = 5; // team 102, dept 201
    private static final long C_PRIMARY = 6;
    private static final long C_BACKUP = 7;
    private static final long C_DELEGATE = 8;
    private static final long C_MANAGED = 9; // MANAGER kind only
    private static final long C_OF_TEAMMATE = 10;
    private static final long C_OF_SIBLING = 11;
    private static final long C_OF_OTHER_DEPT = 12;
    private static final long C_NOBODY = 13;
    private static final long OUTSIDER = 99; // a member of ANOTHER organization: this directory has no such row
    private static final long UNKNOWN = 12345;

    private final AuthzFakes.Directory directory = new AuthzFakes.Directory()
        .member(ACTOR, 100L, 200L)
        .member(TEAMMATE, 100L, 200L)
        .member(SIBLING_TEAM_MEMBER, 101L, 200L)
        .member(DEPT_ONLY, null, 200L)
        .member(OTHER_DEPT, 102L, 201L)
        .member(C_PRIMARY, null, null)
        .member(C_BACKUP, null, null)
        .member(C_DELEGATE, null, null)
        .member(C_MANAGED, null, null)
        .member(C_OF_TEAMMATE, null, null)
        .member(C_OF_SIBLING, null, null)
        .member(C_OF_OTHER_DEPT, null, null)
        .member(C_NOBODY, null, null)
        .teamUnder(200L, 100L)
        .teamUnder(200L, 101L)
        .teamUnder(201L, 102L);

    private final AuthzFakes.Assignments assignments = new AuthzFakes.Assignments()
        .add(ACTOR, C_PRIMARY, AssignmentKind.PRIMARY)
        .add(ACTOR, C_BACKUP, AssignmentKind.BACKUP)
        .add(ACTOR, C_DELEGATE, AssignmentKind.DELEGATE)
        .add(ACTOR, C_MANAGED, AssignmentKind.MANAGER)
        .add(TEAMMATE, C_OF_TEAMMATE, AssignmentKind.PRIMARY)
        .add(SIBLING_TEAM_MEMBER, C_OF_SIBLING, AssignmentKind.PRIMARY)
        .add(OTHER_DEPT, C_OF_OTHER_DEPT, AssignmentKind.PRIMARY);

    private final ScopeEvaluator evaluator = new ScopeEvaluator(directory, assignments);

    private OrgMembership actor(long id) {
        return AuthzFakes.membership(ORG, id, Map.of("x", PermissionScope.ORG));
    }

    /** relationship name, target id, then expectations for OWN, ASSIGNED, TEAM, DEPARTMENT, ORG in that order. */
    static Stream<Arguments> cells() {
        return Stream.of(
            //          name                          target                OWN    ASSIGNED TEAM   DEPT   ORG
            row("the actor themself", ACTOR, true, true, true, true, true),
            row("a teammate", TEAMMATE, false, false, true, true, true),
            row("a member of a sibling team in my department", SIBLING_TEAM_MEMBER, false, false, false, true, true),
            row("a department member with no team", DEPT_ONLY, false, false, false, true, true),
            row("a member of another department", OTHER_DEPT, false, false, false, false, true),
            row("my PRIMARY consultant", C_PRIMARY, false, true, true, true, true),
            row("my BACKUP consultant", C_BACKUP, false, true, true, true, true),
            row("my DELEGATE consultant", C_DELEGATE, false, true, true, true, true),
            row("a consultant I only MANAGE", C_MANAGED, false, false, false, false, true),
            row("a consultant assigned to a teammate", C_OF_TEAMMATE, false, false, true, true, true),
            row("a consultant assigned to a sibling team's member", C_OF_SIBLING, false, false, false, true, true),
            row("a consultant assigned to another department", C_OF_OTHER_DEPT, false, false, false, false, true),
            row("a consultant nobody holds", C_NOBODY, false, false, false, false, true),
            row("a member of another organization", OUTSIDER, false, false, false, false, false),
            row("an id nobody has", UNKNOWN, false, false, false, false, false)
        );
    }

    private static Arguments row(String name, long target, boolean own, boolean assigned, boolean team, boolean dept, boolean org) {
        return Arguments.of(name, target, own, assigned, team, dept, org);
    }

    @ParameterizedTest(name = "{0}: OWN={2} ASSIGNED={3} TEAM={4} DEPARTMENT={5} ORG={6}")
    @MethodSource("cells")
    void everyScopeAgainstEveryRelationship(String name, long target, boolean own, boolean assigned, boolean team, boolean dept, boolean org) {
        Map<PermissionScope, Boolean> expected = new EnumMap<>(PermissionScope.class);
        expected.put(PermissionScope.OWN, own);
        expected.put(PermissionScope.ASSIGNED, assigned);
        expected.put(PermissionScope.TEAM, team);
        expected.put(PermissionScope.DEPARTMENT, dept);
        expected.put(PermissionScope.ORG, org);
        for (PermissionScope scope : PermissionScope.values()) {
            assertThat(evaluator.inScope(actor(ACTOR), scope, target)).as("%s under %s", name, scope).isEqualTo(expected.get(scope));
        }
    }

    @Test
    void aWiderScopeNeverReachesLessThanANarrowerOne() {
        List<String> violations = new ArrayList<>();
        for (long target : new long[] { ACTOR, TEAMMATE, SIBLING_TEAM_MEMBER, DEPT_ONLY, OTHER_DEPT, C_PRIMARY, C_BACKUP, C_DELEGATE, C_MANAGED, C_OF_TEAMMATE, C_OF_SIBLING, C_OF_OTHER_DEPT, C_NOBODY, OUTSIDER, UNKNOWN }) {
            PermissionScope[] all = PermissionScope.values();
            for (int i = 0; i < all.length - 1; i++) {
                boolean narrow = evaluator.inScope(actor(ACTOR), all[i], target);
                boolean wide = evaluator.inScope(actor(ACTOR), all[i + 1], target);
                if (narrow && !wide) violations.add(all[i] + " reaches " + target + " but " + all[i + 1] + " does not");
            }
        }
        assertThat(violations).isEmpty();
    }

    @Test
    void managerAssignmentsCountOnlyWhenTheCallerAsksForThem() {
        assertThat(evaluator.inScope(actor(ACTOR), PermissionScope.ASSIGNED, C_MANAGED)).isFalse();
        assertThat(evaluator.inScope(actor(ACTOR), PermissionScope.ASSIGNED, C_MANAGED, Set.of(AssignmentKind.MANAGER))).isTrue();
        assertThat(evaluator.inScope(actor(ACTOR), PermissionScope.ASSIGNED, C_PRIMARY, Set.of(AssignmentKind.MANAGER))).as("a PRIMARY row is not a MANAGER row").isFalse();
    }

    @Test
    void failsClosedOnNullsAndUnknownActors() {
        for (PermissionScope scope : PermissionScope.values()) {
            assertThat(evaluator.inScope(actor(ACTOR), scope, null)).as("null target " + scope).isFalse();
            assertThat(evaluator.inScope(null, scope, TEAMMATE)).as("null actor " + scope).isFalse();
        }
        assertThat(evaluator.inScope(actor(ACTOR), null, TEAMMATE)).isFalse();
        // an actor whose own seat is not in the directory has no team and no department: only ORG (and OWN of themself) reach anything
        OrgMembership ghost = actor(777);
        assertThat(evaluator.inScope(ghost, PermissionScope.TEAM, TEAMMATE)).isFalse();
        assertThat(evaluator.inScope(ghost, PermissionScope.DEPARTMENT, TEAMMATE)).isFalse();
        assertThat(evaluator.inScope(ghost, PermissionScope.ASSIGNED, C_PRIMARY)).isFalse();
        assertThat(evaluator.inScope(ghost, PermissionScope.ORG, TEAMMATE)).isTrue();
    }

    @Test
    void anActorOfAnotherOrganizationDoesNotChangeTheAnswersBecauseTheDirectoryIsPerOrganization() {
        // the directory only knows organization 10's rows; a member of organization 11 asking about them gets the same refusals a stranger would
        OrgMembership other = AuthzFakes.membership(11L, 500L, Map.of("x", PermissionScope.ORG));
        assertThat(evaluator.inScope(other, PermissionScope.TEAM, TEAMMATE)).isFalse();
        assertThat(evaluator.inScope(other, PermissionScope.ASSIGNED, C_PRIMARY)).isFalse();
    }

    // ---- leads ------------------------------------------------------------------------------------------------------

    @Test
    void aTeamLeadReachesTheirTeamWithoutBelongingToIt() {
        AuthzFakes.Directory d = new AuthzFakes.Directory()
            .member(20, 300L, null) // the lead, a member of a different team
            .member(21, 301L, null) // a member of the team they lead
            .member(22, 302L, null) // someone else's team
            .leadsTeam(20, 301L);
        AuthzFakes.Assignments a = new AuthzFakes.Assignments().add(21, 23, AssignmentKind.PRIMARY);
        d.member(23, null, null);
        ScopeEvaluator e = new ScopeEvaluator(d, a);
        OrgMembership lead = actor(20);
        assertThat(e.inScope(lead, PermissionScope.TEAM, 21L)).isTrue();
        assertThat(e.inScope(lead, PermissionScope.TEAM, 22L)).isFalse();
        assertThat(e.inScope(lead, PermissionScope.TEAM, 23L)).as("a consultant assigned to a member of the team I lead").isTrue();
        assertThat(e.inScope(lead, PermissionScope.ASSIGNED, 21L)).isFalse();
        assertThat(e.inScope(lead, PermissionScope.OWN, 21L)).isFalse();
    }

    @Test
    void aDepartmentLeadReachesTheDepartmentAndItsTeams() {
        AuthzFakes.Directory d = new AuthzFakes.Directory()
            .member(30, null, null) // the lead, in no department of their own
            .member(31, null, 400L) // in the department
            .member(32, 401L, null) // in a team under the department
            .member(33, 402L, 499L) // another department
            .member(34, null, null)
            .leadsDepartment(30, 400L)
            .teamUnder(400L, 401L);
        AuthzFakes.Assignments a = new AuthzFakes.Assignments().add(32, 34, AssignmentKind.BACKUP);
        ScopeEvaluator e = new ScopeEvaluator(d, a);
        OrgMembership lead = actor(30);
        assertThat(e.inScope(lead, PermissionScope.DEPARTMENT, 31L)).isTrue();
        assertThat(e.inScope(lead, PermissionScope.DEPARTMENT, 32L)).isTrue();
        assertThat(e.inScope(lead, PermissionScope.DEPARTMENT, 34L)).as("assigned to a member of a team under my department").isTrue();
        assertThat(e.inScope(lead, PermissionScope.DEPARTMENT, 33L)).isFalse();
        assertThat(e.inScope(lead, PermissionScope.TEAM, 31L)).as("TEAM is narrower: I lead no team").isFalse();
    }

    @Test
    void theLeadOfMyTeamIsInMyTeamScopeEvenWithoutATeamLink() {
        // X4.5 (acceptance): a Marketing Manager whose team has lead R. Iyer sees Iyer's rows under TEAM scope
        AuthzFakes.Directory d = new AuthzFakes.Directory()
            .member(50, 500L, 600L) // the manager, in team 500
            .member(51, null, null) // R. Iyer: leads team 500 and has no team link of their own
            .member(52, null, null) // leads a team of someone else's
            .leadsTeam(51, 500L)
            .leadsTeam(52, 501L);
        AuthzFakes.Assignments a = new AuthzFakes.Assignments();
        ScopeEvaluator e = new ScopeEvaluator(d, a);
        OrgMembership manager = actor(50);
        assertThat(e.inScope(manager, PermissionScope.TEAM, 51L)).isTrue();
        assertThat(e.inScope(manager, PermissionScope.TEAM, 52L)).as("the lead of another team").isFalse();
        assertThat(e.inScope(manager, PermissionScope.DEPARTMENT, 51L)).as("DEPARTMENT reaches whatever TEAM does").isTrue();
        assertThat(e.inScope(manager, PermissionScope.ASSIGNED, 51L)).isFalse();
    }

    @Test
    void theLeadOfMyDepartmentAndOfATeamInItAreInMyDepartmentScope() {
        AuthzFakes.Directory d = new AuthzFakes.Directory()
            .member(60, null, 700L) // in department 700
            .member(61, null, null) // leads department 700, no department link of their own
            .member(62, null, null) // leads team 701, which sits under department 700
            .member(63, null, null) // leads department 799 (another)
            .leadsDepartment(61, 700L)
            .leadsTeam(62, 701L)
            .leadsDepartment(63, 799L)
            .teamUnder(700L, 701L);
        ScopeEvaluator e = new ScopeEvaluator(d, new AuthzFakes.Assignments());
        OrgMembership member = actor(60);
        assertThat(e.inScope(member, PermissionScope.DEPARTMENT, 61L)).isTrue();
        assertThat(e.inScope(member, PermissionScope.DEPARTMENT, 62L)).isTrue();
        assertThat(e.inScope(member, PermissionScope.DEPARTMENT, 63L)).isFalse();
        assertThat(e.inScope(member, PermissionScope.TEAM, 61L)).as("TEAM is narrower than a department lead").isFalse();
    }
}
