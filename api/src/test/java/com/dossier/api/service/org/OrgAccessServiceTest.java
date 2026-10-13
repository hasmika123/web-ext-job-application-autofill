package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgScope;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.OrgType;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * O1.2: the 404 semantics. A foreign org, a missing org, a missing role permission, a seat that is not ACTIVE and a
 * platform ROLE_ADMIN who is not a member all answer the SAME generic 404; only a seat whose role holds the permission
 * gets through.
 */
class OrgAccessServiceTest {

    private static final Long ORG = 10L;
    private static final Long USER_ID = 5L;

    private UserRepository users;
    private OrgMemberRepository members;
    private OrganizationRepository orgs;
    private OrgAccessService service;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        members = mock(OrgMemberRepository.class);
        orgs = mock(OrganizationRepository.class);
        service = new OrgAccessService(users, members, orgs, null);
        User u = new User();
        u.setId(USER_ID);
        u.setLogin("carol");
        when(users.findOneByLogin("carol")).thenReturn(Optional.of(u));
        Organization org = new Organization();
        org.setId(ORG);
        org.setType(OrgType.BOOTCAMP);
        org.setStatus(OrgStatus.ACTIVE);
        when(orgs.findByOrgId(ORG)).thenReturn(Optional.of(org));
        signIn("carol");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void signIn(String login, String... authorities) {
        var token = new UsernamePasswordAuthenticationToken(
            login, null, java.util.Arrays.stream(authorities).map(SimpleGrantedAuthority::new).toList()
        );
        SecurityContextHolder.getContext().setAuthentication(token);
    }

    private void seat(OrgRole role) {
        OrgMember m = new OrgMember();
        m.setId(77L);
        m.setOrgId(ORG);
        m.setUserId(USER_ID);
        m.setRole(role);
        m.setStatus(OrgMemberStatus.ACTIVE);
        when(members.findByOrgIdAndUserIdAndStatusIn(eq(ORG), eq(USER_ID), any())).thenReturn(List.of(m));
    }

    private void assertGeneric404(Throwable t) {
        assertThat(t).isInstanceOf(OrgNotFoundException.class);
        OrgNotFoundException e = (OrgNotFoundException) t;
        assertThat(e.getStatus()).isEqualTo(404);
        assertThat(e.getCode()).isEqualTo("NOT_FOUND");
        assertThat(e.getMessage()).isEqualTo("Not found");
        assertThat(e.getMessage().toLowerCase()).doesNotContain("forbidden").doesNotContain("permission").doesNotContain("role");
    }

    @Test
    void aMemberWhoseRoleHoldsThePermissionGetsTheMembership() {
        seat(OrgRole.ADMIN);
        OrgMembership m = service.require(ORG, OrgPermission.MEMBERS_INVITE);
        assertThat(m.orgId()).isEqualTo(ORG);
        assertThat(m.memberId()).isEqualTo(77L);
        assertThat(m.login()).isEqualTo("carol");
        assertThat(m.role()).isEqualTo(OrgRole.ADMIN);
        assertThat(m.orgStatus()).isEqualTo(OrgStatus.ACTIVE);
        assertThat(m.scopeOf(OrgPermission.MEMBERS_ROLE_SET)).contains(OrgScope.BELOW_ADMIN_ROLES);
        assertThat(m.permissionKeys()).contains("members.invite").doesNotContain("org.close");
    }

    @Test
    void aRoleWithoutThePermissionIsA404NotA403() {
        seat(OrgRole.MEMBER);
        assertThatThrownBy(() -> service.require(ORG, OrgPermission.MEMBERS_INVITE)).satisfies(this::assertGeneric404);
    }

    @Test
    void adminCannotCloseAnOrg() {
        seat(OrgRole.ADMIN);
        assertThatThrownBy(() -> service.require(ORG, OrgPermission.ORG_CLOSE)).satisfies(this::assertGeneric404);
    }

    @Test
    void aForeignOrgIsA404() {
        seat(OrgRole.OWNER);
        // carol owns ORG 10, asks about org 11 where she has no seat
        when(members.findByOrgIdAndUserIdAndStatusIn(eq(11L), eq(USER_ID), any())).thenReturn(List.of());
        assertThatThrownBy(() -> service.require(11L, OrgPermission.ORG_SETTINGS_MANAGE)).satisfies(this::assertGeneric404);
    }

    @Test
    void aMissingOrgLooksExactlyLikeAForeignOne() {
        when(members.findByOrgIdAndUserIdAndStatusIn(eq(999L), eq(USER_ID), any())).thenReturn(List.of());
        Throwable missing = org.assertj.core.api.Assertions.catchThrowable(() -> service.require(999L, OrgPermission.BILLING_VIEW));
        seat(OrgRole.MEMBER);
        Throwable foreign = org.assertj.core.api.Assertions.catchThrowable(() -> service.require(ORG, OrgPermission.BILLING_VIEW));
        assertGeneric404(missing);
        assertGeneric404(foreign);
        assertThat(((OrgNotFoundException) missing).getExtra()).isEqualTo(((OrgNotFoundException) foreign).getExtra());
    }

    @Test
    void onlyActiveSeatsAreEverLookedUp() {
        // INVITED / SUSPENDED / LEFT / REMOVED / ERASED seats never reach the role check: the query asks for ACTIVE only
        when(members.findByOrgIdAndUserIdAndStatusIn(eq(ORG), eq(USER_ID), any())).thenAnswer(inv -> {
            java.util.Collection<OrgMemberStatus> asked = inv.getArgument(2);
            assertThat(asked).containsExactly(OrgMemberStatus.ACTIVE);
            return List.of();
        });
        assertThatThrownBy(() -> service.require(ORG, OrgPermission.REPORTS_VIEW)).satisfies(this::assertGeneric404);
    }

    @Test
    void aPlatformAdminWhoIsNotAMemberGetsNothing() {
        signIn("carol", "ROLE_ADMIN", "ROLE_USER");
        when(members.findByOrgIdAndUserIdAndStatusIn(eq(ORG), eq(USER_ID), any())).thenReturn(List.of());
        assertThatThrownBy(() -> service.require(ORG, OrgPermission.ORG_SETTINGS_MANAGE)).satisfies(this::assertGeneric404);
        assertThatThrownBy(() -> service.requireMember(ORG)).satisfies(this::assertGeneric404);
        assertThat(service.resolve(ORG)).isEmpty();
    }

    @Test
    void aPlatformAdminWhoIsAMemberGetsOnlyTheirRolesPermissions() {
        signIn("carol", "ROLE_ADMIN");
        seat(OrgRole.MEMBER);
        assertThatThrownBy(() -> service.require(ORG, OrgPermission.REPORTS_VIEW)).satisfies(this::assertGeneric404);
        assertThat(service.requireMember(ORG).role()).isEqualTo(OrgRole.MEMBER);
    }

    @Test
    void noSignedInUserIsA404() {
        SecurityContextHolder.clearContext();
        assertThatThrownBy(() -> service.require(ORG, OrgPermission.REPORTS_VIEW)).satisfies(this::assertGeneric404);
    }

    @Test
    void aNullOrgIdIsA404() {
        assertThatThrownBy(() -> service.requireMember(null)).satisfies(this::assertGeneric404);
    }

    @Test
    void aSeatWithAReservedRoleIsRefused() {
        seat(OrgRole.COACH);
        assertThatThrownBy(() -> service.requireMember(ORG)).satisfies(this::assertGeneric404);
    }

    @Test
    void requireMemberAcceptsAnyActiveRoleIncludingMember() {
        seat(OrgRole.MEMBER);
        assertThat(service.requireMember(ORG).role()).isEqualTo(OrgRole.MEMBER);
    }

    @Test
    void requireAllDemandsEveryPermission() {
        seat(OrgRole.STAFF);
        assertThat(service.requireAll(ORG, List.of(OrgPermission.REPORTS_VIEW, OrgPermission.MEMBERS_INVITE)).role()).isEqualTo(OrgRole.STAFF);
        assertThatThrownBy(() -> service.requireAll(ORG, List.of(OrgPermission.REPORTS_VIEW, OrgPermission.BILLING_VIEW))).satisfies(this::assertGeneric404);
    }

    @Test
    void requireNeedsAPermission() {
        assertThatThrownBy(() -> service.require(ORG, null)).isInstanceOf(IllegalArgumentException.class);
    }
}
