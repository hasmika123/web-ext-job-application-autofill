package com.dossier.api.service;

import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeDocRepository.PdfJobRow;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.service.resume.ResumePdfState;
import com.dossier.api.service.resume.ResumeRenderHash;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.StorageKeys;
import com.dossier.api.service.storage.FileStorage.StoredFile;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.text.Normalizer;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The server half of the async PDF pipeline (Resume Builder R3.7, DESIGN 8.5). The {@code resume_doc}
 * row is the job; this service is the queue around it:
 *
 * <ul>
 *   <li>{@link #claim} leases due rows to a worker ({@code SELECT ... FOR UPDATE SKIP LOCKED}, so several
 *       workers never take the same row); a lease that expires makes the row claimable again.</li>
 *   <li>{@link #store} takes the rendered bytes: if the document moved on since the claim the file is
 *       discarded (the newer save already re-queued the row); otherwise it is stored through
 *       {@link FileStorage} as the resume's file, the old object is deleted and the row is READY.</li>
 *   <li>{@link #fail} records a failed attempt: BUSY costs nothing, TIMEOUT/ERROR back off exponentially
 *       and become FAILED after {@code resume.pdf.maxAttempts}.</li>
 * </ul>
 *
 * Every write to the row is a bulk update (see {@link ResumeDocRepository}): a job-state change must not
 * bump the document's optimistic-lock version, or an open editor's next autosave would 409. Every interval
 * and limit is a {@link ResumeBuilderSettings} value.
 */
@Service
@Transactional
public class ResumePdfJobService {

    private static final Logger LOG = LoggerFactory.getLogger(ResumePdfJobService.class);

    /** How many times {@link #store} re-reads a row whose version moved without its render hash moving. */
    private static final int STORE_RETRIES = 3;
    /** ops alert hook (DESIGN 8.5): a request pending this long is logged at WARN. */
    private static final Duration PENDING_WARN_AFTER = Duration.ofMinutes(10);
    private static final int MAX_ERROR_CHARS = 200;
    private static final int MAX_WORKER_CHARS = 64;
    private static final String PDF_CONTENT_TYPE = "application/pdf";

    /** The card thumbnails live next to the other generated files (R3.13, DESIGN 8.10): {@code resume-thumbs/<userId>/<resumeId>-<renderHash>.png}. */
    public static final String THUMB_PREFIX = StorageKeys.RESUME_THUMBS + "/";
    private static final String THUMB_CONTENT_TYPE = "image/png";
    /** A thumbnail is ~100 KB at the widest setting; this only stops a runaway upload from filling the store. */
    private static final int MAX_THUMB_BYTES = 1 << 20;
    private static final byte[] PNG_MAGIC = { (byte) 0x89, 'P', 'N', 'G' };

    /** One job as a worker receives it. {@code thumbWidth} is the setting {@code resume.thumb.width}: the width of the card thumbnail to screenshot (R3.13). */
    public record ClaimedJob(Long resumeId, Long userId, String renderHash, String templateId, int thumbWidth) {}

    /** Why a render did not produce a PDF. */
    public enum FailKind {
        /** The renderer refused (limiter full): try again soon, no attempt counted. */
        BUSY,
        TIMEOUT,
        ERROR;

        public static FailKind parse(String s) {
            if (s != null) {
                for (FailKind k : values()) if (k.name().equalsIgnoreCase(s.trim())) return k;
            }
            return null;
        }
    }

    public enum StoreResult {
        STORED,
        /** The document changed since the claim: the file was thrown away and the newer save's job stands. */
        DISCARDED
    }

    /** Queue depth for the admin stats endpoint. {@code oldestPendingAge} is in seconds, null when nothing is pending. */
    public record Stats(long pending, long running, long failed, Long oldestPendingAge) {}

    private final ResumeDocRepository docs;
    private final ResumeRepository resumes;
    private final FileStorage storage;
    private final ResumeBuilderSettings settings;
    private final Counter claimed;
    private final Counter ready;
    private final Counter failed;
    private final Counter busy;
    private final Counter discarded;
    private final Timer latency;
    private volatile Instant lastWarnAt = Instant.EPOCH;

    public ResumePdfJobService(
        ResumeDocRepository docs,
        ResumeRepository resumes,
        FileStorage storage,
        ResumeBuilderSettings settings,
        MeterRegistry registry
    ) {
        this.docs = docs;
        this.resumes = resumes;
        this.storage = storage;
        this.settings = settings;
        this.claimed = registry.counter("resume.pdf.job.claimed");
        this.ready = registry.counter("resume.pdf.job.ready");
        this.failed = registry.counter("resume.pdf.job.failed");
        this.busy = registry.counter("resume.pdf.job.busy");
        this.discarded = registry.counter("resume.pdf.job.discarded");
        this.latency = registry.timer("resume.pdf.job.latency");
        Gauge.builder("resume.pdf.queue.pending", this, s -> s.pendingForGauge()).register(registry);
    }

    // ---- claim --------------------------------------------------------------

    /** Leases up to {@code limit} due rows (at most {@code resume.pdf.maxConcurrent}) to {@code worker}. */
    public List<ClaimedJob> claim(String worker, int limit) {
        String who = cleanWorker(worker);
        Instant now = Instant.now();
        // A lease that expired on the last allowed attempt means the worker is gone for good.
        int abandoned = docs.failExpiredLeases(now, settings.getInt(ResumeBuilderSettingKeys.PDF_MAX_ATTEMPTS), "The PDF renderer stopped responding.");
        if (abandoned > 0) failed.increment(abandoned);

        int cap = Math.max(1, Math.min(limit, settings.getInt(ResumeBuilderSettingKeys.PDF_MAX_CONCURRENT)));
        List<Long> ids = docs.lockClaimable(now, cap);
        if (ids.isEmpty()) return List.of();
        docs.markRunning(ids, who, now.plusMillis(settings.getInt(ResumeBuilderSettingKeys.PDF_LEASE_MS)));
        claimed.increment(ids.size());
        int thumbWidth = settings.getInt(ResumeBuilderSettingKeys.THUMB_WIDTH);
        return docs
            .findPdfJobRows(ids)
            .stream()
            .map(r -> new ClaimedJob(r.getResumeId(), r.getUserId(), renderHashOf(r), r.getTemplateId(), thumbWidth))
            .toList();
    }

    // ---- store --------------------------------------------------------------

    /**
     * Stores a rendered PDF as the resume's file. {@code renderHash} is the hash the worker was told to render;
     * if it is no longer the document's current render hash the file is discarded.
     */
    public StoreResult store(Long resumeId, byte[] bytes, String renderHash, int pages, boolean fits) {
        return store(resumeId, bytes, renderHash, pages, fits, null);
    }

    /**
     * As {@link #store(Long, byte[], String, int, boolean)}, plus the card thumbnail (R3.13): a PNG of the first page,
     * stored through {@link FileStorage} at {@code resume-thumbs/<userId>/<resumeId>-<renderHash>.png} while the PDF
     * is stored (the old thumbnail object is deleted, {@code thumb_key}/{@code thumb_hash} updated). A missing or
     * unusable thumbnail never fails the PDF: the previous one stays and the card keeps showing it.
     */
    public StoreResult store(Long resumeId, byte[] bytes, String renderHash, int pages, boolean fits, byte[] thumb) {
        if (bytes == null || bytes.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Empty PDF");
        }
        PdfJobRow row = row(resumeId);
        String newKey = null;
        for (int attempt = 0; attempt < STORE_RETRIES; attempt++) {
            if (!renderHashOf(row).equals(renderHash)) return discard(resumeId, "stale");
            if (newKey == null) {
                newKey = storage.objectKeyFor(StorageKeys.RESUMES, row.getUserId(), resumeId, safeFileName(row.getLabel(), resumeId));
                storage.store(newKey, bytes, PDF_CONTENT_TYPE);
            }
            // The version predicate makes "still current" and "mark READY" one atomic step.
            if (docs.markReady(resumeId, row.getDocVersion(), renderHash, Instant.now()) == 1) {
                resumes.updateObjectKey(resumeId, newKey);
                String old = row.getR2ObjectKey();
                if (old != null && !old.isBlank() && !old.equals(newKey)) deleteQuietly(old);
                ready.increment();
                if (row.getPdfRequestedAt() != null) latency.record(Duration.between(row.getPdfRequestedAt(), Instant.now()));
                LOG.info("pdf-job {} stored pages={} fits={} bytes={}", resumeId, pages, fits, bytes.length);
                storeThumbnail(row, renderHash, thumb);
                return StoreResult.STORED;
            }
            // The version moved. If the render did not (e.g. a profile sync bumped it), try again with the new one.
            row = row(resumeId);
        }
        if (newKey != null) deleteQuietly(newKey);
        return discard(resumeId, "raced");
    }

    /** Best effort: any problem with the thumbnail is logged and leaves the previous one in place. */
    private void storeThumbnail(PdfJobRow row, String renderHash, byte[] thumb) {
        if (thumb == null || thumb.length == 0) return;
        if (thumb.length > MAX_THUMB_BYTES || !isPng(thumb) || !renderHash.matches("[0-9a-f]{1,64}")) {
            LOG.warn("pdf-job {} thumbnail ignored (bytes={}, png={})", row.getResumeId(), thumb.length, isPng(thumb));
            return;
        }
        String key = THUMB_PREFIX + row.getUserId() + "/" + row.getResumeId() + "-" + renderHash + ".png";
        try {
            storage.store(key, thumb, THUMB_CONTENT_TYPE);
            String old = row.getThumbKey();
            docs.setThumb(row.getResumeId(), key, renderHash);
            if (old != null && !old.isBlank() && !old.equals(key)) deleteQuietly(old);
        } catch (RuntimeException e) {
            LOG.warn("pdf-job {} could not store its thumbnail: {}", row.getResumeId(), e.toString());
        }
    }

    private static boolean isPng(byte[] b) {
        if (b.length < PNG_MAGIC.length) return false;
        for (int i = 0; i < PNG_MAGIC.length; i++) if (b[i] != PNG_MAGIC[i]) return false;
        return true;
    }

    private StoreResult discard(Long resumeId, String why) {
        discarded.increment();
        LOG.info("pdf-job {} discarded ({}): the document changed while it was rendered", resumeId, why);
        return StoreResult.DISCARDED;
    }

    // ---- fail ---------------------------------------------------------------

    /**
     * A worker could not make the PDF. Applies only while the row is still RUNNING and leased to {@code worker};
     * anything else (a newer save re-queued it, another worker reclaimed it) is ignored.
     */
    public void fail(Long resumeId, String worker, FailKind kind, String message) {
        List<PdfJobRow> rows = docs.findPdfJobRows(List.of(resumeId));
        if (rows.isEmpty()) return;
        PdfJobRow row = rows.get(0);
        String who = worker == null ? "" : cleanWorker(worker);
        Instant now = Instant.now();

        if (kind == FailKind.BUSY) {
            if (docs.reschedule(resumeId, who, ResumePdfState.PENDING, now.plusMillis(settings.getInt(ResumeBuilderSettingKeys.PDF_BUSY_RETRY_MS)), row.getPdfAttempts(), null) == 1) {
                busy.increment();
            }
            return;
        }

        int attempts = row.getPdfAttempts() + 1;
        String error = truncate(message == null || message.isBlank() ? kind.name() : message);
        boolean giveUp = attempts >= settings.getInt(ResumeBuilderSettingKeys.PDF_MAX_ATTEMPTS);
        long backoff = backoffMs(attempts);
        int n = docs.reschedule(
            resumeId,
            who,
            giveUp ? ResumePdfState.FAILED : ResumePdfState.PENDING,
            giveUp ? now : now.plusMillis(backoff),
            attempts,
            error
        );
        if (n == 1) {
            failed.increment();
            LOG.warn("pdf-job {} {} attempt={} {}: {}", resumeId, giveUp ? "FAILED" : "retry in " + backoff + "ms", attempts, kind, error);
        }
    }

    /** {@code min(backoffMax, backoffBase * 2^attempts)}. */
    long backoffMs(int attempts) {
        long base = settings.getInt(ResumeBuilderSettingKeys.PDF_BACKOFF_BASE_MS);
        long max = settings.getInt(ResumeBuilderSettingKeys.PDF_BACKOFF_MAX_MS);
        long factor = 1L << Math.min(Math.max(attempts, 0), 20);
        return Math.min(max, base * factor);
    }

    // ---- reads --------------------------------------------------------------

    /** The photo bytes of a document, for the worker (404 when it has none). */
    @Transactional(readOnly = true)
    public StoredFile photo(Long resumeId) {
        ResumeDoc d = docs.findById(resumeId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Resume document not found"));
        String photoKey = d.getPhotoKey();
        // photo_key mirrors basics.photo.key and the validator already pins it to its owner's prefix; check again at the door.
        String expectedPrefix = StorageKeys.RESUME_PHOTOS + "/" + d.getUser().getId() + "/";
        if (photoKey == null || !photoKey.startsWith(expectedPrefix)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No photo");
        }
        try {
            return storage.load(photoKey);
        } catch (com.dossier.api.service.storage.StorageObjectNotFoundException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No photo");
        }
    }

    @Transactional(readOnly = true)
    public Stats stats() {
        Instant oldest = docs.oldestPendingRequestedAt();
        return new Stats(
            docs.countByPdfStatus(ResumePdfState.PENDING),
            docs.countByPdfStatus(ResumePdfState.RUNNING),
            docs.countByPdfStatus(ResumePdfState.FAILED),
            oldest == null ? null : Math.max(0, Duration.between(oldest, Instant.now()).getSeconds())
        );
    }

    /** Alert hook (DESIGN 8.5): a request that has waited more than ten minutes is logged at WARN, at most once a minute. */
    @Scheduled(fixedDelay = 60_000, initialDelay = 60_000)
    @Transactional(readOnly = true)
    public void watchQueue() {
        try {
            Instant oldest = docs.oldestPendingRequestedAt();
            if (oldest == null) return;
            Duration age = Duration.between(oldest, Instant.now());
            if (age.compareTo(PENDING_WARN_AFTER) > 0 && Duration.between(lastWarnAt, Instant.now()).compareTo(Duration.ofSeconds(55)) > 0) {
                lastWarnAt = Instant.now();
                LOG.warn("resume PDF queue is stuck: oldest pending request is {} minutes old (is the web PDF worker running?)", age.toMinutes());
            }
        } catch (RuntimeException e) {
            LOG.debug("resume PDF queue watch skipped", e);
        }
    }

    // ---- helpers ------------------------------------------------------------

    private PdfJobRow row(Long resumeId) {
        List<PdfJobRow> rows = docs.findPdfJobRows(List.of(resumeId));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Resume document not found");
        return rows.get(0);
    }

    private static String renderHashOf(PdfJobRow r) {
        return ResumeRenderHash.computeFromThemeJson(r.getContentHash(), r.getTemplateId(), r.getThemeJson());
    }

    private double pendingForGauge() {
        try {
            return docs.countByPdfStatus(ResumePdfState.PENDING);
        } catch (RuntimeException e) {
            return 0;
        }
    }

    private void deleteQuietly(String key) {
        try {
            storage.delete(key);
        } catch (RuntimeException e) {
            LOG.warn("Could not delete the replaced PDF object {}: {}", key, e.toString());
        }
    }

    private static String cleanWorker(String worker) {
        String w = worker == null ? "" : worker.replaceAll("[^A-Za-z0-9._:@-]", "_").trim();
        if (w.isEmpty()) w = "worker";
        return w.length() > MAX_WORKER_CHARS ? w.substring(0, MAX_WORKER_CHARS) : w;
    }

    private static String truncate(String s) {
        String clean = s.replaceAll("[\\p{Cntrl}]+", " ").trim();
        return clean.length() > MAX_ERROR_CHARS ? clean.substring(0, MAX_ERROR_CHARS) : clean;
    }

    /** "Jane Doe - Backend" becomes "Jane-Doe-Backend.pdf": ASCII only, safe in a header and in an object key. */
    static String safeFileName(String label, Long resumeId) {
        String stem = Normalizer.normalize(label == null ? "" : label, Normalizer.Form.NFKD)
            .replaceAll("[^A-Za-z0-9._ -]+", "")
            .trim()
            .replaceAll("\\s+", "-")
            .replaceAll("-+", "-")
            .replaceAll("^[.-]+", "");
        if (stem.length() > 80) stem = stem.substring(0, 80);
        return (stem.isEmpty() ? "resume-" + resumeId : stem) + ".pdf";
    }
}
