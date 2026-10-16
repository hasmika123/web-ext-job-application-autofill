package com.dossier.api.service.storage;

import java.util.List;
import java.util.UUID;

/**
 * Driver-neutral key scheme shared by every {@link FileStorage}, and the <b>one inventory</b> of the key
 * prefixes the API writes. Every file a user owns lives under {@code <prefix>/<userId>/...}, so deleting a
 * user means deleting those prefixes: {@link #userPrefixes} and {@link #resumePrefixes} are what
 * {@link StoredFileEraser} (account deletion, single-resume delete) walks. <b>A new stored object type
 * must add its prefix here</b> (and to {@code StorageKeysTest}); that is the only place to forget.
 */
public final class StorageKeys {

    /** Uploaded resume files and the PDFs the builder renders (the resume's own slot, {@code resume.r2ObjectKey}). */
    public static final String RESUMES = "resumes";
    /** The file a built resume was imported from ({@code meta.originalFileKey}), kept aside from the resume slot. */
    public static final String RESUME_ORIGINALS = "resume-originals";
    /** Profile photos of built resumes ({@code basics.photo.key}, {@code resume_doc.photo_key}). */
    public static final String RESUME_PHOTOS = "resume-photos";
    /** Card thumbnails made by the PDF job ({@code resume_doc.thumb_key}); key ends {@code <resumeId>-<renderHash>.png}. */
    public static final String RESUME_THUMBS = "resume-thumbs";
    /** Per-resume prefixes whose entity id is the resume id: {@code <prefix>/<userId>/<resumeId>-...}. */
    private static final List<String> RESUME_SCOPED = List.of(RESUMES, RESUME_ORIGINALS, RESUME_PHOTOS, RESUME_THUMBS);

    /** Application attachments; the entity id is the application id, so they are per-user, not per-resume. */
    public static final String APPLICATION_ATTACHMENTS = "application-attachments";

    private StorageKeys() {}

    /** Every prefix under which one user's files can exist, e.g. {@code resumes/42/}. Ends with a slash. */
    public static List<String> userPrefixes(Long userId) {
        List<String> all = new java.util.ArrayList<>();
        for (String p : RESUME_SCOPED) all.add(p + "/" + userId + "/");
        all.add(APPLICATION_ATTACHMENTS + "/" + userId + "/");
        return List.copyOf(all);
    }

    /**
     * Every prefix under which one resume's files can exist, e.g. {@code resume-thumbs/42/7-}. The trailing
     * dash is the key scheme's separator, so {@code .../7-} never matches resume 70.
     */
    public static List<String> resumePrefixes(Long userId, Long resumeId) {
        return RESUME_SCOPED.stream().map(p -> p + "/" + userId + "/" + resumeId + "-").toList();
    }

    /**
     * Whether {@code key} is one of THIS resume's own objects: it starts with {@code <prefix>/<ownerId>/<resumeId>-} for a resume-scoped prefix and
     * carries no path tricks. The one check every loader or deleter of a key read from the database makes before touching the blob store, so a key
     * that names somebody else's object (a stray row, a hostile write that slipped past an earlier check) is never followed.
     */
    public static boolean isResumeKey(Long ownerId, Long resumeId, String key) {
        if (ownerId == null || resumeId == null || key == null || key.isBlank() || hasPathTricks(key)) return false;
        for (String prefix : resumePrefixes(ownerId, resumeId)) if (key.startsWith(prefix)) return true;
        return false;
    }

    /** Whether {@code key} lies under one of {@code ownerId}'s own prefixes (account and bulk erasure, where the resume id is not the point). */
    public static boolean isUserKey(Long ownerId, String key) {
        if (ownerId == null || key == null || key.isBlank() || hasPathTricks(key)) return false;
        for (String prefix : userPrefixes(ownerId)) if (key.startsWith(prefix)) return true;
        return false;
    }

    private static boolean hasPathTricks(String key) {
        if (key.contains("\\") || key.startsWith("/")) return true;
        for (String segment : key.split("/", -1)) if (segment.isEmpty() || segment.equals(".") || segment.equals("..")) return true;
        return false;
    }

    static String objectKeyFor(String prefix, Long userId, Long entityId, String fileName) {
        // <prefix>/<userId>/<entityId>-<uuid>-<filename> — namespaced per user, unique.
        return (
            prefix +
            "/" +
            (userId == null ? "anon" : userId) +
            "/" +
            (entityId == null ? "new" : entityId) +
            "-" +
            UUID.randomUUID() +
            "-" +
            sanitize(fileName)
        );
    }

    static String sanitize(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return "resume";
        }
        // Keep a readable, path-safe tail of the original name.
        String base = fileName.replaceAll(".*[/\\\\]", "").replaceAll("[^A-Za-z0-9._-]+", "_");
        return base.length() > 100 ? base.substring(base.length() - 100) : base;
    }
}
