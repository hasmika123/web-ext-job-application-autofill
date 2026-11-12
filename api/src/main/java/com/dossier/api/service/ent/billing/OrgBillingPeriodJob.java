package com.dossier.api.service.ent.billing;

import com.dossier.api.service.privacy.JobLeaseService;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Hourly at :40 (UTC): closes the billing periods that ended ({@link OrgBillingPeriodService#runDue}) and marks overdue organizations. Hourly, not daily,
 * so a Stripe failure is retried well inside Stripe's 24-hour idempotency window (ORG-BILLING-BUILD.md step 3a); a run with nothing due writes nothing. This class only adds the cross-instance lease
 * ({@link JobLeaseService}, the pattern of the other enterprise jobs), so two API instances never write the same estimate twice.
 */
@Component
public class OrgBillingPeriodJob {

    private static final Logger LOG = LoggerFactory.getLogger(OrgBillingPeriodJob.class);

    /** The name of the lease in {@code job_lease}. */
    public static final String LEASE = "org-billing-period";

    static final Duration LEASE_TTL = Duration.ofMinutes(30);

    private final OrgBillingPeriodService service;
    private final JobLeaseService leases;

    public OrgBillingPeriodJob(OrgBillingPeriodService service, JobLeaseService leases) {
        this.service = service;
        this.leases = leases;
    }

    @Scheduled(cron = "${dossier.ent.billing-period-cron:0 40 * * * *}", zone = "UTC")
    public void scheduled() {
        try {
            runOnce(Instant.now())
                .filter(r -> r.total() > 0)
                .ifPresent(r -> LOG.info("Billing period job: {} organizations, {} estimates, {} removals, {} failed", r.organizations(), r.invoices(), r.removals(), r.failed()));
        } catch (RuntimeException e) {
            LOG.warn("Billing period job failed", e); // the next run retries
        }
    }

    /** One pass at {@code now}; empty when another instance holds the lease. */
    public Optional<OrgBillingPeriodService.RunResult> runOnce(Instant now) {
        return leases.withLease(LEASE, LEASE_TTL, now, () -> service.runDue(now), r -> "orgs=" + r.organizations() + " invoices=" + r.invoices() + " removals=" + r.removals() + " failed=" + r.failed());
    }
}
