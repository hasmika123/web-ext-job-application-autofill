package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

/**
 * X1.6 end to end against MySQL: with {@code flag.enterprise.roles} on, {@code OrgAccessService} builds the membership from
 * the {@code org_member_role} rows (union of roles, widest scope wins), and falls back to the legacy enum whenever the data
 * is missing or disagrees with it. With the flag off nothing is read from the new tables at all.
 */
@IntegrationTest
@Transactional
class OrgRolesDataAccessIT {

    private static final String WHO = "roles-data-it";

    @Autowired private OrgAccessService access;
    @Autowired private OrgRoleService roleService;
    @Autowired private RoleTemplateSeeder seeder;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgRoleRepository roles;
    @Autowired private OrgMemberRoleRepository memberRoles;
    @Autowired private UserRepository users;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private EntityManager em;

    private OrgFixtures fx;
    private Organization orgA;
    private Organization orgB;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        orgA = fx.org("rd-a-" + System.nanoTime(), OrgStatus.ACTIVE);
        orgB = fx.org("rd-b-" + System.nanoTime(), OrgStatus.ACTIVE);
        seeder.seed();
        flags(true);
    }

    @AfterEach
    void clean() {
        SecurityContextHolder.clearContext();
        em.clear(); // a test that provoked a constraint violation leaves a transient entity that must not be flushed
        for (AppSetting s : rows.findAll()) if (WHO.equals(s.getUpdatedBy())) rows.delete(s);
        cache.invalidate();
    }

    private void flags(boolean on) {
        for (AppSetting s : rows.findAll()) if (WHO.equals(s.getUpdatedBy())) rows.delete(s);
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":" + on + "}", WHO, Instant.now()));
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":" + on + "}", WHO, Instant.now()));
        cache.invalidate();
    }

    private void signIn(String login) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(login, null, List.of()));
    }

    private OrgRoleDefinition system(String key) {
        return roles.findSystemByRoleKey(key).orElseThrow();
    }

    private OrgMemberRole grant(Organization org, OrgMember seat, String templateKey, boolean primary) {
        OrgMemberRole r = new OrgMemberRole();
        r.setOrgId(org.getId());
        r.setMemberId(seat.getId());
        r.setRoleId(system(templateKey).getId());
        r.setPrimary(primary);
        return memberRoles.saveAndFlush(r);
    }

    // ---- reading from data ------------------------------------------------------------------------------------------

    @Test
    void aSeatWithItsRoleRowsReadsTheSameAsTheEnumForEveryLegacyRole() {
        for (OrgRole role : new OrgRole[] { OrgRole.OWNER, OrgRole.ADMIN, OrgRole.STAFF, OrgRole.MEMBER, OrgRole.MARKETER, OrgRole.FINANCE }) {
            String login = "rd-eq-" + role.name().toLowerCase();
            OrgMember seat = fx.active(orgA, login, role);
            roleService.syncFromLegacy(seat);
            signIn(login);
            OrgMembership m = access.requireMember(orgA.getId());
            assertThat(m.roles()).as(role + " reads from data").hasSize(1).allSatisfy(r -> assertThat(r.roleId()).isNotNull());
            for (OrgPermission p : OrgPermission.values()) {
                // The admin role gap (05 s3): OWNER and ORG_ADMIN now hold the two consent-gated marketer keys at ORG too (the share
                // consent and the assignment kinds still gate their use); everything else is exactly what the enum gave.
                boolean adminGap = (role == OrgRole.OWNER || role == OrgRole.ADMIN) && (p == OrgPermission.MEMBER_VIEW_FULL || p == OrgPermission.MEMBER_ACT_FOR);
                if (adminGap) {
                    assertThat(m.can(p)).as("%s / %s since the admin role gap", role, p.key()).isTrue();
                    continue;
                }
                assertThat(m.can(p)).as("%s / %s", role, p.key()).isEqualTo(role.can(p));
                assertThat(m.scopeOf(p)).as("%s / %s scope", role, p.key()).isEqualTo(role.scopeOf(p));
            }
            assertThat(m.role()).isEqualTo(role);
        }
    }

    @Test
    void aMemberWithAdminAndMarketingManagerHoldsTheUnionAndTeamAssignmentsWidenToOrg() {
        OrgMember seat = fx.active(orgA, "rd-multi", OrgRole.ADMIN);
        roleService.syncFromLegacy(seat); // ORG_ADMIN primary
        grant(orgA, seat, "MARKETING_MANAGER", false);
        signIn("rd-multi");
        OrgMembership m = access.requireMember(orgA.getId());
        assertThat(m.roles()).extracting(OrgMembership.RoleRef::key).containsExactly("ORG_ADMIN", "MARKETING_MANAGER");
        assertThat(m.primaryRoleKey()).contains("ORG_ADMIN");
        assertThat(m.scopeFor("assignments.manage")).as("ORG on ORG_ADMIN, TEAM on MARKETING_MANAGER: widest wins").contains(PermissionScope.ORG);
        assertThat(m.scopeFor("approvals.decide")).as("the manager role grants it at TEAM, ORG_ADMIN holds every key at ORG since the admin role gap: widest wins").contains(PermissionScope.ORG);
        assertThat(m.canKey("approvals.decide")).isTrue();
        assertThat(m.permissionKeys()).contains("approvals.decide", "assignments.manage", "members.invite");
        assertThat(m.role()).as("the legacy mirror is the primary role").isEqualTo(OrgRole.ADMIN);
    }

    @Test
    void permissionsGrantedOnlyByASecondaryRoleReachTheLegacyChecks() {
        OrgMember seat = fx.active(orgA, "rd-second", OrgRole.MEMBER);
        roleService.syncFromLegacy(seat);
        signIn("rd-second");
        assertThatThrownBy(() -> access.require(orgA.getId(), OrgPermission.REPORTS_EXPORT)).isInstanceOf(OrgNotFoundException.class);
        grant(orgA, seat, "FINANCE_SPECIALIST", false);
        assertThat(access.require(orgA.getId(), OrgPermission.REPORTS_EXPORT).canKey("finance.manage")).isTrue();
    }

    // ---- never trusting doubtful data -------------------------------------------------------------------------------

    @Test
    void aSeatWithNoRoleRowsKeepsTheEnum() {
        fx.active(orgA, "rd-norows", OrgRole.ADMIN);
        signIn("rd-norows");
        OrgMembership m = access.requireMember(orgA.getId());
        assertThat(m.roles()).hasSize(1);
        assertThat(m.roles().get(0).roleId()).as("derived from the enum").isNull();
        assertThat(m.can(OrgPermission.MEMBERS_REMOVE)).isTrue();
    }

    @Test
    void whenTheEnumChangedWithoutTheRolesTheDataIsDriftAndTheEnumWins() {
        OrgMember seat = fx.active(orgA, "rd-drift", OrgRole.ADMIN);
        roleService.syncFromLegacy(seat);
        seat.setRole(OrgRole.MEMBER); // a legacy write that did not touch the roles: demoted
        members.saveAndFlush(seat);
        signIn("rd-drift");
        OrgMembership m = access.requireMember(orgA.getId());
        assertThat(m.can(OrgPermission.MEMBERS_REMOVE)).as("the stale ORG_ADMIN row must not keep granting admin rights").isFalse();
        assertThat(m.permissionKeys()).containsExactly("ops.own_hours", "self.share_scope.set", "self.leave");
    }

    @Test
    void aRoleRowOfAnotherOrganizationIsIgnored() {
        OrgMember seat = fx.active(orgA, "rd-foreign", OrgRole.MEMBER);
        roleService.syncFromLegacy(seat);
        // an organization role that belongs to org B, wired to A's member (the FK cannot forbid it; the read path must)
        OrgRoleDefinition foreign = new OrgRoleDefinition();
        foreign.setOrgId(orgB.getId());
        foreign.setRoleKey("B_SECRET_ADMIN");
        foreign.setName("B only");
        foreign.setTemplateKey("ORG_ADMIN");
        roles.saveAndFlush(foreign);
        OrgMemberRole row = new OrgMemberRole();
        row.setOrgId(orgA.getId());
        row.setMemberId(seat.getId());
        row.setRoleId(foreign.getId());
        memberRoles.saveAndFlush(row);
        signIn("rd-foreign");
        OrgMembership m = access.requireMember(orgA.getId());
        assertThat(m.can(OrgPermission.MEMBERS_REMOVE)).isFalse();
        assertThat(m.roles().get(0).roleId()).as("fell back to the enum").isNull();
    }

    @Test
    void withTheFlagOffTheRoleRowsAreNeverConsulted() {
        OrgMember seat = fx.active(orgA, "rd-off", OrgRole.MEMBER);
        roleService.syncFromLegacy(seat);
        grant(orgA, seat, "FINANCE_SPECIALIST", false);
        flags(false);
        signIn("rd-off");
        OrgMembership m = access.requireMember(orgA.getId());
        assertThat(m.can(OrgPermission.BILLING_VIEW)).isFalse();
        assertThat(m.roles().get(0).roleId()).isNull();
    }

    @Test
    void anotherOrganizationsMemberStaysAStrangerWhateverTheirRoles() {
        OrgMember seat = fx.active(orgB, "rd-b-owner", OrgRole.OWNER);
        roleService.syncFromLegacy(seat);
        signIn("rd-b-owner");
        assertThatThrownBy(() -> access.requireMember(orgA.getId())).isInstanceOf(OrgNotFoundException.class);
        assertThat(access.requireMember(orgB.getId()).can(OrgPermission.ORG_CLOSE)).isTrue();
    }

    // ---- the database keeps the invariants -----------------------------------------------------------------------

    @Test
    void theDatabaseRefusesTwoLivePrimariesAndADuplicateLiveRole() {
        OrgMember seat = fx.active(orgA, "rd-unique", OrgRole.MEMBER);
        roleService.syncFromLegacy(seat);
        assertThatThrownBy(() -> grant(orgA, seat, "FINANCE_SPECIALIST", true)).as("one live primary per member").isInstanceOf(DataIntegrityViolationException.class);
        em.clear();
    }

    @Test
    void theDatabaseRefusesADuplicateLiveRolePerMemberButAllowsItAgainOnceEnded() {
        OrgMember seat = fx.active(orgA, "rd-dup", OrgRole.MEMBER);
        roleService.syncFromLegacy(seat);
        OrgMemberRole f = grant(orgA, seat, "FINANCE_SPECIALIST", false);
        assertThatThrownBy(() -> grant(orgA, seat, "FINANCE_SPECIALIST", false)).isInstanceOf(DataIntegrityViolationException.class);
        em.clear();
        OrgMemberRole again = memberRoles.findLiveByOrgIdAndMemberId(orgA.getId(), seat.getId()).stream().filter(r -> r.getId().equals(f.getId())).findFirst().orElseThrow();
        again.setEndsAt(Instant.now());
        memberRoles.saveAndFlush(again);
        grant(orgA, seat, "FINANCE_SPECIALIST", false); // the slot is free: history is kept, the role can be granted again
        assertThat(memberRoles.findLiveByOrgIdAndMemberId(orgA.getId(), seat.getId())).hasSize(2);
    }

    @Test
    void roleKeysAreUniquePerOrganizationButRepeatAcrossOrganizations() {
        for (Organization o : List.of(orgA, orgB)) {
            OrgRoleDefinition d = new OrgRoleDefinition();
            d.setOrgId(o.getId());
            d.setRoleKey("REGIONAL_LEAD");
            d.setName("Regional lead");
            roles.saveAndFlush(d);
        }
        OrgRoleDefinition dup = new OrgRoleDefinition();
        dup.setOrgId(orgA.getId());
        dup.setRoleKey("REGIONAL_LEAD");
        dup.setName("again");
        assertThatThrownBy(() -> roles.saveAndFlush(dup)).isInstanceOf(DataIntegrityViolationException.class);
        em.clear();
        OrgRoleDefinition sys = new OrgRoleDefinition();
        sys.setRoleKey("OWNER"); // a second organization-independent OWNER
        sys.setName("dup");
        assertThatThrownBy(() -> roles.saveAndFlush(sys)).as("system keys are unique even though org_id is NULL").isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void theVerificationQueryCountsSeatsWithoutAPrimaryRole() {
        OrgMember withRow = fx.active(orgA, "rd-ver-1", OrgRole.MEMBER);
        roleService.syncFromLegacy(withRow);
        fx.active(orgA, "rd-ver-2", OrgRole.ADMIN); // no rows yet
        fx.seat(orgA, "rd-ver-3", OrgRole.MEMBER, OrgMemberStatus.LEFT); // not live: not counted
        fx.active(orgA, "rd-ver-4", OrgRole.COACH); // reserved: no template, not counted
        assertThat(memberRoles.countLiveSeatsWithoutPrimaryRole(orgA.getId())).isEqualTo(1);
        assertThat(memberRoles.countLiveSeatsWithoutPrimaryRole(orgB.getId())).as("counted per organization").isZero();
        User u = users.findOneByLogin("rd-ver-2").orElseThrow();
        roleService.syncFromLegacy(members.findByOrgIdAndUserIdAndStatusIn(orgA.getId(), u.getId(), List.of(OrgMemberStatus.ACTIVE)).get(0));
        assertThat(memberRoles.countLiveSeatsWithoutPrimaryRole(orgA.getId())).isZero();
    }
}
