package com.dossier.api.service.storage;

import java.util.UUID;

/** Driver-neutral key scheme shared by every {@link FileStorage}. */
final class StorageKeys {

    private StorageKeys() {}

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
