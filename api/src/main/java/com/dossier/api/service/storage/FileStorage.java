package com.dossier.api.service.storage;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * The one seam through which every file byte in the API is stored and read: uploaded
 * resumes, application attachments, and (Resume Builder R0.6) built-resume PDFs. Nothing
 * outside {@code service.storage} may know whether the bytes sit on local disk or in S3
 * (an ArchUnit rule keeps the AWS SDK inside {@code service.storage.s3}).
 *
 * <p>Keys are opaque strings. The key returned by {@link #objectKeyFor} is what gets
 * persisted in {@code resume.r2ObjectKey} / {@code application.attachmentObjectKey} — the
 * column names are historical, the value is simply the storage key. The driver is chosen by
 * {@code dossier.storage.driver} ({@code local} by default, or {@code s3}); callers never see it.
 */
public interface FileStorage {
    /** A stored file plus its content type, as returned by {@link #load}. */
    record StoredFile(byte[] content, String contentType) {}

    /** Metadata for a stored object. {@code contentType} may be null if unknown. */
    record ObjectStat(long size, String contentType, String etag, Instant lastModified) {}

    /** One page of keys from {@link #list}; {@code nextToken} is null on the last page. */
    record KeyPage(List<String> keys, String nextToken) {}

    /** Build a stable, collision-resistant key for a user's resume upload. */
    default String objectKeyFor(Long userId, Long resumeId, String fileName) {
        return objectKeyFor(StorageKeys.RESUMES, userId, resumeId, fileName);
    }

    /**
     * Build a stable, collision-resistant key under {@code prefix} (e.g. "application-attachments")
     * for a user's file: {@code <prefix>/<userId>/<entityId>-<uuid>-<safeName>}.
     */
    default String objectKeyFor(String prefix, Long userId, Long entityId, String fileName) {
        return StorageKeys.objectKeyFor(prefix, userId, entityId, fileName);
    }

    /** Store {@code content} under {@code key}, replacing any existing object; returns the key. */
    default String store(String key, byte[] content, String contentType) {
        return store(key, new ByteArrayInputStream(content), content.length, contentType);
    }

    /** Streaming store; {@code declaredLength} is the exact number of bytes in {@code in}. Returns the key. */
    String store(String key, InputStream in, long declaredLength, String contentType);

    /** Read the whole object into memory. Throws {@link StorageObjectNotFoundException} if absent. */
    StoredFile load(String key);

    /** Stream the object. The caller closes the stream. Throws {@link StorageObjectNotFoundException} if absent. */
    InputStream open(String key);

    /** Size / content type / etag / mtime, or empty if the object does not exist. */
    Optional<ObjectStat> stat(String key);

    boolean exists(String key);

    /** Remove the object; a no-op if it does not exist. */
    void delete(String key);

    /**
     * Keys starting with {@code prefix}, in ascending order, one page at a time. Pass the previous
     * page's {@code nextToken} (or null for the first page).
     */
    KeyPage list(String prefix, String continuationToken);
}
