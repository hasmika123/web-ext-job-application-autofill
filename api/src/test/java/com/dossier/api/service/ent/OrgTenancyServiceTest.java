package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.org.OrgAuditService;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** X1.3: a tenancy write evicts the resolver cache, but only once the transaction that made the change has committed. */
class OrgTenancyServiceTest {

    private final OrganizationRepository organizations = mock(OrganizationRepository.class);
    private final OrgHostnameRepository hostnames = mock(OrgHostnameRepository.class);
    private final OrgAuditService audit = mock(OrgAuditService.class);
    private final TenantResolver resolver = mock(TenantResolver.class);
    private final OrgTenancyService service = new OrgTenancyService(organizations, hostnames, audit, resolver);
    private Organization org;

    @BeforeEach
    void setUp() {
        org = new Organization();
        org.setId(7L);
        when(organizations.findByOrgId(7L)).thenReturn(Optional.of(org));
        when(organizations.saveAndFlush(any(Organization.class))).thenAnswer(i -> i.getArgument(0));
        when(hostnames.findBySubdomain(anyString())).thenReturn(Optional.empty());
    }

    @AfterEach
    void cleanup() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.clearSynchronization();
    }

    @Test
    void outsideATransactionTheCacheIsEvictedAtOnce() {
        service.setSubdomain(7L, "acme-corp", true);
        verify(resolver).invalidate();
    }

    @Test
    void insideATransactionTheEvictionWaitsForTheCommit() {
        TransactionSynchronizationManager.initSynchronization();
        service.setSubdomain(7L, "acme-corp", true);
        verify(resolver, never()).invalidate();
        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
        verify(resolver).invalidate();
    }

    @Test
    void aRefusedWriteEvictsNothing() {
        try {
            service.setSubdomain(7L, "www", true);
        } catch (RuntimeException expected) {
            assertThat(expected).isInstanceOf(com.dossier.api.service.org.OrgException.class);
        }
        verify(resolver, never()).invalidate();
    }
}
