package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * The trust rules of the role read path: it answers only when the data is complete and consistent, and answers "use the enum"
 * (empty) in every other case, never a wider set.
 */
class OrgRoleServiceTest {

    private static final Long ORG = 10L;
    private static final Long OTHER_ORG = 11L;

    private OrgRoleRepository roles;
    private OrgRolePermissionRepository permissions;
    private OrgMemberRoleRepository memberRoles;
    private OrgMemberRepository members;
    private EnterpriseFeatureFlag flag;
    private OrgRoleService service;

    @BeforeEach
    void setUp() {
        roles = mock(OrgRoleRepository.class);
        permissions = mock(OrgRolePermissionRepository.class);
        memberRoles = mock(OrgMemberRoleRepository.class);
        members = mock(OrgMemberRepository.class);
        flag = mock(EnterpriseFeatureFlag.class);
        when(flag.isEnabled(EnterpriseSettingKeys.FLAG_ROLES, ORG)).thenReturn(true);
        service = new OrgRoleService(roles, permissions, memberRoles, members, flag);
    }

    private static OrgMember seat(OrgRole role) {
        OrgMember m = new OrgMember();
        m.setId(77L);
        m.setOrgId(ORG);
        m.setUserId(5L);
        m.setRole(role);
        m.setStatus(OrgMemberStatus.ACTIVE);
        return m;
    }

    private static OrgRoleDefinition role(long id, String key, Long orgId) {
        OrgRoleDefinition d = new OrgRoleDefinition();
        d.setId(id);
        d.setOrgId(orgId);
        d.setRoleKey(key);
        d.setTemplateKey(key);
        d.setName(key);
        d.setSystem(orgId == null);
        return d;
    }

    private static OrgMemberRole live(long roleId, boolean primary) {
        OrgMemberRole r = new OrgMemberRole();
        r.setId(roleId * 100);
        r.setOrgId(ORG);
        r.setMemberId(77L);
        r.setRoleId(roleId);
        r.setPrimary(primary);
        return r;
    }

    private static OrgRolePermission perm(long roleId, String key, PermissionScope scope) {
        return new OrgRolePermission(roleId, key, scope, null, null);
    }

    private void givenRows(List<OrgMemberRole> rows, List<OrgRoleDefinition> defs, List<OrgRolePermission> perms) {
        when(memberRoles.findLiveByOrgIdAndMemberId(ORG, 77L)).thenReturn(rows);
        when(roles.findVisibleByOrgIdAndIdIn(eq(ORG), anyCollection())).thenReturn(defs);
        when(permissions.findForRoles(eq(ORG), anyCollection())).thenReturn(perms);
    }

    // ---- resolveGrants --------------------------------------------------------------------------------------------

    @Test
    void withTheRolesFlagOffTheDataIsNeverRead() {
        when(flag.isEnabled(EnterpriseSettingKeys.FLAG_ROLES, ORG)).thenReturn(false);
        assertThat(service.resolveGrants(ORG, seat(OrgRole.ADMIN))).isEmpty();
        verify(memberRoles, never()).findLiveByOrgIdAndMemberId(any(), any());
    }

    @Test
    void aMissingFlagServiceFailsClosedToTheEnum() {
        OrgRoleService noFlag = new OrgRoleService(roles, permissions, memberRoles, members, null);
        assertThat(noFlag.rolesFromData(ORG)).isFalse();
        assertThat(noFlag.resolveGrants(ORG, seat(OrgRole.ADMIN))).isEmpty();
    }

    @Test
    void aSeatWithNoRoleRowsKeepsTheEnum() {
        givenRows(List.of(), List.of(), List.of());
        assertThat(service.resolveGrants(ORG, seat(OrgRole.ADMIN))).isEmpty();
    }

    @Test
    void aSeatOfAnotherOrganizationIsNotResolvedHere() {
        OrgMember foreign = seat(OrgRole.ADMIN);
        foreign.setOrgId(OTHER_ORG);
        assertThat(service.resolveGrants(ORG, foreign)).isEmpty();
        assertThat(service.resolveGrants(ORG, null)).isEmpty();
        assertThat(service.resolveGrants(null, seat(OrgRole.ADMIN))).isEmpty();
    }

    @Test
    void zeroOrTwoPrimaryRowsAreNotTrusted() {
        givenRows(List.of(live(1, false)), List.of(role(1, "ORG_ADMIN", null)), List.of(perm(1, "members.invite", PermissionScope.ORG)));
        assertThat(service.resolveGrants(ORG, seat(OrgRole.ADMIN))).as("no primary").isEmpty();
        givenRows(List.of(live(1, true), live(2, true)), List.of(role(1, "ORG_ADMIN", null), role(2, "MARKETING_MANAGER", null)), List.of(perm(1, "members.invite", PermissionScope.ORG)));
        assertThat(service.resolveGrants(ORG, seat(OrgRole.ADMIN))).as("two primaries").isEmpty();
    }

    @Test
    void aRoleRowThatPointsOutsideTheOrganizationIsNotTrusted() {
        // the member holds roles 1 and 2 but the organization can only see role 1 (role 2 belongs to another org)
        givenRows(List.of(live(1, true), live(2, false)), List.of(role(1, "ORG_ADMIN", null)), List.of(perm(1, "members.invite", PermissionScope.ORG)));
        assertThat(service.resolveGrants(ORG, seat(OrgRole.ADMIN))).isEmpty();
    }

    @Test
    void aPrimaryThatDisagreesWithTheEnumIsDriftAndKeepsTheEnum() {
        // somebody wrote the enum (demoted to STAFF) without touching the roles: the old primary must not keep granting ORG_ADMIN rights
        givenRows(List.of(live(1, true)), List.of(role(1, "ORG_ADMIN", null)), List.of(perm(1, "members.remove", PermissionScope.ORG)));
        assertThat(service.resolveGrants(ORG, seat(OrgRole.STAFF))).isEmpty();
    }

    @Test
    void aPrimaryWhoseKeyIsNotATemplateAndHasNoTemplateKeyIsNotTrusted() {
        OrgRoleDefinition custom = role(1, "MY_CUSTOM", ORG);
        custom.setTemplateKey(null);
        givenRows(List.of(live(1, true)), List.of(custom), List.of(perm(1, "members.invite", PermissionScope.ORG)));
        assertThat(service.resolveGrants(ORG, seat(OrgRole.ADMIN))).isEmpty();
    }

    @Test
    void roleRowsWithoutPermissionRowsKeepTheEnum() {
        givenRows(List.of(live(1, true)), List.of(role(1, "ORG_ADMIN", null)), List.of());
        assertThat(service.resolveGrants(ORG, seat(OrgRole.ADMIN))).isEmpty();
    }

    @Test
    void malformedPermissionRowsGrantNothing() {
        givenRows(
            List.of(live(1, true)), List.of(role(1, "ORG_ADMIN", null)),
            List.of(new OrgRolePermission(1L, "members.invite", null, null, null), new OrgRolePermission(1L, null, PermissionScope.ORG, null, null))
        );
        assertThat(service.resolveGrants(ORG, seat(OrgRole.ADMIN))).isEmpty();
    }

    @Test
    void twoRolesGiveTheUnionAndTheWidestScope() {
        // ORG_ADMIN primary + MARKETING_MANAGER secondary; assignments.manage is ORG on one and TEAM on the other
        givenRows(
            List.of(live(1, true), live(2, false)),
            List.of(role(1, "ORG_ADMIN", null), role(2, "MARKETING_MANAGER", null)),
            List.of(
                perm(1, "assignments.manage", PermissionScope.ORG), perm(1, "members.invite", PermissionScope.ORG),
                perm(2, "assignments.manage", PermissionScope.TEAM), perm(2, "approvals.decide", PermissionScope.TEAM)
            )
        );
        OrgRoleService.RoleGrants g = service.resolveGrants(ORG, seat(OrgRole.ADMIN)).orElseThrow();
        assertThat(g.grants()).containsEntry("assignments.manage", PermissionScope.ORG).containsEntry("approvals.decide", PermissionScope.TEAM).containsEntry("members.invite", PermissionScope.ORG);
        assertThat(g.roles()).extracting(OrgMembership.RoleRef::key).containsExactly("ORG_ADMIN", "MARKETING_MANAGER");
        assertThat(g.roles().get(0).primary()).isTrue();
        assertThat(g.roles().get(1).primary()).isFalse();
    }

    @Test
    void anOrgCloneMirrorsThroughItsTemplateKey() {
        OrgRoleDefinition clone = role(9, "REGIONAL_LEAD", ORG);
        clone.setTemplateKey("MARKETING_MANAGER");
        givenRows(List.of(live(9, true)), List.of(clone), List.of(perm(9, "approvals.decide", PermissionScope.TEAM)));
        assertThat(service.resolveGrants(ORG, seat(OrgRole.MARKETER))).isPresent();
        assertThat(service.resolveGrants(ORG, seat(OrgRole.ADMIN))).as("a clone of a marketing template cannot back an ADMIN seat").isEmpty();
    }

    // ---- list ---------------------------------------------------------------------------------------------------

    private static OrgMembership me() {
        return new OrgMembership(ORG, 77L, 5L, "carol", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    }

    @Test
    void listIsA404WhenTheRolesFlagIsOff() {
        when(flag.isEnabled(EnterpriseSettingKeys.FLAG_ROLES, ORG)).thenReturn(false);
        assertThatThrownBy(() -> service.list(me())).isInstanceOf(OrgNotFoundException.class);
        verify(roles, never()).findVisibleToOrg(any());
    }

    @Test
    void listReturnsEveryVisibleRoleWithItsPermissionRowsAndLeaksNoOrgId() {
        OrgRoleDefinition admin = role(1, "ORG_ADMIN", null);
        admin.setEditable(false);
        admin.setWorkspaceKey("ADMIN");
        when(roles.findVisibleToOrg(ORG)).thenReturn(List.of(admin, role(2, "MEMBER", null)));
        when(permissions.findForRoles(eq(ORG), anyCollection())).thenReturn(List.of(perm(1, "members.invite", PermissionScope.ORG), perm(1, "audit.view", PermissionScope.ORG)));
        var out = service.list(me());
        assertThat(out).hasSize(2);
        assertThat(out.get(0).key()).isEqualTo("ORG_ADMIN");
        assertThat(out.get(0).system()).isTrue();
        assertThat(out.get(0).editable()).isFalse();
        assertThat(out.get(0).workspaceKey()).isEqualTo("ADMIN");
        assertThat(out.get(0).permissions()).extracting(p -> p.key() + "=" + p.scope()).containsExactly("members.invite=ORG", "audit.view=ORG");
        assertThat(out.get(1).permissions()).isEmpty();
        assertThat(RoleDTOShape.fieldNames()).doesNotContain("orgId", "org_id");
    }

    /** The DTO must not carry an organization id (system rows have none; an org role is the caller's own). */
    private static final class RoleDTOShape {

        static List<String> fieldNames() {
            List<String> out = new ArrayList<>();
            for (var c : com.dossier.api.service.dto.ent.RoleDTO.class.getRecordComponents()) out.add(c.getName());
            return out;
        }
    }

    // ---- syncFromLegacy -------------------------------------------------------------------------------------------

    private void givenSystemRole(String key, long id) {
        when(roles.findSystemByRoleKey(key)).thenReturn(Optional.of(role(id, key, null)));
    }

    @Test
    void syncWritesOnePrimaryRowForASeatWithoutRoles() {
        givenSystemRole("ORG_ADMIN", 2);
        when(memberRoles.findLiveByOrgIdAndMemberId(ORG, 77L)).thenReturn(List.of());
        OrgMember seat = seat(OrgRole.ADMIN);
        service.syncFromLegacy(seat);
        ArgumentCaptor<OrgMemberRole> row = ArgumentCaptor.forClass(OrgMemberRole.class);
        verify(memberRoles).saveAndFlush(row.capture());
        assertThat(row.getValue().getOrgId()).isEqualTo(ORG);
        assertThat(row.getValue().getMemberId()).isEqualTo(77L);
        assertThat(row.getValue().getRoleId()).isEqualTo(2L);
        assertThat(row.getValue().isPrimary()).isTrue();
        assertThat(row.getValue().getEndsAt()).isNull();
        assertThat(seat.getPrimaryRoleId()).isEqualTo(2L);
        verify(members).save(seat);
    }

    @Test
    void syncIsIdempotentWhenTheRowAlreadyMatches() {
        givenSystemRole("ORG_ADMIN", 2);
        when(memberRoles.findLiveByOrgIdAndMemberId(ORG, 77L)).thenReturn(List.of(live(2, true)));
        OrgMember seat = seat(OrgRole.ADMIN);
        seat.setPrimaryRoleId(2L);
        service.syncFromLegacy(seat);
        verify(memberRoles, never()).saveAndFlush(any());
        verify(members, never()).save(any());
    }

    @Test
    void syncRepairsAMissingPrimaryRoleIdWithoutTouchingTheRows() {
        givenSystemRole("ORG_ADMIN", 2);
        when(memberRoles.findLiveByOrgIdAndMemberId(ORG, 77L)).thenReturn(List.of(live(2, true)));
        OrgMember seat = seat(OrgRole.ADMIN);
        service.syncFromLegacy(seat);
        verify(memberRoles, never()).saveAndFlush(any());
        assertThat(seat.getPrimaryRoleId()).isEqualTo(2L);
        verify(members).save(seat);
    }

    @Test
    void whenTheEnumChangedTheOldPrimaryIsEndedAndANewOneOpened() {
        givenSystemRole("STAFF", 3);
        OrgMemberRole old = live(2, true);
        when(memberRoles.findLiveByOrgIdAndMemberId(ORG, 77L)).thenReturn(List.of(old));
        OrgMember seat = seat(OrgRole.STAFF);
        service.syncFromLegacy(seat);
        assertThat(old.isPrimary()).isFalse();
        assertThat(old.getEndsAt()).as("history is kept, not deleted").isNotNull();
        ArgumentCaptor<OrgMemberRole> saved = ArgumentCaptor.forClass(OrgMemberRole.class);
        verify(memberRoles, org.mockito.Mockito.times(2)).saveAndFlush(saved.capture());
        OrgMemberRole fresh = saved.getAllValues().get(1);
        assertThat(fresh.getRoleId()).isEqualTo(3L);
        assertThat(fresh.isPrimary()).isTrue();
        assertThat(seat.getPrimaryRoleId()).isEqualTo(3L);
    }

    @Test
    void aSecondaryRoleThatBecomesThePrimaryTemplateFreesItsSlotFirst() {
        givenSystemRole("STAFF", 3);
        OrgMemberRole oldPrimary = live(2, true);
        OrgMemberRole secondary = live(3, false);
        when(memberRoles.findLiveByOrgIdAndMemberId(ORG, 77L)).thenReturn(List.of(oldPrimary, secondary));
        service.syncFromLegacy(seat(OrgRole.STAFF));
        assertThat(secondary.getEndsAt()).as("the (member, role) slot is free again").isNotNull();
    }

    @Test
    void aReservedRoleAndAnUnseededTemplateWriteNothing() {
        service.syncFromLegacy(seat(OrgRole.COACH));
        when(roles.findSystemByRoleKey("ORG_ADMIN")).thenReturn(Optional.empty());
        service.syncFromLegacy(seat(OrgRole.ADMIN));
        service.syncFromLegacy(null);
        OrgMember noId = seat(OrgRole.ADMIN);
        noId.setId(null);
        service.syncFromLegacy(noId);
        verify(memberRoles, never()).saveAndFlush(any());
        verify(members, never()).save(any());
    }
}
