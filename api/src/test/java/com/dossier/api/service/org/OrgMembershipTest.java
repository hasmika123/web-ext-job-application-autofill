package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgScope;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

/**
 * X1.6: the membership answers exactly what the enum did when it is built the legacy way, and takes the union of its roles
 * (widest scope wins) when it is built from role data.
 */
class OrgMembershipTest {

    private static OrgMembership legacy(OrgRole role) {
        return new OrgMembership(1L, 2L, 3L, "carol", role, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    }

    private static OrgMembership fromData(OrgRole mirror, Map<String, PermissionScope> grants) {
        return new OrgMembership(
            1L, 2L, 3L, "carol", mirror, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE,
            List.of(new OrgMembership.RoleRef(10L, "ORG_ADMIN", "Organization Admin", true), new OrgMembership.RoleRef(11L, "MARKETING_MANAGER", "Marketing Manager", false)),
            grants
        );
    }

    @ParameterizedTest
    @EnumSource(OrgRole.class)
    void aLegacyMembershipAnswersExactlyWhatTheEnumAnswered(OrgRole role) {
        OrgMembership m = legacy(role);
        for (OrgPermission p : OrgPermission.values()) {
            assertThat(m.can(p)).as("%s / %s", role, p).isEqualTo(role.can(p));
            assertThat(m.scopeOf(p)).as("%s / %s scope", role, p).isEqualTo(role.scopeOf(p));
        }
        assertThat(m.permissionKeys()).isEqualTo(role.permissions().stream().map(OrgPermission::key).toList());
        assertThat(m.roles()).hasSize(1);
        assertThat(m.primaryRoleKey()).contains(role.name());
    }

    @Test
    void scopesOfALegacyMembershipAreTheMappedPermissionScopes() {
        OrgMembership staff = legacy(OrgRole.STAFF);
        assertThat(staff.scopeFor("members.invite")).contains(PermissionScope.ORG); // MEMBER_ROLE_ONLY maps to ORG (the narrowing stays in scopeOf)
        assertThat(staff.scopeOf(OrgPermission.MEMBERS_INVITE)).contains(OrgScope.MEMBER_ROLE_ONLY);
        assertThat(staff.scopeFor("reports.view")).contains(PermissionScope.ASSIGNED);
        assertThat(legacy(OrgRole.MEMBER).scopeFor("ops.own_hours")).contains(PermissionScope.OWN);
        assertThat(legacy(OrgRole.COACH).permissionKeys()).isEmpty();
        assertThat(legacy(OrgRole.COACH).can(OrgPermission.SELF_LEAVE)).isFalse();
    }

    @Test
    void aMemberWithSeveralRolesHoldsTheUnionAndTheWidestScopeWins() {
        // ORG_ADMIN (assignments.manage at ORG) + MARKETING_MANAGER (assignments.manage at TEAM) -> ORG
        Map<String, PermissionScope> union = new LinkedHashMap<>();
        union.put("assignments.manage", PermissionScope.widest(PermissionScope.TEAM, PermissionScope.ORG));
        union.put("approvals.decide", PermissionScope.TEAM);
        union.put("members.invite", PermissionScope.ORG);
        OrgMembership m = fromData(OrgRole.ADMIN, union);

        assertThat(m.scopeFor("assignments.manage")).contains(PermissionScope.ORG);
        assertThat(m.scopeFor("approvals.decide")).contains(PermissionScope.TEAM);
        assertThat(m.canKey("approvals.decide")).isTrue();
        assertThat(m.can(OrgPermission.ASSIGNMENTS_MANAGE)).isTrue();
        assertThat(m.can(OrgPermission.MEMBERS_INVITE)).isTrue();
        assertThat(m.can(OrgPermission.BILLING_VIEW)).as("not granted by either role").isFalse();
        assertThat(m.permissionKeys()).containsExactly("assignments.manage", "approvals.decide", "members.invite");
        assertThat(m.primaryRoleKey()).contains("ORG_ADMIN");
        assertThat(m.roles()).extracting(OrgMembership.RoleRef::key).containsExactly("ORG_ADMIN", "MARKETING_MANAGER");
    }

    @Test
    void scopeOfPrefersTheLegacyNarrowingAndOtherwiseNeverWidens() {
        Map<String, PermissionScope> grants = new LinkedHashMap<>();
        grants.put("members.role.set", PermissionScope.ORG); // the ADMIN legacy cell is BELOW_ADMIN_ROLES
        grants.put("reports.view", PermissionScope.TEAM); // the ADMIN legacy cell is ALL, a data scope narrower than that
        grants.put("member.act_for", PermissionScope.ASSIGNED);
        OrgMembership m = fromData(OrgRole.STAFF, grants); // the STAFF mirror holds neither members.role.set nor act_for
        assertThat(m.scopeOf(OrgPermission.MEMBERS_ROLE_SET)).as("closest legacy value, not ALL").contains(OrgScope.ALL); // ORG really is everyone
        assertThat(m.scopeOf(OrgPermission.MEMBER_ACT_FOR)).contains(OrgScope.OWN_CONSULTANTS);
        assertThat(m.scopeOf(OrgPermission.REPORTS_VIEW)).as("the legacy STAFF cell").contains(OrgScope.OWN_MEMBERS);
        assertThat(m.scopeOf(OrgPermission.BILLING_VIEW)).isEmpty();
        assertThat(m.scopeFor("nonsense.key")).isEmpty();
        assertThat(m.scopeFor(null)).isEmpty();
        assertThat(m.can(null)).isFalse();
        assertThat(m.canKey(null)).isFalse();
    }

    @Test
    void theRecordIsImmutable() {
        Map<String, PermissionScope> grants = new LinkedHashMap<>(Map.of("members.invite", PermissionScope.ORG));
        OrgMembership m = fromData(OrgRole.ADMIN, grants);
        grants.put("billing.view", PermissionScope.ORG); // a caller mutating its own map afterwards must not widen the membership
        assertThat(m.canKey("billing.view")).isFalse();
        org.junit.jupiter.api.Assertions.assertThrows(UnsupportedOperationException.class, () -> m.grants().put("billing.view", PermissionScope.ORG));
        org.junit.jupiter.api.Assertions.assertThrows(UnsupportedOperationException.class, () -> m.roles().clear());
    }
}
