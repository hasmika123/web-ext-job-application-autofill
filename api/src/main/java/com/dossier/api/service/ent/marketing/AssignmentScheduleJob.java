package com.dossier.api.service.ent.marketing;

import com.dossier.api.service.privacy.JobLeaseService;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Every 15 minutes: applies the planned changes of a consultant's marketer that have come due (Sprint 2 / H-assign): handovers scheduled for a date, temporary
 * cover that starts, and cover that has run to its end date and gives the consultant back. The work is {@link AssignmentScheduleService#runDue}; this class only
 * adds the cross-instance lease ({@link JobLeaseService}, the same pattern as the privacy jobs), so two API instances never apply the same plan twice, and a crash
 * lets the other instance take over when the lease runs out. A run that finds nothing due writes nothing.
 */
@Component
public class AssignmentScheduleJob {

    private static final Logger LOG = LoggerFactory.getLogger(AssignmentScheduleJob.class);

    /** The name of the lease in {@code job_lease}. */
    public static final String LEASE = "assignment-schedule";

    static final Duration LEASE_TTL = Duration.ofMinutes(10);

    private final AssignmentScheduleService service;
    private final JobLeaseService leases;

    public AssignmentScheduleJob(AssignmentScheduleService service, JobLeaseService leases) {
        this.service = service;
        this.leases = leases;
    }

    @Scheduled(cron = "${dossier.ent.assignment-schedule-cron:0 */15 * * * *}", zone = "UTC")
    public void scheduled() {
        try {
            Optional<AssignmentScheduleService.RunResult> r = runOnce(Instant.now());
            r.filter(x -> x.total() > 0).ifPresent(x -> LOG.info("Assignment schedule job: {} started, {} ended, {} failed", x.started(), x.ended(), x.failed()));
        } catch (RuntimeException e) {
            LOG.warn("Assignment schedule job failed", e); // the next run retries
        }
    }

    /** One pass at {@code now}; empty when another instance holds the lease. */
    public Optional<AssignmentScheduleService.RunResult> runOnce(Instant now) {
        return leases.withLease(LEASE, LEASE_TTL, now, () -> service.runDue(now), r -> "started=" + r.started() + " ended=" + r.ended() + " failed=" + r.failed());
    }
}
