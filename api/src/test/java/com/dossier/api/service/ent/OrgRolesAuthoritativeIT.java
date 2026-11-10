package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.enumeration.OrgAccountMode;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

/**
 * X4.10: for an enterprise (SEPARATE-accounts) organization the {@code org_member_role} rows are the ONLY source of permissions.
 * A drifted {@code org_member.role} enum, a seat without role rows, or the roles sub-flag being off never falls back to the enum;
 * a legacy shared-account organization (account_mode SHARED) keeps its enum fallback unchanged.
 */
@IntegrationTest
@Transactional
class OrgRolesAuthoritativeIT {

    private static final String WHO = "roles-auth-it";

    @Autowired private OrgAccessService access;
    @Autowired private OrgRoleService roleService;
    @Autowired private RoleTemplateSeeder seeder;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgMemberRoleRepository memberRoles;
    @Autowired private UserRepository users;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private EntityManager em;

    private OrgFixtures fx;
    private Organization tenant;
    private Organization legacy;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        tenant = fx.org("ra-t-" + System.nanoTime(), OrgStatus.ACTIVE);
        tenant.setAccountMode(OrgAccountMode.SEPARATE);
        orgs.saveAndFlush(tenant);
        legacy = fx.org("ra-l-" + System.nanoTime(), OrgStatus.ACTIVE);
        seeder.seed();
        flags(true);
    }

    @AfterEach
    void clean() {
        SecurityContextHolder.clearContext();
        em.clear();
        for (AppSetting s : rows.findAll()) if (WHO.equals(s.getUpdatedBy())) rows.delete(s);
        cache.invalidate();
    }

    private void flags(boolean roles) {
        for (AppSetting s : rows.findAll()) if (WHO.equals(s.getUpdatedBy())) rows.delete(s);
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}", WHO, Instant.now()));
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":" + roles + "}", WHO, Instant.now()));
        cache.invalidate();
    }

    private void signIn(String login) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(login, null, List.of()));
    }

    @Test
    void aDriftedEnumGrantsNothingInATenantOrganization() {
        OrgMember seat = fx.active(tenant, "ra-drift", OrgRole.MEMBER);
        roleService.syncFromLegacy(seat); // role rows say MEMBER
        seat.setRole(OrgRole.ADMIN); // the enum is raised without the role grid
        members.saveAndFlush(seat);
        signIn("ra-drift");
        OrgMembership m = access.requireMember(tenant.getId());
        assertThat(m.can(OrgPermission.MEMBERS_REMOVE)).as("the enum says ADMIN, the role rows do not").isFalse();
        assertThatThrownBy(() -> access.require(tenant.getId(), OrgPermission.MEMBERS_REMOVE)).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void aStaleHighRowIsStillWhatTheGridShowsEvenWhenTheEnumWasLowered() {
        OrgMember seat = fx.active(tenant, "ra-grid", OrgRole.ADMIN);
        roleService.syncFromLegacy(seat);
        seat.setRole(OrgRole.MEMBER);
        members.saveAndFlush(seat);
        signIn("ra-grid");
        // the role rows are the source of truth in both directions: the grid shows ORG_ADMIN, so ORG_ADMIN is what applies
        assertThat(access.requireMember(tenant.getId()).can(OrgPermission.MEMBERS_REMOVE)).isTrue();
    }

    @Test
    void aSeatWithNoRoleRowsIsNotAMemberOfATenantOrganization() {
        fx.active(tenant, "ra-norows", OrgRole.OWNER);
        signIn("ra-norows");
        assertThat(access.resolve(tenant.getId())).isEmpty();
        assertThatThrownBy(() -> access.requireMember(tenant.getId())).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void theRolesSubFlagBeingOffDoesNotRevertATenantOrganizationToTheEnum() {
        OrgMember seat = fx.active(tenant, "ra-flagoff", OrgRole.MEMBER);
        roleService.syncFromLegacy(seat);
        flags(false);
        signIn("ra-flagoff");
        OrgMembership m = access.requireMember(tenant.getId());
        assertThat(m.roles().get(0).roleId()).as("read from the role rows, not derived from the enum").isNotNull();
    }

    @Test
    void aSeatWithLiveRowsButNoPrimaryGrantsNothing() {
        OrgMember seat = fx.active(tenant, "ra-twoprim", OrgRole.MEMBER);
        roleService.syncFromLegacy(seat);
        // demote the only primary so the seat has live rows but no primary
        OrgMemberRole primary = memberRoles.findLiveByOrgIdAndMemberId(tenant.getId(), seat.getId()).get(0);
        primary.setPrimary(false);
        memberRoles.saveAndFlush(primary);
        signIn("ra-twoprim");
        assertThat(access.resolve(tenant.getId())).isEmpty();
    }

    @Test
    void aLegacySharedOrganizationKeepsItsEnumFallback() {
        fx.active(legacy, "ra-legacy", OrgRole.ADMIN); // no role rows
        signIn("ra-legacy");
        OrgMembership m = access.requireMember(legacy.getId());
        assertThat(m.can(OrgPermission.MEMBERS_REMOVE)).isTrue();
        assertThat(m.roles().get(0).roleId()).as("derived from the enum").isNull();
    }
}
