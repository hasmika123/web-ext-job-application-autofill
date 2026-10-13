package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgScope;
import com.dossier.api.domain.enumeration.PermissionScope;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * The shape rules of the role templates, and the behavioural-equivalence proof for the six that mirror a legacy enum role:
 * every legacy (permission, scope) cell appears in the template at the mapped scope, and the template holds no legacy
 * permission the enum role lacked. That is what lets a member's permissions move from the enum to data without anybody
 * gaining or losing a legacy right.
 */
class RoleTemplatesTest {

    static Stream<Arguments> legacyPairs() {
        return Stream.of(
            Arguments.of(OrgRole.OWNER, RoleTemplates.OWNER),
            Arguments.of(OrgRole.ADMIN, RoleTemplates.ORG_ADMIN),
            Arguments.of(OrgRole.STAFF, RoleTemplates.STAFF),
            Arguments.of(OrgRole.MEMBER, RoleTemplates.MEMBER),
            Arguments.of(OrgRole.MARKETER, RoleTemplates.MARKETING_SPECIALIST),
            Arguments.of(OrgRole.FINANCE, RoleTemplates.FINANCE_SPECIALIST)
        );
    }

    @ParameterizedTest(name = "{0} == template {1} on every legacy permission")
    @MethodSource("legacyPairs")
    void aTemplateHoldsExactlyWhatItsLegacyRoleHeldAtTheMappedScope(OrgRole legacy, String templateKey) {
        Map<String, RoleTemplates.Grant> grants = RoleTemplates.find(templateKey).orElseThrow().byKey();
        for (OrgPermission p : OrgPermission.values()) {
            Map<OrgPermission, OrgScope> legacyGrants = legacy.grants();
            RoleTemplates.Grant g = grants.get(p.key());
            if (!legacyGrants.containsKey(p)) {
                assertThat(g).as("%s must NOT hold legacy permission %s (the enum role did not)", templateKey, p.key()).isNull();
                continue;
            }
            OrgScope was = legacyGrants.get(p);
            assertThat(g).as("%s must hold legacy permission %s", templateKey, p.key()).isNotNull();
            assertThat(g.scope()).as("%s / %s scope", templateKey, p.key()).isEqualTo(PermissionScope.fromLegacy(was));
            switch (was) {
                case MEMBER_ROLE_ONLY -> assertThat(g.ceilingRoleKey()).as(p.key()).isEqualTo(OrgRolePermission.CEILING_MEMBER);
                case BELOW_ADMIN_ROLES -> assertThat(g.ceilingRoleKey()).as(p.key()).isEqualTo(OrgRolePermission.CEILING_BELOW_ADMIN);
                case BILLING_AND_OPS_ROWS -> assertThat(g.rowFilter()).as(p.key()).isEqualTo(OrgRolePermission.ROW_FILTER_BILLING_OPS);
                default -> {
                    assertThat(g.ceilingRoleKey()).as(p.key()).isNull();
                    assertThat(g.rowFilter()).as(p.key()).isNull();
                }
            }
        }
    }

    @Test
    void thereAreTwelveSystemTemplatesWithUniqueKeysAndNames() {
        List<RoleTemplates.Template> all = RoleTemplates.all();
        assertThat(all).extracting(RoleTemplates.Template::key).containsExactly(
            "OWNER", "ORG_ADMIN", "STAFF", "MEMBER", "CONSULTANT", "MARKETING_SPECIALIST", "MARKETING_MANAGER", "HR_SPECIALIST", "FINANCE_SPECIALIST",
            "ACCOUNT_MANAGER", "TALENT_ACQUISITION", "EXECUTIVE_VIEWER"
        );
        assertThat(all.stream().map(RoleTemplates.Template::name).distinct()).hasSize(12);
        for (RoleTemplates.Template t : all) {
            assertThat(t.key().length()).as(t.key()).isLessThanOrEqualTo(40);
            assertThat(t.name().length()).as(t.key()).isLessThanOrEqualTo(80);
            assertThat(t.description().length()).as(t.key()).isLessThanOrEqualTo(255);
            assertThat(t.grants()).as(t.key()).isNotEmpty();
            assertThat(t.byKey()).as("no duplicate permission key in " + t.key()).hasSize(t.grants().size());
            for (RoleTemplates.Grant g : t.grants()) {
                assertThat(g.key().length()).as(g.key()).isLessThanOrEqualTo(60);
                assertThat(g.scope()).as(t.key() + " / " + g.key()).isNotNull();
            }
        }
    }

    @Test
    void everyTemplateHoldsSelfServiceAtOwnScope() {
        for (RoleTemplates.Template t : RoleTemplates.all()) {
            assertThat(t.byKey().get("self.share_scope.set")).as(t.key()).isNotNull();
            assertThat(t.byKey().get("self.share_scope.set").scope()).isEqualTo(PermissionScope.OWN);
            assertThat(t.byKey().get("self.leave")).as(t.key()).isNotNull();
            assertThat(t.byKey().get("self.leave").scope()).isEqualTo(PermissionScope.OWN);
        }
    }

    @Test
    void onlyTheOwnerMayCloseOrTransferAndAdminsAreNeverConsultants() {
        for (RoleTemplates.Template t : RoleTemplates.all()) {
            boolean owner = t.key().equals(RoleTemplates.OWNER);
            assertThat(t.byKey().containsKey("org.close")).as(t.key()).isEqualTo(owner);
            assertThat(t.byKey().containsKey("org.transfer_ownership")).as(t.key()).isEqualTo(owner);
        }
        // 05 section 3: holding OWNER / ORG_ADMIN never makes someone a consultant (no consultant-side keys).
        for (String key : List.of(RoleTemplates.OWNER, RoleTemplates.ORG_ADMIN)) {
            Set<String> keys = RoleTemplates.find(key).orElseThrow().byKey().keySet();
            assertThat(keys).doesNotContain("submissions.authorize", "opportunities.respond", "applications.manage", "offers.respond", "resumes.manage");
        }
    }

    @Test
    void ownerIsOrgAdminPlusCloseAndTransferWithoutTheRoleCeiling() {
        Map<String, RoleTemplates.Grant> owner = RoleTemplates.find(RoleTemplates.OWNER).orElseThrow().byKey();
        Map<String, RoleTemplates.Grant> admin = RoleTemplates.find(RoleTemplates.ORG_ADMIN).orElseThrow().byKey();
        Set<String> expected = new HashSet<>(admin.keySet());
        expected.addAll(Set.of("org.close", "org.transfer_ownership"));
        assertThat(owner.keySet()).isEqualTo(expected);
        assertThat(owner.get("members.role.set").ceilingRoleKey()).as("an OWNER may set any role").isNull();
        assertThat(admin.get("members.role.set").ceilingRoleKey()).as("an ORG_ADMIN may not touch OWNER / ORG_ADMIN").isEqualTo(OrgRolePermission.CEILING_BELOW_ADMIN);
    }

    @Test
    void theMarketingManagerHoldsTheSpecialistsKeysAtTeamAndTheSpecialistStaysAssigned() {
        Map<String, RoleTemplates.Grant> spec = RoleTemplates.find(RoleTemplates.MARKETING_SPECIALIST).orElseThrow().byKey();
        Map<String, RoleTemplates.Grant> mgr = RoleTemplates.find(RoleTemplates.MARKETING_MANAGER).orElseThrow().byKey();
        for (RoleTemplates.Grant g : spec.values()) {
            if (g.scope() == PermissionScope.OWN) continue;
            assertThat(g.scope()).as("specialist / " + g.key()).isEqualTo(PermissionScope.ASSIGNED);
            assertThat(mgr.get(g.key())).as("manager holds " + g.key()).isNotNull();
            assertThat(mgr.get(g.key()).scope()).as("manager / " + g.key()).isEqualTo(PermissionScope.TEAM);
        }
        for (String k : List.of("assignments.manage", "approvals.decide", "workload.view", "escalations.manage", "reports.export")) {
            assertThat(mgr.get(k).scope()).as(k).isEqualTo(PermissionScope.TEAM);
            assertThat(spec).as("the specialist must not hold " + k).doesNotContainKey(k);
        }
    }

    @Test
    void noTemplateGrantsAnythingThatCouldSubmitSignInAsOrReadPrivateData() {
        // Same invariant as OrgPermissionMatrixTest, for the new keys: those do not exist, they are not denied.
        for (RoleTemplates.Template t : RoleTemplates.all()) {
            for (String key : t.byKey().keySet()) {
                String k = key.toLowerCase();
                assertThat(k).as(t.key()).doesNotContain("sign_in").doesNotContain("impersonate").doesNotContain("attest").doesNotContain("inbox").doesNotContain("answers");
            }
        }
        // "submit" in a key exists only as consultant-owned authorisation or marketer preparation/recording, never as a plain submit.
        for (RoleTemplates.Template t : RoleTemplates.all()) {
            for (String key : t.byKey().keySet()) {
                if (key.contains("submit")) throw new AssertionError("a key that submits: " + key + " in " + t.key());
            }
        }
    }

    @Test
    void aTemplateIsAnUnmodifiableSnapshot() {
        org.junit.jupiter.api.Assertions.assertThrows(UnsupportedOperationException.class, () -> RoleTemplates.all().add(RoleTemplates.all().get(0)));
        org.junit.jupiter.api.Assertions.assertThrows(UnsupportedOperationException.class, () -> RoleTemplates.all().get(0).grants().clear());
        org.junit.jupiter.api.Assertions.assertThrows(UnsupportedOperationException.class, () -> RoleTemplates.all().get(0).byKey().clear());
    }
}
