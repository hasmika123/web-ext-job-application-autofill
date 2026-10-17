package com.dossier.api.service.privacy;

import com.dossier.api.repository.privacy.JobLeaseRepository;
import java.net.InetAddress;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The cross-instance lock for background sweeps. There is no ShedLock in this codebase and the older nightly jobs rely on "a second run only deletes
 * rows that are already gone"; the privacy jobs go one step further, because they write a run record and an audit row each time and because a purge
 * should not be raced. A job takes a LEASE in the {@code job_lease} table with one atomic UPDATE (free or expired wins, everybody else gets 0 rows), works
 * while it holds it, and lets go when done. A crashed instance never blocks the others for ever: the lease expires after its time to live.
 */
@Service
public class JobLeaseService {

    private static final Logger LOG = LoggerFactory.getLogger(JobLeaseService.class);

    private final JobLeaseRepository leases;
    private final TransactionTemplate tx;
    private final String instanceId;

    public JobLeaseService(JobLeaseRepository leases, PlatformTransactionManager transactionManager) {
        this.leases = leases;
        this.tx = new TransactionTemplate(transactionManager);
        this.instanceId = hostName() + "-" + UUID.randomUUID().toString().substring(0, 8);
    }

    /** This API instance, as written in {@code job_lease.locked_by}. */
    public String instanceId() {
        return instanceId;
    }

    /** True when this instance now holds the lease of {@code name} until {@code now + ttl}. */
    public boolean tryAcquire(String name, Duration ttl, Instant now) {
        return tryAcquire(name, instanceId, ttl, now);
    }

    /** Same, as an explicit holder (tests use two holders to stand in for two instances). */
    public boolean tryAcquire(String name, String holder, Duration ttl, Instant now) {
        Integer won = tx.execute(status -> {
            leases.ensure(name);
            return leases.acquire(name, holder, now, now.plus(ttl));
        });
        return won != null && won == 1;
    }

    public void release(String name, String summary, Instant now) {
        release(name, instanceId, summary, now);
    }

    public void release(String name, String holder, String summary, Instant now) {
        tx.executeWithoutResult(status -> leases.release(name, holder, now, summary == null ? null : summary.substring(0, Math.min(500, summary.length()))));
    }

    /**
     * Runs {@code work} while holding the lease {@code name}; empty when another instance holds it (the work is not run). The lease is always released,
     * with the summary the work reports through {@code summarise}.
     */
    public <T> Optional<T> withLease(String name, Duration ttl, Instant now, Supplier<T> work, java.util.function.Function<T, String> summarise) {
        if (!tryAcquire(name, ttl, now)) {
            LOG.debug("Job {} is held by another instance; skipping", name);
            return Optional.empty();
        }
        T result = null;
        String summary = "failed";
        try {
            result = work.get();
            summary = result == null ? "done" : summarise.apply(result);
            return Optional.ofNullable(result);
        } finally {
            release(name, summary, Instant.now());
        }
    }

    private static String hostName() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            return "api";
        }
    }
}
