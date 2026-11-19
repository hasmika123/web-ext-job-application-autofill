package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

/**
 * Gap D-3: when the platform admin suspends or resumes an organization, the tenant cache is told at once (the event the resolver evicts on, after
 * commit), so its hosts stop or start resolving with the next request instead of after the cache's lifetime. Closing an organization already did this.
 */
class AdminOrgSuspendEvictsTenantCacheTest {

    OrganizationRepository organizations = mock(OrganizationRepository.class);
    ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    Organization org = new Organization();
    AdminOrgService service;

    @BeforeEach
    void wire() {
        AdminOrgService real = new AdminOrgService(
            null, organizations, null, null, null, null, null,
            mock(com.dossier.api.service.AdminAuditService.class), mock(OrgAuditService.class),
            null, null, null, null, null, null, null, null
        );
        real.setEvents(events);
        service = spy(real);
        doReturn(null).when(service).detail(anyLong());
        when(organizations.findByOrgId(7L)).thenReturn(Optional.of(org));
    }

    @Test
    void suspendingAnOrganizationTellsTheTenantCache() {
        org.setStatus(OrgStatus.ACTIVE);
        service.suspendOrg(7L, "Invoice unpaid for two months");
        assertThat(org.getStatus()).isEqualTo(OrgStatus.SUSPENDED);
        ArgumentCaptor<Object> sent = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(sent.capture());
        assertThat(sent.getValue()).isInstanceOf(TenantConfigChangedEvent.class);
        assertThat(((TenantConfigChangedEvent) sent.getValue()).reason()).contains("7").contains("suspended");
    }

    @Test
    void resumingAnOrganizationTellsTheTenantCache() {
        org.setStatus(OrgStatus.SUSPENDED);
        service.resumeOrg(7L, "Invoice paid in full today");
        assertThat(org.getStatus()).isEqualTo(OrgStatus.ACTIVE);
        verify(events).publishEvent(any(TenantConfigChangedEvent.class));
    }

    @Test
    void aRefusedSuspendTellsNobody() {
        org.setStatus(OrgStatus.CLOSED);
        try {
            service.suspendOrg(7L, "Invoice unpaid for two months");
        } catch (OrgException expected) {
            // 409 ORG_NOT_EDITABLE
        }
        verify(events, never()).publishEvent(any());
    }
}
