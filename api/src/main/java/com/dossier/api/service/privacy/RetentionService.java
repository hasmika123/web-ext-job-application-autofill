package com.dossier.api.service.privacy;

import com.dossier.api.domain.privacy.RetentionRun;
import com.dossier.api.repository.privacy.RetentionRunRepository;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The retention sweep (REAL-GAPS-C T1.4). For every {@link RetentionTarget} it reads the window from the settings registry (0 keeps for ever), works out
 * the cutoff, and deletes in batches of {@code privacy.retention.batch_size}, each batch in its own transaction, at most {@code privacy.retention.max_batches}
 * per job per run, so a large backlog is worked off over a few nights without a long transaction.
 *
 * <ul>
 *   <li><b>Dry run</b> ({@code privacy.retention.dry_run}, or the admin endpoint's {@code dryRun}): counts what would go and records it; deletes nothing.</li>
 *   <li><b>Audited</b>: each run writes a {@code retention_run} row (counts, window, who/what triggered it) and, when it deleted rows or an admin asked, an
 *       admin audit event ({@code RETENTION_PURGE} / {@code RETENTION_DRY_RUN}). Counts only, never content.</li>
 *   <li><b>Safe with a second API instance</b>: a job runs only while it holds the {@code retention:&lt;job&gt;} lease ({@link JobLeaseService}); the instance
 *       that does not get it records nothing and moves on. The deletes are by id, so even a lease that expired mid-run cannot make two instances conflict.</li>
 * </ul>
 */
@Service
public class RetentionService {

    private static final Logger LOG = LoggerFactory.getLogger(RetentionService.class);

    public static final String TRIGGER_SCHEDULE = "SCHEDULE";
    public static final String TRIGGER_ADMIN = "ADMIN";
    public static final String AUDIT_PURGE = "RETENTION_PURGE";
    public static final String AUDIT_DRY_RUN = "RETENTION_DRY_RUN";
    public static final String AUDIT_TARGET = "RETENTION";
    static final Duration LEASE_TTL = Duration.ofMinutes(30);

    /** What one job did in one run. */
    public record Result(String job, String status, boolean dryRun, Integer window, String unit, Instant cutoff, long candidates, long deleted, String note) {}

    private final List<RetentionTarget> targets;
    private final ResumeBuilderSettings settings;
    private final JobLeaseService leases;
    private final RetentionRunRepository runs;
    private final AdminAuditService audit;
    private final TransactionTemplate tx;

    public RetentionService(
        List<RetentionTarget> targets,
        ResumeBuilderSettings settings,
        JobLeaseService leases,
        RetentionRunRepository runs,
        AdminAuditService audit,
        PlatformTransactionManager transactionManager
    ) {
        this.targets = List.copyOf(targets);
        this.settings = settings;
        this.leases = leases;
        this.runs = runs;
        this.audit = audit;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /** Every target, in a stable order (the admin page lists them). */
    public List<RetentionTarget> targets() {
        return targets.stream().sorted(java.util.Comparator.comparing(RetentionTarget::job)).toList();
    }

    public Optional<RetentionTarget> target(String job) {
        return targets.stream().filter(t -> t.job().equalsIgnoreCase(job)).findFirst();
    }

    public int window(RetentionTarget t) {
        return settings.getInt(t.settingKey());
    }

    /** Runs every job. {@code dryRun} null = follow the {@code privacy.retention.dry_run} setting. */
    public List<Result> runAll(String trigger, String actor, Boolean dryRun, Instant now) {
        List<Result> out = new ArrayList<>();
        for (RetentionTarget t : targets()) out.add(run(t, trigger, actor, dryRun, now));
        return out;
    }

    public Result run(RetentionTarget t, String trigger, String actor, Boolean dryRunOverride, Instant now) {
        boolean admin = TRIGGER_ADMIN.equals(trigger);
        boolean dry = dryRunOverride != null ? dryRunOverride : settings.getBool(AdminSettingKeys.PRIVACY_RETENTION_DRY_RUN);
        int window = window(t);
        if (!dry && !settings.getBool(AdminSettingKeys.PRIVACY_RETENTION_ENABLED)) {
            return record(t, trigger, actor, dry, "SKIPPED", window, null, 0, 0, "retention is switched off (privacy.retention.enabled)", now, admin);
        }
        if (window <= 0) {
            return record(t, trigger, actor, dry, "SKIPPED", window, null, 0, 0, "window 0 keeps everything", now, admin);
        }
        Instant cutoff = t.cutoff(now, window);
        Optional<Result> done = leases.withLease(
            "retention:" + t.job(),
            LEASE_TTL,
            now,
            () -> sweep(t, trigger, actor, dry, window, cutoff, now, admin),
            r -> r.status() + " candidates=" + r.candidates() + " deleted=" + r.deleted()
        );
        return done.orElseGet(() -> new Result(t.job(), "SKIPPED", dry, window, t.unit(), cutoff, 0, 0, "another instance holds the lease")); // nothing recorded: the holder records
    }

    private Result sweep(RetentionTarget t, String trigger, String actor, boolean dry, int window, Instant cutoff, Instant now, boolean admin) {
        try {
            long candidates = t.count(cutoff);
            if (dry || candidates == 0) {
                return record(t, trigger, actor, dry, "DONE", window, cutoff, candidates, 0, dry ? "dry run: nothing deleted" : null, now, admin);
            }
            int batch = settings.getInt(AdminSettingKeys.PRIVACY_RETENTION_BATCH_SIZE);
            int max = settings.getInt(AdminSettingKeys.PRIVACY_RETENTION_MAX_BATCHES);
            long deleted = 0;
            boolean more = false;
            for (int i = 0; i < max; i++) {
                List<Long> ids = t.nextIds(cutoff, batch);
                if (ids.isEmpty()) break;
                Integer n = tx.execute(s -> t.delete(ids));
                deleted += n == null ? 0 : n;
                if (ids.size() < batch) break;
                if (i == max - 1) more = true;
            }
            return record(t, trigger, actor, false, more ? "PARTIAL" : "DONE", window, cutoff, candidates, deleted, more ? "batch cap reached; the rest goes in the next run" : null, now, admin);
        } catch (RuntimeException e) {
            LOG.warn("Retention job {} failed", t.job(), e);
            return record(t, trigger, actor, dry, "FAILED", window, cutoff, 0, 0, abbreviate(e.getClass().getSimpleName()), now, admin);
        }
    }

    private Result record(RetentionTarget t, String trigger, String actor, boolean dry, String status, Integer window, Instant cutoff, long candidates, long deleted, String note, Instant now, boolean admin) {
        Result r = new Result(t.job(), status, dry, window, t.unit(), cutoff, candidates, deleted, note);
        boolean worthRecording = admin || candidates > 0 || "FAILED".equals(status);
        if (!worthRecording) return r;
        RetentionRun run = new RetentionRun();
        run.setJob(t.job());
        run.setTriggerKind(trigger);
        run.setActor(actor);
        run.setDryRun(dry);
        run.setStatus(status);
        run.setWindowValue(window);
        run.setWindowUnit(t.unit());
        run.setCutoffAt(cutoff);
        run.setCandidates(candidates);
        run.setDeleted(deleted);
        run.setNote(note);
        run.setStartedAt(now);
        run.setFinishedAt(Instant.now());
        runs.save(run);
        if (admin || deleted > 0) {
            audit.record(
                dry ? AUDIT_DRY_RUN : AUDIT_PURGE,
                AUDIT_TARGET,
                t.job(),
                null,
                "window=" + window + " " + t.unit() + " candidates=" + candidates + " deleted=" + deleted + " status=" + status
            );
        }
        if (deleted > 0) LOG.info("Retention {}: deleted {} row(s) of {} older than {} {}", t.job(), deleted, t.table(), window, t.unit());
        return r;
    }

    /** The newest run records, newest first; {@code job} null = all jobs. */
    public List<RetentionRun> recent(String job, int limit) {
        PageRequest page = PageRequest.of(0, Math.max(1, Math.min(limit, 200)));
        return job == null || job.isBlank() ? runs.findAllByOrderByIdDesc(page) : runs.findByJobOrderByIdDesc(job.toUpperCase(), page);
    }

    private static String abbreviate(String s) {
        return s == null ? null : s.substring(0, Math.min(s.length(), 200));
    }
}
