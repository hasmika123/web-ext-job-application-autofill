package com.dossier.api.service.ent.consultant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.consultant.ConProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.vm.ProfileVersionVM;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/** {@code workspaces[]} of {@code GET /api/profile/version}: which organizations the person works in, and as what. */
class ProfileWorkspacesTest {

    UserRepository users = mock(UserRepository.class);
    OrgMemberRepository members = mock(OrgMemberRepository.class);
    OrganizationRepository organizations = mock(OrganizationRepository.class);
    OrgAccessService access = mock(OrgAccessService.class);
    OrgRoleService roles = mock(OrgRoleService.class);
    TenantModules modules = mock(TenantModules.class);
    EnterpriseFeatureFlag flags = mock(EnterpriseFeatureFlag.class);
    ConProfileRepository profiles = mock(ConProfileRepository.class);
    ProfileWorkspaces workspaces = new ProfileWorkspaces(users, members, organizations, access, roles, modules, flags, profiles);

    @BeforeEach
    void signedIn() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("ana", "n/a"));
        User u = new User();
        u.setId(700L);
        when(users.findOneByLogin("ana")).thenReturn(Optional.of(u));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void seat(long orgId, long memberId, OrgMemberStatus status) {
        OrgMember m = new OrgMember();
        m.setId(memberId);
        m.setOrgId(orgId);
        m.setStatus(status);
        List<OrgMember> have = new java.util.ArrayList<>(members.findMine(700L));
        have.add(m);
        when(members.findMine(700L)).thenReturn(have);
    }

    private void org(long orgId, String name, boolean rolesFromData, boolean marketingOn, boolean consultantFlag, Map<String, PermissionScope> grants, long memberId) {
        Organization o = new Organization();
        o.setId(orgId);
        o.setName(name);
        when(organizations.findByOrgId(orgId)).thenReturn(Optional.of(o));
        when(roles.rolesFromData(orgId)).thenReturn(rolesFromData);
        when(modules.isOn(TenantModule.MARKETING, orgId)).thenReturn(marketingOn);
        when(flags.isEnabled(EnterpriseSettingKeys.FLAG_CONSULTANT_JOBS, orgId)).thenReturn(consultantFlag);
        when(access.resolve(orgId)).thenReturn(Optional.of(new OrgMembership(orgId, memberId, 700L, "ana", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(), grants)));
    }

    private void profile(long orgId, long memberId, String status) {
        ConsultantProfile p = new ConsultantProfile();
        p.setId(900 + memberId);
        p.setOrgId(orgId);
        p.setMemberId(memberId);
        p.setStatus(status);
        when(profiles.findByOrgIdAndMemberId(orgId, memberId)).thenReturn(List.of(p));
    }

    @Test
    void aConsultantWorkspaceAndAMarketerWorkspaceAreTold() {
        seat(2, 20, OrgMemberStatus.ACTIVE);
        seat(1, 10, OrgMemberStatus.ACTIVE);
        org(1, "Acme Staffing", true, true, true, Map.of("opportunities.respond", PermissionScope.OWN), 10);
        profile(1, 10, "ACTIVE");
        org(2, "Globex Talent", true, true, true, Map.of("opportunities.manage", PermissionScope.ASSIGNED), 20);
        assertThat(workspaces.ofCurrentUser()).containsExactly(
            new ProfileWorkspaces.Workspace(1L, "Acme Staffing", true, false),
            new ProfileWorkspaces.Workspace(2L, "Globex Talent", false, true)
        );
    }

    @Test
    void aSeatThatIsBothIsBoth() {
        seat(1, 10, OrgMemberStatus.ACTIVE);
        org(1, "Acme", true, true, true, Map.of("opportunities.respond", PermissionScope.OWN, "opportunities.manage", PermissionScope.ASSIGNED), 10);
        profile(1, 10, "ACTIVE");
        assertThat(workspaces.ofCurrentUser()).containsExactly(new ProfileWorkspaces.Workspace(1L, "Acme", true, true));
    }

    @Test
    void organizationsWithoutRolesFromDataOrTheMarketingModuleAreLeftOut() {
        seat(1, 10, OrgMemberStatus.ACTIVE);
        seat(2, 20, OrgMemberStatus.ACTIVE);
        org(1, "Legacy", false, true, true, Map.of("opportunities.manage", PermissionScope.ORG), 10);
        org(2, "No marketing", true, false, true, Map.of("opportunities.manage", PermissionScope.ORG), 20);
        assertThat(workspaces.ofCurrentUser()).isEmpty();
    }

    @Test
    void onlyActiveSeatsCountAndASeatTwiceInOneOrgIsListedOnce() {
        seat(1, 10, OrgMemberStatus.LEFT);
        seat(2, 20, OrgMemberStatus.ACTIVE);
        seat(2, 21, OrgMemberStatus.ACTIVE);
        seat(3, 30, OrgMemberStatus.SUSPENDED);
        org(2, "Globex", true, true, true, Map.of("opportunities.manage", PermissionScope.ORG), 20);
        assertThat(workspaces.ofCurrentUser()).containsExactly(new ProfileWorkspaces.Workspace(2L, "Globex", false, true));
    }

    @Test
    void consultantIsOnlyTrueWhenTheConsultantGateWouldOpen() {
        seat(1, 10, OrgMemberStatus.ACTIVE);
        org(1, "Acme", true, true, true, Map.of("opportunities.respond", PermissionScope.OWN), 10);
        profile(1, 10, "INACTIVE");
        assertThat(workspaces.ofCurrentUser().get(0).consultant()).as("inactive profile").isFalse();

        profile(1, 10, "ACTIVE");
        org(1, "Acme", true, true, false, Map.of("opportunities.respond", PermissionScope.OWN), 10);
        assertThat(workspaces.ofCurrentUser().get(0).consultant()).as("consultant jobs flag off").isFalse();

        org(1, "Acme", true, true, true, Map.of(), 10);
        assertThat(workspaces.ofCurrentUser().get(0).consultant()).as("no opportunities.respond").isFalse();

        org(1, "Acme", true, true, true, Map.of("opportunities.respond", PermissionScope.OWN), 10);
        ConsultantProfile twin = new ConsultantProfile();
        twin.setStatus("ACTIVE");
        ConsultantProfile first = new ConsultantProfile();
        first.setStatus("ACTIVE");
        when(profiles.findByOrgIdAndMemberId(1L, 10L)).thenReturn(List.of(first, twin));
        assertThat(workspaces.ofCurrentUser().get(0).consultant()).as("two profiles").isFalse();
    }

    @Test
    void thePreferredDisplayNameWinsAndNoSignedInUserMeansNothing() {
        seat(1, 10, OrgMemberStatus.ACTIVE);
        org(1, "acme-llc", true, true, true, Map.of("opportunities.manage", PermissionScope.ORG), 10);
        organizations.findByOrgId(1L).ifPresent(o -> o.setDisplayName("Acme Staffing"));
        assertThat(workspaces.ofCurrentUser()).extracting(ProfileWorkspaces.Workspace::name).containsExactly("Acme Staffing");
        SecurityContextHolder.clearContext();
        assertThat(workspaces.ofCurrentUser()).isEmpty();
    }

    @Test
    void theViewModelKeepsTheOldTwoFieldsAndAddsTheWorkspaces() {
        ProfileVersionVM old = new ProfileVersionVM("abcd", "FREE");
        assertThat(old.getWorkspaces()).isEmpty();
        ProfileVersionVM vm = new ProfileVersionVM("abcd", "PRO", List.of(new ProfileWorkspaces.Workspace(1L, "Acme", true, false)));
        assertThat(vm.getVersion()).isEqualTo("abcd");
        assertThat(vm.getPlan()).isEqualTo("PRO");
        assertThat(vm.getWorkspaces()).hasSize(1);
        assertThat(new ProfileVersionVM("a", "b", null).getWorkspaces()).isEmpty();
    }
}
