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
}
