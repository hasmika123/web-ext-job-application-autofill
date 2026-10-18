package com.dossier.api.service;

import com.dossier.api.service.dto.ResumeDocDTO;
import com.dossier.api.service.resume.ResumePhotoProcessor;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.StorageKeys;
import com.dossier.api.service.storage.StorageObjectNotFoundException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * The profile photo of a built resume (Resume Builder R7.4, DESIGN 5). Upload, replace, remove and serve - owner only.
 *
 * <p>An upload is: the resume must be the caller's (the generic 404 otherwise, before anything else is said), the feature switch
 * {@code feature.resume_photo.enabled} must be on (403 {@code FEATURE_DISABLED}), the bytes at most {@code resume.photo.maxBytes}
 * (413 {@code PHOTO_TOO_LARGE}), a JPEG, PNG or WebP ({@link ResumePhotoProcessor}: 415 {@code PHOTO_FORMAT}, 422 {@code PHOTO_INVALID}).
 * The rewritten bytes (metadata gone) are stored through {@link FileStorage} under {@code resume-photos/<userId>/<resumeId>-<uuid>-photo.<ext>},
 * the document's {@code basics.photo} is pointed at the new key through {@link ResumeDocService#setPhoto} (a {@code PHOTO} version row), and
 * only then is the previous file deleted - so a failed write never leaves a document naming a missing file, and a failed delete leaves at
 * worst an orphan that account / resume deletion sweeps by prefix.
 *
 * <p>Nothing is inferred from the picture and nothing but the bytes is stored.
 */
@Service
public class ResumePhotoService {

    private static final Logger LOG = LoggerFactory.getLogger(ResumePhotoService.class);

    public static final String CODE_FEATURE_DISABLED = "FEATURE_DISABLED";

    /** A stored photo as served: the bytes, the content type and the storage key (the HTTP ETag). */
    public record Photo(byte[] content, String contentType, String key) {}

    private final ResumeDocService docs;
    private final ResumePhotoProcessor processor;
    private final FileStorage storage;
    private final ResumeBuilderSettings settings;

    public ResumePhotoService(ResumeDocService docs, ResumePhotoProcessor processor, FileStorage storage, ResumeBuilderSettings settings) {
        this.docs = docs;
        this.processor = processor;
        this.storage = storage;
        this.settings = settings;
    }

    /** Add or replace the photo with {@code bytes}; answers the saved document (its new ETag is the editor's next If-Match). */
    public ResumeDocDTO upload(Long resumeId, byte[] bytes) {
        Long ownerId = docs.ownerIdOf(resumeId); // 404 first: nothing about the feature or the file is said to a non-owner
        if (!settings.getBool(ResumeBuilderSettingKeys.FEATURE_PHOTO)) {
            throw new ResumeDocException(403, CODE_FEATURE_DISABLED, "Photos are switched off right now", Map.of());
        }
        long max = settings.getInt(ResumeBuilderSettingKeys.PHOTO_MAX_BYTES);
        if (bytes != null && bytes.length > max) {
            throw new ResumeDocException(413, ResumePhotoProcessor.CODE_TOO_LARGE, "The picture is larger than " + (max / 1024) + " KB.", Map.of("maxBytes", max));
        }
        ResumePhotoProcessor.Processed photo = processor.process(bytes);

        String key = storage.objectKeyFor(StorageKeys.RESUME_PHOTOS, ownerId, resumeId, "photo" + photo.ext());
        storage.store(key, photo.bytes(), photo.contentType());
        ResumeDocService.PhotoChange change;
        try {
            change = setPhotoRetrying(resumeId, key);
        } catch (RuntimeException e) {
            deleteQuietly(key);
            throw e;
        }
        deleteQuietly(change.previousKey());
        return change.dto();
    }

    /** Remove the photo: the file goes and {@code basics.photo} becomes null. Idempotent (a resume without a photo is answered as it is). */
    public ResumeDocDTO remove(Long resumeId) {
        if (docs.photoKeyFor(resumeId) == null) return docs.get(resumeId);
        ResumeDocService.PhotoChange change = setPhotoRetrying(resumeId, null);
        deleteQuietly(change.previousKey());
        return change.dto();
    }

    /** How many times a photo write is tried when the row changed under it (see {@link #setPhotoRetrying}). */
    static final int WRITE_ATTEMPTS = 3;

    /**
     * {@link ResumeDocService#setPhoto} is a read-modify-write of the document row, and the background PDF job writes that same row when it
     * stores a finished file. A photo write that loses that race failed with a raw {@code error.concurrencyFailure} although nothing the person
     * did conflicted (the photo is server-owned content, not a merge of client state). Each attempt reloads the row in its own transaction,
     * so trying again is safe; a row that keeps changing still ends in the original error after {@link #WRITE_ATTEMPTS} tries.
     */
    private ResumeDocService.PhotoChange setPhotoRetrying(Long resumeId, String key) {
        for (int attempt = 1; ; attempt++) {
            try {
                return docs.setPhoto(resumeId, key);
            } catch (ObjectOptimisticLockingFailureException e) {
                if (attempt >= WRITE_ATTEMPTS) throw e;
                LOG.debug("resume {} photo write lost a race with another write, trying again ({}/{})", resumeId, attempt, WRITE_ATTEMPTS);
                try {
                    Thread.sleep(60L * attempt);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
        }
    }

    /** The photo for the owner's editor; 404 when the resume is not theirs, has no photo, or the file is gone. */
    public Photo get(Long resumeId) {
        String key = docs.photoKeyFor(resumeId);
        if (key == null) throw notFound();
        try {
            FileStorage.StoredFile f = storage.load(key);
            return new Photo(f.content(), f.contentType() != null ? f.contentType() : "image/jpeg", key);
        } catch (StorageObjectNotFoundException e) {
            throw notFound();
        }
    }

    /** The key only, for the ETag check (no bytes are read). */
    public String keyFor(Long resumeId) {
        String key = docs.photoKeyFor(resumeId);
        if (key == null) throw notFound();
        return key;
    }

    private void deleteQuietly(String key) {
        if (key == null) return;
        try {
            storage.delete(key);
        } catch (RuntimeException e) {
            LOG.warn("Could not delete the replaced photo {}: {}", key, e.getMessage());
        }
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "No photo");
    }
}
