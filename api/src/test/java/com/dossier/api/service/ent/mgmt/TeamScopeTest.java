package com.dossier.api.service.ent.mgmt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.repository.ent.mgmt.TeamScopeRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.JpaScopeDirectory;
import com.dossier.api.service.ent.authz.ScopeEvaluator;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * "My team" of the Marketing Manager workspace: an ORG-scope holder (admin) is everyone, a TEAM or DEPARTMENT holder is the marketers they manage or share a
 * group with (confirmed by the existing scope rule), the consultants are those the team carries, a manager with nobody is an empty team (never a 404), and a
 * caller without the key, at a narrower scope, or in an organization without the module gets the generic 404.
 */
class TeamScopeTest {

    static final Long ORG = 1L;
    static final Long ME = 7L;

    OrgRoleService roles = mock(OrgRoleService.class);
    TenantModules modules = mock(TenantModules.class);
    AuthorizationService authorization = mock(AuthorizationService.class);
    JpaScopeDirectory directory = mock(JpaScopeDirectory.class);
    ScopeEvaluator evaluator = mock(ScopeEvaluator.class);
    TeamScopeRepository repository = mock(TeamScopeRepository.class);
    ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    TeamScope scope = new TeamScope(roles, modules, authorization, directory, evaluator, repository, consultants);

    @BeforeEach
    void on() {
        when(roles.rolesFromData(ORG)).thenReturn(true);
        when(modules.isOn(TenantModule.MARKETING, ORG)).thenReturn(true);
    }

    OrgMembership member(PermissionScope granted) {
        return new OrgMembership(ORG, ME, 70L, "mgr", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(), granted == null ? Map.of() : Map.of(TeamScope.KEY, granted));
    }

    @Test
    void anOrgScopeHolderIsEveryMarketerAndEveryConsultantTheyCarry() {
        when(repository.findActiveMemberIdsWithRoleKeys(eq(ORG), anyCollection())).thenReturn(List.of(10L, 11L, 12L));
        when(repository.findConsultantIdsCarriedBy(eq(ORG), anyCollection())).thenReturn(List.of(100L, 101L));
        TeamScope.View view = scope.resolve(member(PermissionScope.ORG));
        assertThat(view.all()).isTrue();
        assertThat(view.marketerMemberIds()).containsExactlyInAnyOrder(10L, 11L, 12L);
        assertThat(view.consultantIds()).containsExactlyInAnyOrder(100L, 101L);
        assertThat(view.empty()).isFalse();
        verify(directory, never()).membersInScope(any(), any()); // an ORG scope needs no group walk
    }

    @Test
    void aTeamManagerIsTheirDirectReportsAndTheMarketersTheScopeRuleReaches() {
        OrgMembership me = member(PermissionScope.TEAM);
        when(repository.findActiveMemberIdsWithRoleKeys(eq(ORG), anyCollection())).thenReturn(List.of(10L, 11L, 12L, 13L));
        // 10 shares the team and is confirmed; 11 is a candidate the evaluator refuses; 12 reports to the manager; 14 is in scope but holds no marketing role
        when(directory.membersInScope(me, TeamScope.KEY)).thenReturn(Set.of(10L, 11L, 14L));
        when(evaluator.inScope(me, PermissionScope.TEAM, 10L)).thenReturn(true);
        when(evaluator.inScope(me, PermissionScope.TEAM, 11L)).thenReturn(false);
        when(repository.findActiveDirectReportIds(ORG, ME)).thenReturn(List.of(12L, 99L)); // 99 is not a marketer
        when(repository.findConsultantIdsCarriedBy(eq(ORG), anyCollection())).thenReturn(List.of(100L));
        TeamScope.View view = scope.resolve(me);
        assertThat(view.all()).isFalse();
        assertThat(view.marketerMemberIds()).containsExactlyInAnyOrder(10L, 12L);
        assertThat(view.consultantIds()).containsExactly(100L);
        ArgumentCaptor<java.util.Collection<Long>> carried = ArgumentCaptor.forClass(java.util.Collection.class);
        verify(repository).findConsultantIdsCarriedBy(eq(ORG), carried.capture());
        assertThat(carried.getValue()).containsExactlyInAnyOrder(10L, 12L);
    }

    @Test
    void aManagerWithNoMarketersIsAValidEmptyTeamNeverA404() {
        OrgMembership me = member(PermissionScope.TEAM);
        when(repository.findActiveMemberIdsWithRoleKeys(eq(ORG), anyCollection())).thenReturn(List.of(10L));
        when(directory.membersInScope(me, TeamScope.KEY)).thenReturn(Set.of(ME));
        TeamScope.View view = scope.resolve(me);
        assertThat(view.empty()).isTrue();
        assertThat(view.consultantIds()).isEmpty();
        verify(repository, never()).findConsultantIdsCarriedBy(any(), anyCollection());
    }

    @Test
    void aDepartmentScopeResolvesLikeTeamAtItsOwnScope() {
        OrgMembership me = member(PermissionScope.DEPARTMENT);
        when(repository.findActiveMemberIdsWithRoleKeys(eq(ORG), anyCollection())).thenReturn(List.of(10L));
        when(directory.membersInScope(me, TeamScope.KEY)).thenReturn(Set.of(10L));
        when(evaluator.inScope(me, PermissionScope.DEPARTMENT, 10L)).thenReturn(true);
        assertThat(scope.resolve(me).marketerMemberIds()).containsExactly(10L);
    }

    @Test
    void aCallerWithoutTheKeyOrAtANarrowerScopeIsTheGeneric404() {
        assertThatThrownBy(() -> scope.resolve(member(null))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> scope.resolve(member(PermissionScope.ASSIGNED))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> scope.resolve(member(PermissionScope.OWN))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> scope.resolve(null)).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void aMissingRolesFlagOrMarketingModuleIsTheGeneric404() {
        when(modules.isOn(TenantModule.MARKETING, ORG)).thenReturn(false);
        assertThatThrownBy(() -> scope.resolve(member(PermissionScope.ORG))).isInstanceOf(OrgNotFoundException.class);
        when(modules.isOn(TenantModule.MARKETING, ORG)).thenReturn(true);
        when(roles.rolesFromData(ORG)).thenReturn(false);
        assertThatThrownBy(() -> scope.resolve(member(PermissionScope.ORG))).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void thePageKeysAreAskedOfTheAuthorizationOrderTogetherWithTheTeamKey() {
        when(repository.findActiveMemberIdsWithRoleKeys(eq(ORG), anyCollection())).thenReturn(List.of());
        scope.resolve(member(PermissionScope.ORG), AuthzOperation.WRITE, "approvals.decide", "workload.view");
        ArgumentCaptor<AuthzRequest> asked = ArgumentCaptor.forClass(AuthzRequest.class);
        verify(authorization).require(asked.capture());
        assertThat(asked.getValue().permissionKeys()).containsExactly("workload.view", "approvals.decide");
        assertThat(asked.getValue().operation()).isEqualTo(AuthzOperation.WRITE);
    }

    @Test
    void aMarketerOutsideTheTeamIsTheGeneric404() {
        TeamScope.View view = new TeamScope.View(ORG, ME, false, Set.of(10L), Set.of(100L));
        scope.require(view, 10L); // does not throw
        assertThatThrownBy(() -> scope.require(view, 11L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> scope.require(view, null)).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void aConsultantOutsideTheTeamIsTheGeneric404AndAnAdminReachesAnyConsultantOfTheOrg() {
        TeamScope.View team = new TeamScope.View(ORG, ME, false, Set.of(10L), Set.of(100L));
        scope.requireConsultant(team, 100L);
        assertThatThrownBy(() -> scope.requireConsultant(team, 101L)).isInstanceOf(OrgNotFoundException.class);

        TeamScope.View admin = new TeamScope.View(ORG, ME, true, Set.of(10L), Set.of(100L));
        when(consultants.findByOrgIdAndId(ORG, 555L)).thenReturn(Optional.of(new ConsultantProfile()));
        when(consultants.findByOrgIdAndId(ORG, 556L)).thenReturn(Optional.empty());
        scope.requireConsultant(admin, 555L); // unassigned, still the organization's
        assertThatThrownBy(() -> scope.requireConsultant(admin, 556L)).isInstanceOf(OrgNotFoundException.class);
    }
}
