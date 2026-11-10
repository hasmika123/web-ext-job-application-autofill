package com.dossier.api.service.ent.mkt.approvals;

import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.ent.TenantScoped;
import com.dossier.api.service.privacy.JobLeaseService;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Closes manager approvals nobody decided in time ({@code org.pipeline.approval_expiry_days}, default 7): every 15 minutes, for each organization whose marketing
 * module is on, PENDING requests past their expiry become EXPIRED through {@link ApprovalService#expire} (nothing happens to the held action, the marketer is
 * told). Works one organization at a time inside {@link TenantScoped#get}; one organization's failure never stops the others. A lease
 * ({@code mkt-approval-expiry}, {@link JobLeaseService}) keeps a second API instance from running the same pass.
 */
@Component
public class ApprovalExpiryJob {

    private static final Logger LOG = LoggerFactory.getLogger(ApprovalExpiryJob.class);
    static final String LEASE = "mkt-approval-expiry";

    private final OrganizationRepository organizations;
    private final TenantModules modules;
    private final ApprovalService approvals;
    private final JobLeaseService leases;

    public ApprovalExpiryJob(OrganizationRepository organizations, TenantModules modules, ApprovalService approvals, JobLeaseService leases) {
        this.organizations = organizations;
        this.modules = modules;
        this.approvals = approvals;
        this.leases = leases;
    }

    @Scheduled(fixedDelayString = "${dossier.ent.mkt.approval-expiry-delay-ms:900000}", initialDelayString = "${dossier.ent.mkt.approval-expiry-initial-delay-ms:120000}")
    public void scheduled() {
        try {
            Instant now = Instant.now();
            leases.withLease(LEASE, Duration.ofMinutes(10), now, () -> runOnce(now), n -> "expired=" + n);
        } catch (RuntimeException e) {
            LOG.warn("Manager approval expiry run failed", e); // the next run retries; nothing here is time critical
        }
    }

    /** One pass over every organization with the marketing module on; returns how many requests expired. */
    public int runOnce(Instant now) {
        List<Long> orgIds = new ArrayList<>();
        TenantScoped.unscoped(() -> orgIds.addAll(organizations.findAllOrgIds())); // the one cross-tenant read: which organizations to visit
        int total = 0;
        for (Long orgId : orgIds) {
            try {
                if (!modules.isOn(TenantModule.MARKETING, orgId)) continue;
                total += TenantScoped.get(orgId, () -> approvals.expire(orgId, now));
            } catch (RuntimeException e) {
                LOG.warn("Approval expiry failed for org {}", orgId, e);
            }
        }
        if (total > 0) LOG.info("Expired {} manager approval request(s)", total);
        return total;
    }
}
