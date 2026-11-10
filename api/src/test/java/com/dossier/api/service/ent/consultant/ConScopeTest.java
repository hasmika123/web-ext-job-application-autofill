package com.dossier.api.service.ent.consultant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
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
import com.dossier.api.repository.ent.consultant.ConProfileRepository;
import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Every way the consultant gate can miss is the same generic 404; the consultant id comes from the seat. */
class ConScopeTest {

    static final Long ORG = 1L;
    static final Long ME = 7L;

    OrgRoleService roles = mock(OrgRoleService.class);
    EnterpriseFeatureFlag flags = mock(EnterpriseFeatureFlag.class);
    AuthorizationService authorization = mock(AuthorizationService.class);
    ConProfileRepository profiles = mock(ConProfileRepository.class);
    ConScope scope = new ConScope(roles, flags, authorization, profiles);

    @BeforeEach
    void on() {
        when(roles.rolesFromData(ORG)).thenReturn(true);
        when(flags.isEnabled(EnterpriseSettingKeys.FLAG_CONSULTANT_JOBS, ORG)).thenReturn(true);
        when(profiles.findByOrgIdAndMemberId(ORG, ME)).thenReturn(List.of(profile(42L, "ACTIVE")));
    }

    static OrgMembership member(Map<String, PermissionScope> grants) {
        return new OrgMembership(ORG, ME, 70L, "anika", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(), grants);
    }

    static OrgMembership consultant() {
        return member(Map.of("opportunities.respond", PermissionScope.OWN));
    }

    static ConsultantProfile profile(Long id, String status) {
        ConsultantProfile p = new ConsultantProfile();
        p.setId(id);
        p.setOrgId(ORG);
        p.setMemberId(ME);
        p.setStatus(status);
        return p;
    }

    @Test
    void anActiveConsultantWithTheRightsGetsTheirOwnConsultantId() {
        ConScope.View v = scope.read(consultant());
        assertThat(v.orgId()).isEqualTo(ORG);
        assertThat(v.memberId()).isEqualTo(ME);
        assertThat(v.userId()).isEqualTo(70L);
        assertThat(v.consultantId()).isEqualTo(42L);
    }

    @Test
    void theAuthorizationOrderIsAskedForTheOwnPermissionAsTheBeneficiaryThemselfWithTheRightOperation() {
        scope.read(consultant());
        scope.write(consultant());
        ArgumentCaptor<AuthzRequest> req = ArgumentCaptor.forClass(AuthzRequest.class);
        verify(authorization, org.mockito.Mockito.times(2)).require(req.capture());
        assertThat(req.getAllValues()).extracting(AuthzRequest::operation).containsExactly(AuthzOperation.READ, AuthzOperation.WRITE);
        assertThat(req.getValue().permissionKeys()).containsExactly("opportunities.respond");
        assertThat(req.getValue().beneficiary()).isEqualTo(com.dossier.api.service.ent.authz.Beneficiary.SELF);
    }

    @Test
    void rolesNotReadFromDataIs404() {
        when(roles.rolesFromData(ORG)).thenReturn(false);
        assertThatThrownBy(() -> scope.read(consultant())).isInstanceOf(OrgNotFoundException.class);
        verify(profiles, never()).findByOrgIdAndMemberId(any(), any());
    }

    @Test
    void theConsultantJobsFlagOffIs404() {
        when(flags.isEnabled(EnterpriseSettingKeys.FLAG_CONSULTANT_JOBS, ORG)).thenReturn(false);
        assertThatThrownBy(() -> scope.read(consultant())).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void withoutTheRespondPermissionIs404() {
        assertThatThrownBy(() -> scope.read(member(Map.of()))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> scope.read(member(Map.of("opportunities.manage", PermissionScope.ASSIGNED)))).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void aRefusalFromTheAuthorizationOrderIsPropagatedAsItIs() {
        when(authorization.require(any())).thenThrow(new OrgNotFoundException());
        assertThatThrownBy(() -> scope.write(consultant())).isInstanceOf(OrgNotFoundException.class);
        verify(profiles, never()).findByOrgIdAndMemberId(any(), any());
    }

    @Test
    void aSeatWithoutAProfileIs404() {
        when(profiles.findByOrgIdAndMemberId(ORG, ME)).thenReturn(List.of());
        assertThatThrownBy(() -> scope.read(consultant())).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void aSeatWithTwoProfilesIs404() {
        when(profiles.findByOrgIdAndMemberId(ORG, ME)).thenReturn(List.of(profile(42L, "ACTIVE"), profile(43L, "ACTIVE")));
        assertThatThrownBy(() -> scope.read(consultant())).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void anInactiveProfileIs404() {
        for (String status : new String[] { "INACTIVE", "ARCHIVED", null }) {
            when(profiles.findByOrgIdAndMemberId(ORG, ME)).thenReturn(List.of(profile(42L, status)));
            assertThatThrownBy(() -> scope.read(consultant())).as(String.valueOf(status)).isInstanceOf(OrgNotFoundException.class);
        }
    }

    @Test
    void anotherOrganizationOrAMissingMembershipIs404() {
        OrgMembership other = new OrgMembership(2L, ME, 70L, "anika", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(), Map.of("opportunities.respond", PermissionScope.OWN));
        assertThatThrownBy(() -> scope.read(other)).isInstanceOf(OrgNotFoundException.class); // roles flag is off for org 2
        assertThatThrownBy(() -> scope.read(null)).isInstanceOf(OrgNotFoundException.class);
        verify(profiles, never()).findByOrgIdAndMemberId(eq(2L), any());
    }
}
