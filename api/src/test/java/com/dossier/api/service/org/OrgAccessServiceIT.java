package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgType;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

/**
 * O1.2 against real rows: only an ACTIVE seat whose role holds the permission gets through; every other state of
 * the same person in the same org (INVITED, SUSPENDED, LEFT, REMOVED, ERASED) and the same person in ANOTHER org is a 404.
 */
@IntegrationTest
@Transactional
class OrgAccessServiceIT {

    @Autowired
    private OrgAccessService access;

    @Autowired
    private OrganizationRepository orgs;

    @Autowired
    private OrgMemberRepository members;

    @Autowired
    private UserRepository users;

    private User carol;
    private Organization orgA;
    private Organization orgB;

    @BeforeEach
    void seed() {
        carol = users.findOneByLogin("user").orElseThrow();
        orgA = org("access-a-" + System.nanoTime());
        orgB = org("access-b-" + System.nanoTime());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("user", null, java.util.List.of()));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private Organization org(String slug) {
        Organization o = new Organization();
        o.setSlug(slug);
        o.setName(slug);
        o.setType(OrgType.COMPANY);
        return orgs.saveAndFlush(o);
    }

    private OrgMember seat(Organization o, OrgRole role, OrgMemberStatus status) {
        OrgMember m = new OrgMember();
        m.setOrgId(o.getId());
        m.setUserId(carol.getId());
        m.setRole(role);
        m.setStatus(status);
        return members.saveAndFlush(m);
    }

    @Test
    void anActiveAdminGetsThroughInTheirOwnOrgAndIsStrangerInTheOther() {
        seat(orgA, OrgRole.ADMIN, OrgMemberStatus.ACTIVE);
        OrgMembership m = access.require(orgA.getId(), OrgPermission.MEMBERS_INVITE);
        assertThat(m.role()).isEqualTo(OrgRole.ADMIN);
        assertThat(m.login()).isEqualTo("user");
        assertThatThrownBy(() -> access.require(orgB.getId(), OrgPermission.MEMBERS_INVITE)).isInstanceOf(OrgNotFoundException.class);
        assertThat(access.resolve(orgB.getId())).isEmpty();
    }

    @Test
    void everyNonActiveSeatIsA404() {
        for (OrgMemberStatus s : new OrgMemberStatus[] {
            OrgMemberStatus.INVITED, OrgMemberStatus.SUSPENDED, OrgMemberStatus.LEFT, OrgMemberStatus.REMOVED, OrgMemberStatus.ERASED,
        }) {
            Organization o = org("access-" + s + "-" + System.nanoTime());
            seat(o, OrgRole.OWNER, s);
            assertThatThrownBy(() -> access.requireMember(o.getId())).as(s.name()).isInstanceOf(OrgNotFoundException.class);
        }
    }

    @Test
    void anOrdinaryMemberIsRefusedAdminPermissionsButSeesTheOrg() {
        seat(orgA, OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        assertThat(access.requireMember(orgA.getId()).permissionKeys()).containsExactly("ops.own_hours", "self.share_scope.set", "self.leave");
        assertThatThrownBy(() -> access.require(orgA.getId(), OrgPermission.REPORTS_VIEW)).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void aPlatformAdminAuthorityGrantsNoOrgAccess() {
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken("admin", null, java.util.List.of(new SimpleGrantedAuthority("ROLE_ADMIN")))
        );
        assertThatThrownBy(() -> access.require(orgA.getId(), OrgPermission.ORG_SETTINGS_MANAGE)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> access.requireMember(orgA.getId())).isInstanceOf(OrgNotFoundException.class);
    }
}
