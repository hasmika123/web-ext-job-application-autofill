package com.dossier.api.service;

import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.User;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.StorageObjectNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Reads a built resume's card thumbnail (Resume Builder R3.13, DESIGN 8.10): the PNG the PDF job took of the first page,
 * kept in {@link FileStorage} under {@code resume-thumbs/<userId>/<resumeId>-<renderHash>.png}. Owner only here; an
 * authorised org viewer reads it through R8.1's own endpoint. A resume that is not the caller's, an uploaded file
 * and a resume whose PDF job has not produced a thumbnail yet are all the same plain 404.
 */
@Service
@Transactional(readOnly = true)
public class ResumeThumbnailService {

    /** The PNG bytes and the render hash they show (the HTTP ETag). */
    public record Thumbnail(byte[] content, String hash) {}

    private final ResumeDocRepository docs;
    private final UserRepository users;
    private final FileStorage storage;

    public ResumeThumbnailService(ResumeDocRepository docs, UserRepository users, FileStorage storage) {
        this.docs = docs;
        this.users = users;
        this.storage = storage;
    }

    /** The hash only (the ETag check needs no bytes); 404 when there is no thumbnail. */
    public String hash(Long resumeId) {
        return owned(resumeId).getThumbHash();
    }

    public Thumbnail get(Long resumeId) {
        ResumeDoc d = owned(resumeId);
        try {
            return new Thumbnail(storage.load(d.getThumbKey()).content(), d.getThumbHash());
        } catch (StorageObjectNotFoundException e) {
            throw notFound();
        }
    }

    private ResumeDoc owned(Long resumeId) {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));
        User user = users.findOneByLogin(login).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
        ResumeDoc d = resumeId == null ? null : docs.findByResumeIdAndUserId(resumeId, user.getId()).orElse(null);
        if (d == null || d.getThumbKey() == null || d.getThumbKey().isBlank() || d.getThumbHash() == null) throw notFound();
        return d;
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "No thumbnail");
    }
}
