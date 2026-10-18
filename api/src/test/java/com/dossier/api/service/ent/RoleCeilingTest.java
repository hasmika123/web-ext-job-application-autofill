package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.service.ent.RoleCeiling.Row;
import com.dossier.api.service.ent.authz.EntPermissions;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/** The ceiling rule of 05 section 3 as a matrix: scope, narrowing attributes, row filters, several roles, and the shipped templates. */
class RoleCeilingTest {

    private static OrgRolePermission p(String key, PermissionScope scope, String ceiling, String filter) {
        return new OrgRolePermission(1L, key, scope, ceiling, filter);
    }

    private static Row row(String key, PermissionScope scope) {
        return new Row(key, scope, null, null);
    }

    private static RoleCeiling templateHolder(String templateKey) {
        List<OrgRolePermission> rows = new ArrayList<>();
        for (RoleTemplates.Grant g : RoleTemplates.find(templateKey).orElseThrow().grants()) rows.add(p(g.key(), g.scope(), g.ceilingRoleKey(), g.rowFilter()));
        return RoleCeiling.of(rows);
    }

    @Test
    void aKeyTheActorDoesNotHoldIsRefusedAtAnyScopeAboveOwn() {
        RoleCeiling actor = RoleCeiling.of(List.of(p("reports.view", PermissionScope.ORG, null, null)));
        assertThat(actor.allows(row("org.close", PermissionScope.ORG))).isFalse();
        assertThat(actor.allows(row("org.close", PermissionScope.ASSIGNED))).isFalse();
        assertThat(actor.allows(row("reports.view", PermissionScope.ORG))).isTrue();
    }

    @Test
    void aWiderScopeCoversTheNarrowerOnesButNeverTheOtherWayRound() {
        RoleCeiling teamHolder = RoleCeiling.of(List.of(p("assignments.manage", PermissionScope.TEAM, null, null)));
        assertThat(teamHolder.allows(row("assignments.manage", PermissionScope.OWN))).isTrue();
        assertThat(teamHolder.allows(row("assignments.manage", PermissionScope.ASSIGNED))).isTrue();
        assertThat(teamHolder.allows(row("assignments.manage", PermissionScope.TEAM))).isTrue();
        assertThat(teamHolder.allows(row("assignments.manage", PermissionScope.DEPARTMENT))).isFalse();
        assertThat(teamHolder.allows(row("assignments.manage", PermissionScope.ORG))).isFalse();
        RoleCeiling orgHolder = RoleCeiling.of(List.of(p("assignments.manage", PermissionScope.ORG, null, null)));
        for (PermissionScope s : PermissionScope.values()) assertThat(orgHolder.allows(row("assignments.manage", s))).as(s.name()).isTrue();
    }

    @Test
    void ownRowsAreNeverRefusedBecauseTheyReachOnlyTheHoldersOwnRecords() {
        RoleCeiling nothing = RoleCeiling.of(List.of());
        assertThat(nothing.allows(row("resumes.manage", PermissionScope.OWN))).isTrue();
        assertThat(nothing.allows(row("self.leave", PermissionScope.OWN))).isTrue();
        assertThat(nothing.allows(row("resumes.manage", PermissionScope.ASSIGNED))).isFalse();
    }

    @Test
    void aCeilingAttributeCanOnlyBeKeptOrTightenedNeverLoosened() {
        RoleCeiling admin = RoleCeiling.of(List.of(p("members.role.set", PermissionScope.ORG, OrgRolePermission.CEILING_BELOW_ADMIN, null)));
        assertThat(admin.allows(new Row("members.role.set", PermissionScope.ORG, null, null))).as("no attribute is looser than BELOW_ADMIN").isFalse();
        assertThat(admin.allows(new Row("members.role.set", PermissionScope.ORG, OrgRolePermission.CEILING_BELOW_ADMIN, null))).isTrue();
        assertThat(admin.allows(new Row("members.role.set", PermissionScope.ORG, OrgRolePermission.CEILING_MEMBER, null))).isTrue();
        RoleCeiling owner = RoleCeiling.of(List.of(p("members.role.set", PermissionScope.ORG, null, null)));
        for (String c : new String[] { null, OrgRolePermission.CEILING_BELOW_ADMIN, OrgRolePermission.CEILING_MEMBER }) {
            assertThat(owner.allows(new Row("members.role.set", PermissionScope.ORG, c, null))).as(String.valueOf(c)).isTrue();
        }
        RoleCeiling member = RoleCeiling.of(List.of(p("members.invite", PermissionScope.ORG, OrgRolePermission.CEILING_MEMBER, null)));
        assertThat(member.allows(new Row("members.invite", PermissionScope.ORG, OrgRolePermission.CEILING_BELOW_ADMIN, null))).isFalse();
    }

    @Test
    void anUnknownAttributeOnTheActorsSideNeverLoosensAnything() {
        RoleCeiling odd = RoleCeiling.of(List.of(p("members.invite", PermissionScope.ORG, "SOMETHING_NEW", null)));
        assertThat(odd.allows(new Row("members.invite", PermissionScope.ORG, null, null))).isFalse();
        assertThat(odd.allows(new Row("members.invite", PermissionScope.ORG, OrgRolePermission.CEILING_BELOW_ADMIN, null))).isFalse();
        assertThat(odd.allows(new Row("members.invite", PermissionScope.ORG, OrgRolePermission.CEILING_MEMBER, null))).isFalse();
    }

    @Test
    void aRowFilterTheActorIsBoundByMustBeCarriedOver() {
        RoleCeiling finance = RoleCeiling.of(List.of(p("audit.view", PermissionScope.ORG, null, OrgRolePermission.ROW_FILTER_BILLING_OPS)));
        assertThat(finance.allows(row("audit.view", PermissionScope.ORG))).as("the whole trail is wider than billing and ops rows").isFalse();
        assertThat(finance.allows(new Row("audit.view", PermissionScope.ORG, null, OrgRolePermission.ROW_FILTER_HR))).isFalse();
        assertThat(finance.allows(new Row("audit.view", PermissionScope.ORG, null, OrgRolePermission.ROW_FILTER_BILLING_OPS))).isTrue();
        RoleCeiling unfiltered = RoleCeiling.of(List.of(p("audit.view", PermissionScope.ORG, null, null)));
        assertThat(unfiltered.allows(new Row("audit.view", PermissionScope.ORG, null, OrgRolePermission.ROW_FILTER_HR))).isTrue();
    }

    @Test
    void severalRolesAreAlternativesAndOneOfThemMustCoverTheWholeRow() {
        // TEAM without a cap in one role, ORG capped in another: wanted ORG without a cap is covered by neither.
        RoleCeiling actor = RoleCeiling.of(List.of(
            p("members.role.set", PermissionScope.TEAM, null, null),
            p("members.role.set", PermissionScope.ORG, OrgRolePermission.CEILING_BELOW_ADMIN, null)
        ));
        assertThat(actor.allows(new Row("members.role.set", PermissionScope.ORG, null, null))).isFalse();
        assertThat(actor.allows(new Row("members.role.set", PermissionScope.TEAM, null, null))).isTrue();
        assertThat(actor.allows(new Row("members.role.set", PermissionScope.ORG, OrgRolePermission.CEILING_BELOW_ADMIN, null))).isTrue();
    }

    @Test
    void theFirstViolationIsReportedInOrder() {
        RoleCeiling actor = RoleCeiling.of(List.of(p("reports.view", PermissionScope.ORG, null, null)));
        List<Row> wanted = List.of(row("reports.view", PermissionScope.ORG), row("org.close", PermissionScope.ORG), row("billing.manage", PermissionScope.ORG));
        assertThat(actor.firstViolation(wanted)).map(Row::key).contains("org.close");
        assertThat(actor.firstViolation(List.of(row("reports.view", PermissionScope.ORG)))).isEmpty();
    }

    @Test
    void malformedActorRowsGrantNothing() {
        RoleCeiling actor = RoleCeiling.of(List.of(p(null, PermissionScope.ORG, null, null), p("reports.view", null, null, null)));
        assertThat(actor.allows(row("reports.view", PermissionScope.ORG))).isFalse();
    }

    // ---- 05 section 3 examples with the shipped templates --------------------------------------------------------------

    @Test
    void anOrgAdminCannotWriteOrgCloseOrTransferButCanWidenWhatTheyHoldAtOrg() {
        RoleCeiling admin = templateHolder(RoleTemplates.ORG_ADMIN);
        assertThat(admin.allows(row("org.close", PermissionScope.ORG))).isFalse();
        assertThat(admin.allows(row("org.transfer_ownership", PermissionScope.ORG))).isFalse();
        assertThat(admin.allows(row("assignments.manage", PermissionScope.TEAM))).isTrue();
        assertThat(admin.allows(row("assignments.manage", PermissionScope.ORG))).isTrue();
        assertThat(admin.allows(new Row("members.role.set", PermissionScope.ORG, null, null))).as("an admin cannot mint a role that may touch owners").isFalse();
        assertThat(admin.allows(new Row("members.role.set", PermissionScope.ORG, OrgRolePermission.CEILING_BELOW_ADMIN, null))).isTrue();
    }

    @Test
    void theOwnerIsBoundedByNothingButEveryoneElseIsBoundedByTheirRows() {
        RoleCeiling owner = RoleCeiling.unlimited(List.of(p("reports.view", PermissionScope.ORG, null, null)));
        assertThat(owner.allows(row("approvals.decide", PermissionScope.TEAM))).as("a key the OWNER template does not list").isTrue();
        assertThat(owner.allows(new Row("members.role.set", PermissionScope.ORG, null, null))).isTrue();
        assertThat(owner.ceilingRank("members.role.set")).isEqualTo(3);
        assertThat(RoleCeiling.of(List.of(p("reports.view", PermissionScope.ORG, null, null))).allows(row("approvals.decide", PermissionScope.TEAM))).isFalse();
    }

    @Test
    void theOwnerHoldsEverythingTheAdminHoldsAndMore() {
        RoleCeiling owner = templateHolder(RoleTemplates.OWNER);
        for (RoleTemplates.Grant g : RoleTemplates.find(RoleTemplates.ORG_ADMIN).orElseThrow().grants()) {
            assertThat(owner.allows(new Row(g.key(), g.scope(), g.ceilingRoleKey(), g.rowFilter()))).as(g.key()).isTrue();
        }
        assertThat(owner.allows(row("org.close", PermissionScope.ORG))).isTrue();
    }

    @Test
    void anHrSpecialistCannotGrantMarketingKeys() {
        RoleCeiling hr = templateHolder(RoleTemplates.HR_SPECIALIST);
        for (String key : new String[] { "member.act_for", "submissions.prepare", "approvals.decide", "assignments.manage" }) {
            assertThat(hr.allows(row(key, PermissionScope.ASSIGNED))).as(key).isFalse();
        }
        assertThat(hr.allows(row("hr.manage", PermissionScope.ORG))).isTrue();
    }

    @Test
    void everyTemplateIsWithinTheOwnersReachExceptTheOwnersOwnRoleLevelKeys() {
        RoleCeiling owner = templateHolder(RoleTemplates.OWNER);
        Map<String, List<String>> refused = RoleTemplates.all().stream().collect(Collectors.toMap(
            RoleTemplates.Template::key,
            t -> t.grants().stream().filter(g -> !owner.allows(new Row(g.key(), g.scope(), g.ceilingRoleKey(), g.rowFilter()))).map(RoleTemplates.Grant::key).toList()
        ));
        // The Owner template holds the ORG_ADMIN set, not the marketing / consultant / client keys: those are only refused when they are above OWN.
        assertThat(refused.get(RoleTemplates.OWNER)).isEmpty();
        assertThat(refused.get(RoleTemplates.ORG_ADMIN)).isEmpty();
        assertThat(refused.get(RoleTemplates.CONSULTANT)).as("a consultant's rows are all OWN").isEmpty();
        assertThat(refused.get(RoleTemplates.MEMBER)).isEmpty();
        assertThat(EntPermissions.all()).isNotEmpty();
    }
}
