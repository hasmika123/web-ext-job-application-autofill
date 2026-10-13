package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.service.org.InviteCeilingChecker.Rights;
import com.dossier.api.service.org.InviteCeilingChecker.RoleView;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** X1.15: the ceiling rule in isolation. The inviter's rights and the roles are built by hand; the IT proves them from real rows. */
class InviteCeilingCheckerTest {

    private final InviteCeilingChecker checker = new InviteCeilingChecker(null, null, null, null);

    private static RoleView role(long id, String key, OrgRole mirror, Object... permissionAndScope) {
        OrgRoleDefinition d = new OrgRoleDefinition();
        d.setId(id);
        d.setRoleKey(key);
        d.setTemplateKey(key);
        d.setName(key);
        d.setSystem(true);
        java.util.ArrayList<OrgRolePermission> perms = new java.util.ArrayList<>();
        for (int i = 0; i < permissionAndScope.length; i += 2) perms.add(new OrgRolePermission(id, (String) permissionAndScope[i], (PermissionScope) permissionAndScope[i + 1], null, null));
        return new RoleView(d, key, mirror, perms);
    }

    private static Rights rights(boolean owner, boolean roleSet, String inviteCeiling, String roleSetCeiling, Object... grants) {
        Map<String, PermissionScope> g = new LinkedHashMap<>();
        g.put("members.invite", PermissionScope.ORG);
        for (int i = 0; i < grants.length; i += 2) g.put((String) grants[i], (PermissionScope) grants[i + 1]);
        return new Rights(true, g, inviteCeiling, owner, roleSet, roleSetCeiling);
    }

    private final RoleView marketing = role(1, "MARKETING_SPECIALIST", OrgRole.MARKETER, "submissions.prepare", PermissionScope.ASSIGNED, "member.act_for", PermissionScope.ASSIGNED, "self.leave", PermissionScope.OWN);
    private final RoleView consultant = role(2, "CONSULTANT", OrgRole.MEMBER, "applications.manage", PermissionScope.OWN, "resumes.manage", PermissionScope.OWN);
    private final RoleView orgAdmin = role(3, "ORG_ADMIN", OrgRole.ADMIN, "members.invite", PermissionScope.ORG, "roles.manage", PermissionScope.ORG);
    private final RoleView owner = role(4, "OWNER", OrgRole.OWNER, "org.close", PermissionScope.ORG);
    private final RoleView member = role(5, "MEMBER", OrgRole.MEMBER);
    private final RoleView marketingManager = role(6, "MARKETING_MANAGER", OrgRole.MARKETER, "submissions.prepare", PermissionScope.TEAM, "assignments.manage", PermissionScope.TEAM);

    @Test
    void anHrSpecialistInvitesConsultantsAndMembersButNotMarketersOrAdmins() {
        Rights hr = rights(false, false, null, null, "members.group.set", PermissionScope.ORG);
        assertThat(checker.grantable(hr, consultant)).as("a consultant has only own-scope permissions: they raise nothing").isTrue();
        assertThat(checker.grantable(hr, member)).isTrue();
        assertThat(checker.grantable(hr, marketing)).as("HR holds no marketing permissions").isFalse();
        assertThat(checker.grantable(hr, orgAdmin)).isFalse();
        assertThat(checker.refused(hr, List.of(consultant, marketing, orgAdmin))).containsExactly(1L, 3L);
    }

    @Test
    void aRoleIsGrantableWhenTheInviterHoldsEveryPermissionAtTheSameOrAWiderScope() {
        Rights wide = rights(false, false, null, null, "submissions.prepare", PermissionScope.ORG, "member.act_for", PermissionScope.ASSIGNED);
        assertThat(checker.grantable(wide, marketing)).isTrue();
        Rights narrower = rights(false, false, null, null, "submissions.prepare", PermissionScope.ASSIGNED, "member.act_for", PermissionScope.ASSIGNED);
        assertThat(checker.grantable(narrower, marketingManager)).as("TEAM scope is wider than the inviter's ASSIGNED").isFalse();
        Rights team = rights(false, false, null, null, "submissions.prepare", PermissionScope.TEAM, "assignments.manage", PermissionScope.DEPARTMENT);
        assertThat(checker.grantable(team, marketingManager)).isTrue();
    }

    @Test
    void anOrgAdminGrantsAnythingBelowAdminAndAnOwnerAlsoAdmins_neverAnOwner() {
        Rights admin = rights(false, true, null, "BELOW_ADMIN");
        assertThat(checker.grantable(admin, marketing)).as("the role-setting authority is bounded by its ceiling, not by a copy of every permission").isTrue();
        assertThat(checker.grantable(admin, consultant)).isTrue();
        assertThat(checker.grantable(admin, orgAdmin)).as("only an owner invites another admin").isFalse();
        Rights ownerRights = rights(true, true, null, null);
        assertThat(checker.grantable(ownerRights, orgAdmin)).isTrue();
        assertThat(checker.grantable(ownerRights, owner)).as("nobody is invited as an owner").isFalse();
    }

    @Test
    void staffWithAMemberCeilingInviteOnlyRolesThatMirrorMember() {
        Rights staff = rights(false, false, "MEMBER", null);
        assertThat(checker.grantable(staff, member)).isTrue();
        assertThat(checker.grantable(staff, consultant)).as("CONSULTANT mirrors MEMBER").isTrue();
        assertThat(checker.grantable(staff, marketing)).isFalse();
    }

    @Test
    void aBelowAdminCeilingOnInviteBlocksAdminLikeRoles() {
        Rights r = rights(true, false, "BELOW_ADMIN", null);
        assertThat(checker.grantable(r, orgAdmin)).isFalse();
    }

    @Test
    void anInviterWhoCanNoLongerInviteGrantsNothing() {
        assertThat(checker.grantable(Rights.NONE, member)).isFalse();
        assertThat(checker.grantable(Rights.NONE, consultant)).isFalse();
        assertThat(checker.grantableMirror(Rights.NONE, OrgRole.MEMBER)).isFalse();
        assertThat(checker.grantable(null, member)).isFalse();
    }

    @Test
    void theLegacyEnumOnlyFormFollowsTheSameCeilings() {
        assertThat(checker.grantableMirror(rights(false, false, "MEMBER", null), OrgRole.MEMBER)).isTrue();
        assertThat(checker.grantableMirror(rights(false, false, "MEMBER", null), OrgRole.STAFF)).isFalse();
        assertThat(checker.grantableMirror(rights(false, true, null, "BELOW_ADMIN"), OrgRole.MARKETER)).isTrue();
        assertThat(checker.grantableMirror(rights(false, true, null, "BELOW_ADMIN"), OrgRole.ADMIN)).isFalse();
        assertThat(checker.grantableMirror(rights(true, true, null, null), OrgRole.ADMIN)).isTrue();
        assertThat(checker.grantableMirror(rights(true, true, null, null), OrgRole.OWNER)).isFalse();
        assertThat(checker.grantableMirror(rights(true, true, null, null), OrgRole.COACH)).as("reserved").isFalse();
    }

    @Test
    void theWidestCeilingAcrossRolesWins() {
        assertThat(InviteCeilingChecker.widestCeiling(List.of())).isNull();
        assertThat(InviteCeilingChecker.widestCeiling(java.util.Arrays.asList("MEMBER", null))).as("a role with no ceiling").isNull();
        assertThat(InviteCeilingChecker.widestCeiling(List.of("MEMBER", "BELOW_ADMIN"))).isEqualTo("BELOW_ADMIN");
        assertThat(InviteCeilingChecker.widestCeiling(List.of("MEMBER"))).isEqualTo("MEMBER");
    }
}
