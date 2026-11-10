package com.dossier.api.service.resume;

import com.dossier.api.service.dto.ResumePdfDTO;
import java.time.Instant;

/**
 * The PDF job states of a built resume (DESIGN 8.5) and the one place that turns a row's stored state
 * into the {@link ResumePdfDTO} everybody reads. {@code STALE} is never stored: it is a READY file whose
 * render hash no longer matches what the document would render to now.
 */
public final class ResumePdfState {

    public static final String NONE = "NONE";
    public static final String PENDING = "PENDING";
    public static final String RUNNING = "RUNNING";
    public static final String READY = "READY";
    public static final String FAILED = "FAILED";
    public static final String STALE = "STALE";

    private ResumePdfState() {}

    /**
     * @param status the stored job status
     * @param exportedHash render hash of the stored PDF (null when there is none)
     * @param exportedAt when it was stored
     * @param renderHash the render hash of the document as it is now
     */
    public static ResumePdfDTO toDto(String status, String exportedHash, Instant exportedAt, String renderHash, int attempts, String error) {
        ResumePdfDTO dto = new ResumePdfDTO();
        boolean stale = READY.equals(status) && (exportedHash == null || !exportedHash.equals(renderHash));
        dto.setStatus(stale ? STALE : status == null ? NONE : status);
        dto.setHash(exportedHash);
        dto.setGeneratedAt(exportedAt);
        dto.setAttempts(attempts);
        dto.setError(error);
        return dto;
    }
}
