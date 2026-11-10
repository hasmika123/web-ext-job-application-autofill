package com.dossier.api.service.storage;

/** The requested key is not in the store (never uploaded, or already deleted). */
public class StorageObjectNotFoundException extends RuntimeException {

    public StorageObjectNotFoundException(String key) {
        super("No stored object for key: " + key);
    }

    public StorageObjectNotFoundException(String key, Throwable cause) {
        super("No stored object for key: " + key, cause);
    }
}
