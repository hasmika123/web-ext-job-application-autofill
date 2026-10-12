package com.dossier.api.web.rest;

import com.dossier.api.domain.Resume;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ResumeDocService;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.FileStorage.StoredFile;
import com.dossier.api.service.storage.StorageObjectNotFoundException;
import java.io.IOException;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import tech.jhipster.web.util.HeaderUtil;

/**
 * Uploads, downloads and deletes the resume file bytes in the blob store
 * (via the FileStorage seam: local disk or S3). Metadata CRUD lives in {@link ResumeResource}; this
 * controller only moves the file and keeps {@code resume.r2ObjectKey} in sync.
 * Each call is scoped to the current user's own resumes.
 */
@RestController
@RequestMapping("/api/resumes/{id}/file")
public class ResumeFileResource {

    private static final Logger LOG = LoggerFactory.getLogger(ResumeFileResource.class);

    private final ResumeRepository resumeRepository;
    private final FileStorage storageService;

    private final DemoGuard demoGuard;
    private final ResumeBuilderSettings settings;
    private final ResumeDocService resumeDocService;

    public ResumeFileResource(
        ResumeRepository resumeRepository,
        FileStorage storageService,
        DemoGuard demoGuard,
        ResumeBuilderSettings settings,
        ResumeDocService resumeDocService
    ) {
        this.resumeDocService = resumeDocService;
        this.resumeRepository = resumeRepository;
        this.storageService = storageService;
        this.demoGuard = demoGuard;
        this.settings = settings;
    }

    @PostMapping
    public ResponseEntity<Void> upload(@PathVariable("id") Long id, @RequestParam("file") MultipartFile file) throws IOException {
        demoGuard.assertNotDemo();
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file provided");
        }
        // The same admin setting the web upload route and the setup wizard read (profile.upload.maxBytes).
        long maxBytes = settings.getInt(ResumeBuilderSettingKeys.PROFILE_UPLOAD_MAX_BYTES);
        if (file.getSize() > maxBytes) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "That file is over " + maxBytes + " bytes");
        }
        Resume resume = ownedResumeOr404(id);
        Long userId = resume.getUser() != null ? resume.getUser().getId() : null;
        // A resume built from an uploaded file (R2.6): this file is the user's original, kept apart from the
        // generated PDF (which owns the resume's own file slot and replaces what is in it).
        if (resumeDocService.wantsOriginal(resume)) {
            String originalKey = storageService.objectKeyFor("resume-originals", userId, resume.getId(), file.getOriginalFilename());
            storageService.store(originalKey, file.getBytes(), file.getContentType());
            try {
                resumeDocService.noteOriginalFile(id, originalKey);
            } catch (RuntimeException e) {
                storageService.delete(originalKey);
                throw e;
            }
            return ResponseEntity.ok()
                .headers(HeaderUtil.createAlert("dossierApi", "resume.fileUploaded", id.toString()))
                .build();
        }
        // Replace any previously stored object so we don't orphan stored bytes.
        String previousKey = resume.getr2ObjectKey();
        String key = storageService.objectKeyFor(userId, resume.getId(), file.getOriginalFilename());
        storageService.store(key, file.getBytes(), file.getContentType());
        resume.setr2ObjectKey(key);
        resume.setUpdatedByLogin(SecurityUtils.getCurrentUserLogin().orElse(null)); // R3.9: who last wrote the resume
        resumeRepository.save(resume);
        if (previousKey != null && !previousKey.isBlank() && !previousKey.equals(key)) {
            storageService.delete(previousKey);
        }
        return ResponseEntity.ok()
            .headers(HeaderUtil.createAlert("dossierApi", "resume.fileUploaded", id.toString()))
            .build();
    }

    @GetMapping
    public ResponseEntity<byte[]> download(@PathVariable("id") Long id) {
        Resume resume = ownedResumeOr404(id);
        String key = resume.getr2ObjectKey();
        if (key == null || key.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No file stored for this resume");
        }
        StoredFile stored;
        try {
            stored = storageService.load(key);
        } catch (StorageObjectNotFoundException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "FILE_MISSING");
        }
        MediaType contentType = stored.contentType() != null
            ? MediaType.parseMediaType(stored.contentType())
            : MediaType.APPLICATION_OCTET_STREAM;
        return ResponseEntity.ok()
            .contentType(contentType)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + safeDownloadName(resume) + "\"")
            .body(stored.content());
    }

    @DeleteMapping
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        demoGuard.assertNotDemo();
        Resume resume = ownedResumeOr404(id);
        String key = resume.getr2ObjectKey();
        if (key != null && !key.isBlank()) {
            storageService.delete(key);
        }
        return ResponseEntity.noContent()
            .headers(HeaderUtil.createAlert("dossierApi", "resume.fileDeleted", id.toString()))
            .build();
    }

    /** Load the resume and ensure it belongs to the current user; 404 otherwise. */
    private Resume ownedResumeOr404(Long id) {
        Optional<Resume> found = resumeRepository.findOneWithEagerRelationships(id);
        String currentLogin = SecurityUtils.getCurrentUserLogin().orElse(null);
        if (found.isEmpty() || found.get().getUser() == null || !found.get().getUser().getLogin().equals(currentLogin)) {
            // Don't leak existence of other users' resumes.
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Resume not found");
        }
        return found.get();
    }

    private static String safeDownloadName(Resume resume) {
        String label = resume.getLabel() == null ? "resume" : resume.getLabel().replaceAll("[^A-Za-z0-9._-]+", "_");
        return label.isBlank() ? "resume" : label;
    }
}
