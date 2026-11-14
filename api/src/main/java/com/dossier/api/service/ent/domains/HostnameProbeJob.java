package com.dossier.api.service.ent.domains;

import com.dossier.api.service.privacy.JobLeaseService;
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
 * Every 5 minutes (job lease): probes the live custom domains whose certificate is REQUESTED or FAILED (docs/enterprise-v2/10-domain-routing.md s5.4), at
 * most 50 per run, one transaction each ({@link HostnameCertService#probe}). An ISSUED domain is not probed again.
 */
@Component
public class HostnameProbeJob {

    private static final Logger LOG = LoggerFactory.getLogger(HostnameProbeJob.class);
    public static final String LEASE = "hostname-probe";
    static final Duration LEASE_TTL = Duration.ofMinutes(15);
    static final int PER_RUN = 50;

    public record RunResult(int probed, int issued, int failed) {}

    private final JdbcTemplate jdbc;
    private final HostnameCertService certs;
    private final JobLeaseService leases;

    public HostnameProbeJob(JdbcTemplate jdbc, HostnameCertService certs, JobLeaseService leases) {
        this.jdbc = jdbc;
        this.certs = certs;
        this.leases = leases;
    }

    @Scheduled(fixedDelayString = "${dossier.ent.domains.probe-delay-ms:300000}", initialDelayString = "${dossier.ent.domains.probe-initial-delay-ms:150000}")
    public void scheduled() {
        try {
            runOnce(Instant.now()).filter(r -> r.probed() > 0).ifPresent(r -> LOG.info("Domain certificate probes: {} probed, {} issued, {} failed", r.probed(), r.issued(), r.failed()));
        } catch (RuntimeException e) {
            LOG.warn("Domain certificate probe job failed", e); // the next run retries
        }
    }

    public Optional<RunResult> runOnce(Instant now) {
        return leases.withLease(LEASE, LEASE_TTL, now, () -> run(now), r -> "probed=" + r.probed() + " issued=" + r.issued() + " failed=" + r.failed());
    }

    RunResult run(Instant now) {
        List<Map<String, Object>> due = jdbc.queryForList(
            "select id, org_id from org_hostname where kind = 'CUSTOM' and status = 'ACTIVE' and cert_state in ('REQUESTED','FAILED') order by cert_checked_at is not null, cert_checked_at limit " + PER_RUN
        );
        int probed = 0;
        int issued = 0;
        int failed = 0;
        for (Map<String, Object> row : due) {
            Long id = ((Number) row.get("id")).longValue();
            Long orgId = ((Number) row.get("org_id")).longValue();
            try {
                String state = certs.probe(orgId, id, now);
                probed++;
                if ("ISSUED".equals(state)) issued++;
            } catch (RuntimeException e) {
                failed++;
                LOG.warn("Certificate probe failed for hostname {} of organization {}", id, orgId, e);
            }
        }
        return new RunResult(probed, issued, failed);
    }
}
