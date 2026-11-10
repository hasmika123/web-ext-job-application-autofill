package com.dossier.api.service.ent.mkt.approvals;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.privacy.JobLeaseService;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The expiry job visits only organizations with the marketing module on, one at a time, and one organization's failure never stops the others. */
class ApprovalExpiryJobTest {

    static final Instant NOW = Instant.parse("2026-10-17T12:00:00Z");

    OrganizationRepository organizations = mock(OrganizationRepository.class);
    TenantModules modules = mock(TenantModules.class);
    ApprovalService approvals = mock(ApprovalService.class);
    JobLeaseService leases = mock(JobLeaseService.class);
    ApprovalExpiryJob job = new ApprovalExpiryJob(organizations, modules, approvals, leases);

    @Test
    void onlyOrganizationsWithTheMarketingModuleAreVisitedAndTheirCountsAreAdded() {
        when(organizations.findAllOrgIds()).thenReturn(List.of(1L, 2L, 3L));
        when(modules.isOn(TenantModule.MARKETING, 1L)).thenReturn(true);
        when(modules.isOn(TenantModule.MARKETING, 2L)).thenReturn(false);
        when(modules.isOn(TenantModule.MARKETING, 3L)).thenReturn(true);
        when(approvals.expire(1L, NOW)).thenReturn(2);
        when(approvals.expire(3L, NOW)).thenReturn(1);
        assertThat(job.runOnce(NOW)).isEqualTo(3);
        verify(approvals, never()).expire(eq(2L), any());
    }

    @Test
    void aFailingOrganizationDoesNotStopTheOthers() {
        when(organizations.findAllOrgIds()).thenReturn(List.of(1L, 3L));
        when(modules.isOn(TenantModule.MARKETING, 1L)).thenReturn(true);
        when(modules.isOn(TenantModule.MARKETING, 3L)).thenReturn(true);
        when(approvals.expire(1L, NOW)).thenThrow(new IllegalStateException("db down"));
        when(approvals.expire(3L, NOW)).thenReturn(4);
        assertThat(job.runOnce(NOW)).isEqualTo(4);
    }

    @Test
    void theScheduledRunTakesTheLeaseFirst() {
        job.scheduled();
        verify(leases).withLease(eq("mkt-approval-expiry"), any(), any(), any(), any());
    }
}
