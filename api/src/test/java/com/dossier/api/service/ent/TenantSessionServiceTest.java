package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TenantSessionServiceTest {

    private OrgMemberRepository members;
    private OrgAuditService audit;
    private TenantSessionService service;

    @BeforeEach
    void setUp() {
        members = mock(OrgMemberRepository.class);
        audit = mock(OrgAuditService.class);
        service = new TenantSessionService(members, audit);
    }

    @AfterEach
    void clear() {
        TenantContextHolder.clear();
    }

    private void seat(long org, long user, OrgRole role) {
        OrgMember m = new OrgMember();
        m.setRole(role);
        m.setStatus(OrgMemberStatus.ACTIVE);
        when(members.findByOrgIdAndUserIdAndStatusIn(eq(org), eq(user), any())).thenReturn(List.of(m));
    }

    @Test
    void noContextOrPlatformOrNoHostMeansNoBinding() {
        assertThat(service.bindingForLogin(1L, "u")).isEmpty();
        TenantContextHolder.set(TenantContext.platform("kiwiply.com"));
        assertThat(service.bindingForLogin(1L, "u")).isEmpty();
        TenantContextHolder.set(TenantContext.unknown(null, TenantContext.Reason.NO_HOST));
        assertThat(service.bindingForLogin(1L, "u")).isEmpty();
    }

    @Test
    void anActiveMemberOnATenantHostIsBound() {
        TenantContextHolder.set(TenantContext.tenant(7L, 9L, "acme.kiwiply.com"));
        seat(7L, 1L, OrgRole.MEMBER);
        assertThat(service.bindingForLogin(1L, "u")).contains(new TenantBinding(7L, 9L));
    }

    @Test
    void aNonMemberIsDeniedAndAudited() {
        TenantContextHolder.set(TenantContext.tenant(7L, 9L, "acme.kiwiply.com"));
        when(members.findByOrgIdAndUserIdAndStatusIn(eq(7L), eq(1L), any())).thenReturn(List.of());
        assertThatThrownBy(() -> service.bindingForLogin(1L, "u")).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(403);
            assertThat(e.getCode()).isEqualTo("NOT_A_MEMBER");
        });
        verify(audit).recordHostEvent(eq(7L), eq(9L), eq("u"), eq(OrgAuditService.LOGIN_DENIED_NOT_MEMBER), any(), any());
    }

    @Test
    void aReservedRoleIsNotAMember() {
        TenantContextHolder.set(TenantContext.tenant(7L, null, "acme.kiwiply.com"));
        seat(7L, 1L, OrgRole.COACH);
        assertThatThrownBy(() -> service.bindingForLogin(1L, "u")).isInstanceOf(OrgException.class);
    }

    @Test
    void aHostThatIsGivenButNotServedIsA404AndNeverAudited() {
        TenantContextHolder.set(TenantContext.unknown("nobody.kiwiply.com", TenantContext.Reason.UNKNOWN_HOST));
        assertThatThrownBy(() -> service.bindingForLogin(1L, "u")).isInstanceOf(OrgNotFoundException.class);
        verify(audit, never()).recordHostEvent(any(), any(), any(), any(), any(), any());
    }

    @Test
    void refreshRules() {
        seat(7L, 1L, OrgRole.MEMBER);
        assertThat(service.refreshAllowed(null, null)).as("unbound token: not this service's business").isTrue();
        assertThat(service.refreshAllowed(7L, 1L)).as("no context, seat active").isTrue();
        assertThat(service.refreshAllowed(7L, null)).isFalse();
        TenantContextHolder.set(TenantContext.tenant(7L, null, "acme.kiwiply.com"));
        assertThat(service.refreshAllowed(7L, 1L)).isTrue();
        TenantContextHolder.set(TenantContext.tenant(8L, null, "beta.kiwiply.com"));
        assertThat(service.refreshAllowed(7L, 1L)).as("another tenant's host").isFalse();
        TenantContextHolder.set(TenantContext.unknown("nobody.kiwiply.com", TenantContext.Reason.UNKNOWN_HOST));
        assertThat(service.refreshAllowed(7L, 1L)).as("unserved host").isFalse();
        TenantContextHolder.set(TenantContext.platform("kiwiply.com"));
        assertThat(service.refreshAllowed(7L, 2L)).as("seat gone").isFalse();
    }

    // ---- gap D-3: the refresh rule (user decision 2026-11-18) -------------------------------------------------------------

    private TenantResolver liveness(boolean live) {
        TenantResolver r = mock(TenantResolver.class);
        when(r.hostnameLive(any(), any())).thenReturn(live);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "resolver", r);
        return r;
    }

    private void orgStatus(long orgId, com.dossier.api.domain.enumeration.OrgStatus status) {
        com.dossier.api.repository.org.OrganizationRepository orgs = mock(com.dossier.api.repository.org.OrganizationRepository.class);
        com.dossier.api.domain.org.Organization o = new com.dossier.api.domain.org.Organization();
        o.setStatus(status);
        when(orgs.findByOrgId(orgId)).thenReturn(java.util.Optional.of(o));
        org.springframework.test.util.ReflectionTestUtils.setField(service, "organizations", orgs);
    }

    @Test
    void anOrganizationSessionRenewsOnlyOnItsOwnTenantHost() {
        seat(7L, 1L, OrgRole.MEMBER);
        TenantContextHolder.set(TenantContext.tenant(7L, null, "acme.kiwiply.com"));
        assertThat(service.tenantRefreshAllowed(7L, null, 1L, false)).isTrue();
        TenantContextHolder.set(TenantContext.platform("kiwiply.com"));
        assertThat(service.tenantRefreshAllowed(7L, null, 1L, false)).as("never on the platform host").isFalse();
        TenantContextHolder.clear();
        assertThat(service.tenantRefreshAllowed(7L, null, 1L, false)).as("never with no host").isFalse();
        TenantContextHolder.set(TenantContext.tenant(8L, null, "beta.kiwiply.com"));
        assertThat(service.tenantRefreshAllowed(7L, null, 1L, false)).as("never on another organization's host").isFalse();
        assertThat(service.tenantRefreshAllowed(null, null, 1L, false)).as("a personal token is not this rule's business").isTrue();
    }

    @Test
    void aSessionFromAHostnameThatIsNoLongerLiveDoesNotRenew() {
        seat(7L, 1L, OrgRole.MEMBER);
        TenantContextHolder.set(TenantContext.tenant(7L, null, "acme.kiwiply.com"));
        TenantResolver r = liveness(false);
        assertThat(service.tenantRefreshAllowed(7L, 77L, 1L, false)).as("signed in on a suspended custom domain").isFalse();
        verify(r).hostnameLive(7L, 77L);
        liveness(true);
        assertThat(service.tenantRefreshAllowed(7L, 77L, 1L, false)).isTrue();
    }

    @Test
    void anExtensionSessionRenewsOnThePlatformHostOnlyWhileItsOrganizationIsLive() {
        seat(7L, 1L, OrgRole.MEMBER);
        TenantContextHolder.set(TenantContext.platform("api.kiwiply.com"));
        orgStatus(7L, com.dossier.api.domain.enumeration.OrgStatus.ACTIVE);
        assertThat(service.tenantRefreshAllowed(7L, null, 1L, true)).isTrue();
        orgStatus(7L, com.dossier.api.domain.enumeration.OrgStatus.PAST_DUE);
        assertThat(service.tenantRefreshAllowed(7L, null, 1L, true)).isTrue();
        orgStatus(7L, com.dossier.api.domain.enumeration.OrgStatus.SUSPENDED);
        assertThat(service.tenantRefreshAllowed(7L, null, 1L, true)).isFalse();
        orgStatus(7L, com.dossier.api.domain.enumeration.OrgStatus.CLOSED);
        assertThat(service.tenantRefreshAllowed(7L, null, 1L, true)).isFalse();
    }
}
