package com.dossier.api.service.ent.domains;

import com.dossier.api.service.privacy.JobLeaseService;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Every 10 minutes (job lease): re-checks custom domains (docs/enterprise-v2/10-domain-routing.md s4.3; CUSTOM-DOMAINS-BUILD.md). It picks:
 * <ul>
 *   <li>domains waiting for DNS (PENDING / VERIFYING / VERIFIED), checked at most every 5 minutes, for 14 days after they were added, so a customer who
 *       just added the records sees the domain go live without clicking;</li>
 *   <li>live domains whose last check is older than {@code enterprise.domains.recheck_hours}.</li>
 * </ul>
 * At most 50 per run, 200 ms apart. Each row is one transaction ({@link OrgDomainService#recheck}), so one failure does not stop the rest.
 */
@Component
public class HostnameCheckJob {

    private static final Logger LOG = LoggerFactory.getLogger(HostnameCheckJob.class);
    public static final String LEASE = "hostname-check";
    static final Duration LEASE_TTL = Duration.ofMinutes(20);
    static final int PER_RUN = 50;
    static final Duration WAIT_BETWEEN_CHECKS = Duration.ofMinutes(5);
    static final Duration STOP_WAITING_AFTER = Duration.ofDays(14);

    public record RunResult(int checked, int failed) {}

    private final JdbcTemplate jdbc;
    private final OrgDomainService domains;
    private final SettingsService settings;
    private final JobLeaseService leases;
    long pauseMillis = 200;

    public HostnameCheckJob(JdbcTemplate jdbc, OrgDomainService domains, SettingsService settings, JobLeaseService leases) {
        this.jdbc = jdbc;
        this.domains = domains;
        this.settings = settings;
        this.leases = leases;
    }

    @Scheduled(fixedDelayString = "${dossier.ent.domains.check-delay-ms:600000}", initialDelayString = "${dossier.ent.domains.check-initial-delay-ms:120000}")
    public void scheduled() {
        try {
            runOnce(Instant.now()).filter(r -> r.checked() > 0).ifPresent(r -> LOG.info("Domain checks: {} checked, {} failed", r.checked(), r.failed()));
        } catch (RuntimeException e) {
            LOG.warn("Domain check job failed", e); // the next run retries
        }
    }

    public Optional<RunResult> runOnce(Instant now) {
        return leases.withLease(LEASE, LEASE_TTL, now, () -> run(now), r -> "checked=" + r.checked() + " failed=" + r.failed());
    }

    RunResult run(Instant now) {
        Instant waitingBefore = now.minus(WAIT_BETWEEN_CHECKS);
        Instant addedAfter = now.minus(STOP_WAITING_AFTER);
        Instant liveBefore = now.minus(Duration.ofHours(settings.getInt(EnterpriseSettingKeys.DOMAINS_RECHECK_HOURS)));
        List<Map<String, Object>> due = jdbc.queryForList(
            "select id, org_id from org_hostname where kind = 'CUSTOM' and (" +
            "(status in ('PENDING','VERIFYING','VERIFIED') and created_at > ? and (last_check_at is null or last_check_at < ?)) or " +
            "(status = 'ACTIVE' and (last_check_at is null or last_check_at < ?))" +
            ") order by last_check_at is not null, last_check_at limit " + PER_RUN,
            Timestamp.from(addedAfter), Timestamp.from(waitingBefore), Timestamp.from(liveBefore)
        );
        int checked = 0;
        int failed = 0;
        for (Map<String, Object> row : due) {
            Long id = ((Number) row.get("id")).longValue();
            Long orgId = ((Number) row.get("org_id")).longValue();
            try {
                domains.recheck(orgId, id, now);
                checked++;
            } catch (RuntimeException e) {
                failed++;
                LOG.warn("Domain check failed for hostname {} of organization {}", id, orgId, e);
            }
            pause();
        }
        return new RunResult(checked, failed);
    }

    private void pause() {
        if (pauseMillis <= 0) return;
        try {
            Thread.sleep(pauseMillis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
