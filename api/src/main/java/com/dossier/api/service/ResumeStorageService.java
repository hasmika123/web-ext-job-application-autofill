package com.dossier.api.service;

/**
 * Stores and retrieves resume file bytes in the S3-compatible blob store
 * (Cloudflare R2 / MinIO). The object key returned by {@link #store} is what gets
 * persisted in {@code resume.r2ObjectKey}; the bytes never live in the database.
 */
public interface ResumeStorageService {
    /** A stored resume file plus its content type, as returned by {@link #load}. */
    record StoredFile(byte[] content, String contentType) {}

    /** Build a stable, collision-resistant object key for a user's resume upload. */
    String objectKeyFor(Long userId, Long resumeId, String fileName);

    /**
     * Build a stable, collision-resistant object key under an arbitrary {@code prefix}
     * (e.g. "application-attachments") for a user's file upload. Same scheme as
     * {@link #objectKeyFor(Long, Long, String)} but namespaced by the given prefix.
     */
    String objectKeyFor(String prefix, Long userId, Long entityId, String fileName);

    /** Upload bytes under {@code objectKey}; returns the key for persistence. */
    String store(String objectKey, byte[] content, String contentType);

    /** Download the bytes (and content type) previously stored under {@code objectKey}. */
    StoredFile load(String objectKey);

    /** Remove the object; no-op if it does not exist. */
    void delete(String objectKey);
}
