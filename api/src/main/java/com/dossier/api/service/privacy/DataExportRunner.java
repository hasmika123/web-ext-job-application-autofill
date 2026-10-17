package com.dossier.api.service.privacy;

import com.dossier.api.domain.User;
import com.dossier.api.domain.privacy.DataExportJob;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.privacy.DataExportJobRepository;
import com.dossier.api.service.AccountExportService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.StorageKeys;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The worker side of the asynchronous data export (REAL-GAPS-C T1.2). {@link #processDue} claims queued jobs ({@code FOR UPDATE SKIP LOCKED}, then a
 * lease, so two instances never build the same export and a worker that dies lets its job be picked up again), builds each ZIP, and {@link #expire}
 * deletes the files of exports past their download time.
 *
 * <p>The ZIP holds {@code export.json} (the same document {@code GET /api/account/export} returns, assembled by acting as the account), the person's
 * stored files under {@code files/} (resume uploads and PDFs, originals, photos, thumbnails, attachments; never earlier exports), and
 * {@code manifest.json} (what is included, and what was left out and why). The total is capped at {@code privacy.export.max_mb}: the JSON always goes in,
 * files go in until the cap would be crossed, the rest are listed as skipped. {@code privacy.export.include_files = false} makes it a JSON-only export.
 * A job that fails is retried up to three times and then marked FAILED with a short reason.
 */
@Component
public class DataExportRunner {

    private static final Logger LOG = LoggerFactory.getLogger(DataExportRunner.class);
    static final int BATCH = 3;
    static final int MAX_ATTEMPTS = 3;
    static final Duration LEASE = Duration.ofMinutes(20);

    private final DataExportJobRepository jobs;
    private final UserRepository users;
    private final AccountExportService exports;
    private final FileStorage storage;
    private final ResumeBuilderSettings settings;
    private final ObjectMapper mapper;
    private final JobLeaseService leases;
    private final TransactionTemplate tx;

    public DataExportRunner(
        DataExportJobRepository jobs,
        UserRepository users,
        AccountExportService exports,
        FileStorage storage,
        ResumeBuilderSettings settings,
        ObjectMapper mapper,
        JobLeaseService leases,
        PlatformTransactionManager transactionManager
    ) {
        this.jobs = jobs;
        this.users = users;
        this.exports = exports;
        this.storage = storage;
        this.settings = settings;
        this.mapper = mapper;
        this.leases = leases;
        this.tx = new TransactionTemplate(transactionManager);
    }

    @Scheduled(fixedDelayString = "${dossier.privacy.export-poll-ms:30000}", initialDelayString = "${dossier.privacy.export-initial-ms:60000}")
    public void scheduled() {
        try {
            Instant now = Instant.now();
            processDue(now);
            expire(now);
        } catch (RuntimeException e) {
            LOG.warn("Data export sweep failed", e);
        }
    }

    /** Builds the queued exports (at most {@link #BATCH} per call); returns how many reached READY. */
    public int processDue(Instant now) {
        List<Long> ids = tx.execute(s -> {
            List<Long> due = jobs.lockClaimable(now, BATCH);
            if (!due.isEmpty()) jobs.lease(due, leases.instanceId(), now, now.plus(LEASE));
            return due;
        });
        if (ids == null || ids.isEmpty()) return 0;
        int ready = 0;
        for (Long id : ids) {
            DataExportJob job = jobs.findById(id).orElse(null);
            if (job == null) continue;
            try {
                build(job, now);
                ready++;
            } catch (Exception e) {
                LOG.warn("Data export {} failed (attempt {})", id, job.getAttempts(), e);
                fail(id, job.getAttempts(), e);
            }
        }
        return ready;
    }

    private void fail(Long id, int attempts, Exception e) {
        String why = e.getClass().getSimpleName();
        tx.executeWithoutResult(s ->
            jobs
                .findById(id)
                .ifPresent(j -> {
                    boolean giveUp = attempts >= MAX_ATTEMPTS;
                    j.setStatus(giveUp ? DataExportJob.FAILED : DataExportJob.QUEUED);
                    j.setError(why.substring(0, Math.min(why.length(), 200)));
                    j.setLeaseUntil(null);
                    if (giveUp) j.setFinishedAt(Instant.now());
                    jobs.save(j);
                })
        );
    }

    private void build(DataExportJob job, Instant now) throws IOException {
        User user = users.findById(job.getUserId()).orElse(null);
        if (user == null) throw new IllegalStateException("account gone");
        long capBytes = settings.getInt(AdminSettingKeys.PRIVACY_EXPORT_MAX_MB) * 1024L * 1024L;
        boolean includeFiles = settings.getBool(AdminSettingKeys.PRIVACY_EXPORT_INCLUDE_FILES);

        Map<String, Object> data = exports.exportAccount(user.getLogin());
        byte[] jsonBytes = mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(data);
        List<Map<String, Object>> included = new ArrayList<>();
        List<Map<String, Object>> skipped = new ArrayList<>();
        Path tmp = Files.createTempFile("kiwiply-export-", ".zip");
        try {
            long used = jsonBytes.length;
            try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(tmp))) {
                zip.putNextEntry(new ZipEntry("export.json"));
                zip.write(jsonBytes);
                zip.closeEntry();
                if (includeFiles) {
                    for (String prefix : StorageKeys.exportablePrefixes(job.getUserId())) {
                        String token = null;
                        do {
                            FileStorage.KeyPage page = storage.list(prefix, token);
                            for (String key : page.keys()) {
                                long size = storage.stat(key).map(FileStorage.ObjectStat::size).orElse(0L);
                                if (used + size > capBytes) {
                                    skipped.add(entry(key, size, "size cap reached"));
                                    continue;
                                }
                                zip.putNextEntry(new ZipEntry("files/" + key));
                                try (InputStream in = storage.open(key)) {
                                    in.transferTo(zip);
                                }
                                zip.closeEntry();
                                used += size;
                                included.add(entry(key, size, null));
                            }
                            token = page.nextToken();
                        } while (token != null);
                    }
                }
                Map<String, Object> manifest = new LinkedHashMap<>();
                manifest.put("exportedAt", now.toString());
                manifest.put("capBytes", capBytes);
                manifest.put("filesIncluded", includeFiles);
                manifest.put("files", included);
                manifest.put("skipped", skipped);
                zip.putNextEntry(new ZipEntry("manifest.json"));
                zip.write(mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(manifest));
                zip.closeEntry();
            }
            long length = Files.size(tmp);
            String key = storage.objectKeyFor(StorageKeys.DATA_EXPORTS, job.getUserId(), job.getId(), "kiwiply-data.zip");
            try (InputStream in = Files.newInputStream(tmp)) {
                storage.store(key, in, length, "application/zip");
            }
            int hours = settings.getInt(AdminSettingKeys.PRIVACY_EXPORT_EXPIRY_HOURS);
            Instant finished = Instant.now();
            tx.executeWithoutResult(s ->
                jobs
                    .findById(job.getId())
                    .ifPresent(j -> {
                        j.setStatus(DataExportJob.READY);
                        j.setStorageKey(key);
                        j.setSizeBytes(length);
                        j.setFileCount(included.size());
                        j.setSkippedCount(skipped.size());
                        j.setFinishedAt(finished);
                        j.setExpiresAt(finished.plus(Duration.ofHours(hours)));
                        j.setError(null);
                        j.setLeaseUntil(null);
                        jobs.save(j);
                    })
            );
        } finally {
            Files.deleteIfExists(tmp);
        }
    }

    private static Map<String, Object> entry(String key, long size, String reason) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("path", key);
        m.put("bytes", size);
        if (reason != null) m.put("reason", reason);
        return m;
    }

    /** Deletes the files of READY exports past their download time and marks them EXPIRED; returns how many. */
    public int expire(Instant now) {
        List<DataExportJob> due = jobs.findExpiredReady(now, PageRequest.of(0, 50));
        int n = 0;
        for (DataExportJob j : due) {
            try {
                if (j.getStorageKey() != null) storage.delete(j.getStorageKey());
                Long id = j.getId();
                tx.executeWithoutResult(s ->
                    jobs
                        .findById(id)
                        .ifPresent(x -> {
                            x.setStatus(DataExportJob.EXPIRED);
                            x.setStorageKey(null);
                            jobs.save(x);
                        })
                );
                n++;
            } catch (RuntimeException e) {
                LOG.warn("Could not expire data export {}", j.getId(), e); // the next sweep retries
            }
        }
        return n;
    }
}
