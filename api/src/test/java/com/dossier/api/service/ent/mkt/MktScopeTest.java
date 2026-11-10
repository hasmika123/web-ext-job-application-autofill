package com.dossier.api.service.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Which consultants a marketer sees: an ORG scope sees all, a narrower one only the consultants of an ACTIVE assignment (as marketer or backup). */
class MktScopeTest {

    static final Long ORG = 1L;
    static final Long ME = 7L;
    static final String KEY = "opportunities.manage";

    OrgRoleService roles = mock(OrgRoleService.class);
    TenantModules modules = mock(TenantModules.class);
    AuthorizationService authorization = mock(AuthorizationService.class);
    MarketerAssignmentRepository assignments = mock(MarketerAssignmentRepository.class);
    MktScope scope = new MktScope(roles, modules, authorization, assignments);

    @BeforeEach
    void on() {
        when(roles.rolesFromData(ORG)).thenReturn(true);
        when(modules.isOn(TenantModule.MARKETING, ORG)).thenReturn(true);
    }

    OrgMembership member(PermissionScope granted) {
        return new OrgMembership(ORG, ME, 70L, "marketer", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(), granted == null ? Map.of() : Map.of(KEY, granted));
    }

    static MarketerAssignment assignment(long consultantId, Long marketer, Long backup, String status) {
        MarketerAssignment a = new MarketerAssignment();
        a.setOrgId(ORG);
        a.setConsultantId(consultantId);
        a.setMarketerMemberId(marketer);
        a.setBackupMemberId(backup);
        a.setStatus(status);
        return a;
    }

    @Test
    void anOrgScopeSeesEveryConsultantAndReadsNoAssignments() {
        MktScope.View view = scope.resolve(member(PermissionScope.ORG), KEY);
        assertThat(view.all()).isTrue();
        assertThat(view.sees(999L)).isTrue();
        assertThat(view.orgId()).isEqualTo(ORG);
    }

    @Test
    void aNarrowScopeSeesTheConsultantsOfItsActiveAssignmentsAsMarketerOrBackup() {
        when(assignments.findByOrgIdAndMarketerMemberId(ORG, ME)).thenReturn(List.of(assignment(10, ME, null, "ACTIVE"), assignment(11, ME, 8L, "ACTIVE")));
        when(assignments.findByOrgIdAndBackupMemberId(ORG, ME)).thenReturn(List.of(assignment(12, 9L, ME, "ACTIVE")));
        MktScope.View view = scope.resolve(member(PermissionScope.ASSIGNED), KEY);
        assertThat(view.all()).isFalse();
        assertThat(view.consultantIds()).containsExactlyInAnyOrder(10L, 11L, 12L);
        assertThat(view.sees(10L)).isTrue();
        assertThat(view.sees(13L)).isFalse();
    }

    @Test
    void aPausedOrOtherwiseNotActiveAssignmentGivesNoSight() {
        when(assignments.findByOrgIdAndMarketerMemberId(ORG, ME)).thenReturn(List.of(
            assignment(10, ME, null, "ACTIVE"), assignment(11, ME, null, "PAUSED"), assignment(14, ME, null, null), assignment(15, ME, null, "active")
        ));
        when(assignments.findByOrgIdAndBackupMemberId(ORG, ME)).thenReturn(List.of(assignment(12, 9L, ME, "PAUSED"), assignment(13, 9L, ME, "ACTIVE")));
        MktScope.View view = scope.resolve(member(PermissionScope.ASSIGNED), KEY);
        assertThat(view.consultantIds()).containsExactlyInAnyOrder(10L, 13L);
        assertThat(view.sees(11L)).isFalse();
        assertThat(view.sees(12L)).isFalse();
        assertThatThrownBy(() -> scope.require(view, 11L)).isInstanceOf(OrgNotFoundException.class);
        scope.require(view, 10L); // does not throw
    }

    @Test
    void theGateIsTheGenericNotFound() {
        when(roles.rolesFromData(ORG)).thenReturn(false);
        assertThatThrownBy(() -> scope.resolve(member(PermissionScope.ORG), KEY)).isInstanceOf(OrgNotFoundException.class);
        when(roles.rolesFromData(ORG)).thenReturn(true);
        when(modules.isOn(TenantModule.MARKETING, ORG)).thenReturn(false);
        assertThatThrownBy(() -> scope.resolve(member(PermissionScope.ORG), KEY)).isInstanceOf(OrgNotFoundException.class);
        when(modules.isOn(TenantModule.MARKETING, ORG)).thenReturn(true);
        assertThatThrownBy(() -> scope.resolve(member(null), KEY)).as("the permission key is not held").isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> scope.resolve(null, KEY)).isInstanceOf(OrgNotFoundException.class);
    }
}
