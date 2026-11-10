package com.dossier.api.service.storage;

import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Removes every stored file that belongs to a user or to one resume, found by the prefixes in
 * {@link StorageKeys} rather than by the keys the rows happen to remember. That is deliberate: a row only
 * knows its <i>current</i> object, while the store can also hold a replaced thumbnail, a PDF whose delete
 * failed quietly, or an original kept aside - for GDPR/CCPA deletion "every file the user owns" has to be
 * true by construction. Callers run it <b>before</b> deleting rows, inside the deleting transaction, so a
 * storage failure (it throws) rolls the deletion back instead of orphaning bytes.
 */
@Component
public class StoredFileEraser {

    private static final Logger LOG = LoggerFactory.getLogger(StoredFileEraser.class);

    private final FileStorage storage;

    public StoredFileEraser(FileStorage storage) {
        this.storage = storage;
    }

    /** Every file of one resume: its uploaded file or PDF, kept-aside original, photo and thumbnails. Returns the count removed. */
    public int deleteResumeFiles(Long userId, Long resumeId) {
        return deletePrefixes(StorageKeys.resumePrefixes(userId, resumeId));
    }

    /** Every file of one user: all resume files and all application attachments. Returns the count removed. */
    public int deleteUserFiles(Long userId) {
        return deletePrefixes(StorageKeys.userPrefixes(userId));
    }

    private int deletePrefixes(List<String> prefixes) {
        int removed = 0;
        for (String prefix : prefixes) {
            // Collect first, then delete: paging a listing while removing from it is driver-dependent.
            List<String> keys = new ArrayList<>();
            String token = null;
            do {
                FileStorage.KeyPage page = storage.list(prefix, token);
                keys.addAll(page.keys());
                token = page.nextToken();
            } while (token != null);
            for (String key : keys) {
                storage.delete(key);
                removed++;
            }
        }
        if (removed > 0) LOG.debug("Removed {} stored file(s) under {}", removed, prefixes);
        return removed;
    }
}
