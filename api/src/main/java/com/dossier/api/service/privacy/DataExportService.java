package com.dossier.api.service.privacy;

import com.dossier.api.domain.privacy.DataExportJob;
import com.dossier.api.repository.privacy.DataExportJobRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import com.dossier.api.service.storage.FileStorage;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/**
 * The request side of the asynchronous data export (REAL-GAPS-C T1.2): a person asks for a copy of their data, a job row is queued, the worker
 * ({@link DataExportRunner}) builds a size-capped ZIP in file storage, and the person downloads it through a signed, expiring link.
 *
 * <p>Every method takes the authenticated caller's account id, and a job is looked up by (id, account id), so another account's job is simply "not found"
 * (the generic 404). Limits are admin settings: {@code privacy.export.max_per_day} requests per account per 24 hours (429 beyond), one active job at a
 * time (a second request while one is queued or running returns that job), {@code privacy.export.expiry_hours} of download time.
 *
 * <p>The link is {@code /api/account/exports/{id}/file?exp=&lt;epoch seconds&gt;&amp;sig=&lt;HMAC&gt;}: HMAC-SHA256 over id, account id and expiry with a key derived
 * from the server's signing secret. The download endpoint still requires the signed-in owner; the signature makes a link that was copied, or kept past
 * its expiry, useless. The file itself is deleted at expiry by the runner.
 */
@Service
public class DataExportService {

    static final List<String> ACTIVE = List.of(DataExportJob.QUEUED, DataExportJob.RUNNING);

    private final DataExportJobRepository jobs;
    private final FileStorage storage;
    private final ResumeBuilderSettings settings;
    private final TransactionTemplate tx;
    private final byte[] linkKey;

    public DataExportService(
        DataExportJobRepository jobs,
        FileStorage storage,
        ResumeBuilderSettings settings,
        PlatformTransactionManager transactionManager,
        @Value("${jhipster.security.authentication.jwt.base64-secret:}") String secret
    ) {
        this.jobs = jobs;
        this.storage = storage;
        this.settings = settings;
        this.tx = new TransactionTemplate(transactionManager);
        this.linkKey = deriveKey(secret);
    }

    /** What the person sees of a job. {@code downloadPath} is set only while it is READY and not expired. */
    public record View(Long id, String status, Instant requestedAt, Instant finishedAt, Instant expiresAt, Long sizeBytes, Integer fileCount, Integer skippedCount, String error, String downloadPath) {}

    public View request(Long userId, Instant now) {
        DataExportJob job = tx.execute(s -> {
            DataExportJob active = jobs.findByUserIdOrderByIdDesc(userId, PageRequest.of(0, 5)).stream().filter(j -> ACTIVE.contains(j.getStatus())).findFirst().orElse(null);
            if (active != null) return active; // one at a time: the same job again
            int perDay = settings.getInt(AdminSettingKeys.PRIVACY_EXPORT_MAX_PER_DAY);
            if (jobs.countByUserIdAndRequestedAtAfter(userId, now.minus(Duration.ofHours(24))) >= perDay) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many exports requested today");
            }
            DataExportJob j = new DataExportJob();
            j.setUserId(userId);
            j.setStatus(DataExportJob.QUEUED);
            j.setRequestedAt(now);
            return jobs.save(j);
        });
        return view(job, now);
    }

    public List<View> list(Long userId, Instant now) {
        return jobs.findByUserIdOrderByIdDesc(userId, PageRequest.of(0, 20)).stream().map(j -> view(j, now)).toList();
    }

    public View get(Long userId, Long id, Instant now) {
        return view(owned(userId, id), now);
    }

    /** A stream of the ZIP for a READY, unexpired job of this account whose link signature is valid. Never another account's job. */
    public Download download(Long userId, Long id, long exp, String sig, Instant now) {
        DataExportJob j = owned(userId, id);
        boolean linkOk = sig != null && exp > now.getEpochSecond() && constantTimeEquals(sig, sign(j.getId(), userId, exp));
        if (!linkOk) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found"); // a bad or stale link looks like no link
        if (!DataExportJob.READY.equals(j.getStatus()) || j.getStorageKey() == null || (j.getExpiresAt() != null && !j.getExpiresAt().isAfter(now))) {
            throw new ResponseStatusException(HttpStatus.GONE, "This export is no longer available");
        }
        InputStream in = storage.open(j.getStorageKey());
        return new Download(in, j.getSizeBytes() == null ? -1 : j.getSizeBytes(), "kiwiply-data-" + j.getId() + ".zip");
    }

    /** The open stream, its length and the file name to offer. The caller closes the stream. */
    public record Download(InputStream stream, long length, String fileName) {}

    private DataExportJob owned(Long userId, Long id) {
        return jobs.findByIdAndUserId(id, userId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found"));
    }

    private View view(DataExportJob j, Instant now) {
        String path = null;
        if (DataExportJob.READY.equals(j.getStatus()) && j.getExpiresAt() != null && j.getExpiresAt().isAfter(now)) {
            long exp = j.getExpiresAt().getEpochSecond();
            path = "/api/account/exports/" + j.getId() + "/file?exp=" + exp + "&sig=" + sign(j.getId(), j.getUserId(), exp);
        }
        return new View(j.getId(), j.getStatus(), j.getRequestedAt(), j.getFinishedAt(), j.getExpiresAt(), j.getSizeBytes(), j.getFileCount(), j.getSkippedCount(), j.getError(), path);
    }

    /** URL-safe HMAC of (job id, account id, expiry). */
    String sign(Long jobId, Long userId, long exp) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(linkKey, "HmacSHA256"));
            byte[] out = mac.doFinal((jobId + ":" + userId + ":" + exp).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(out);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HMAC unavailable", e);
        }
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    /** A key for these links only: SHA-256 of a purpose label plus the signing secret (a blank secret in a test profile gets a per-process random key). */
    private static byte[] deriveKey(String secret) {
        try {
            MessageDigest d = MessageDigest.getInstance("SHA-256");
            d.update("data-export-link:".getBytes(StandardCharsets.UTF_8));
            if (secret == null || secret.isBlank()) d.update(java.util.UUID.randomUUID().toString().getBytes(StandardCharsets.UTF_8));
            else d.update(secret.getBytes(StandardCharsets.UTF_8));
            return d.digest();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
