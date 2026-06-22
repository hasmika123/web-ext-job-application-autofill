package com.dossier.api.web.rest;

import com.dossier.api.domain.Resume;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ResumeStorageService;
import com.dossier.api.service.ResumeStorageService.StoredFile;
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
 * (Cloudflare R2 / MinIO). Metadata CRUD lives in {@link ResumeResource}; this
 * controller only moves the file and keeps {@code resume.r2ObjectKey} in sync.
 * Each call is scoped to the current user's own resumes.
 */
@RestController
@RequestMapping("/api/resumes/{id}/file")
public class ResumeFileResource {

    private static final Logger LOG = LoggerFactory.getLogger(ResumeFileResource.class);

    private final ResumeRepository resumeRepository;
    private final ResumeStorageService storageService;

    public ResumeFileResource(ResumeRepository resumeRepository, ResumeStorageService storageService) {
        this.resumeRepository = resumeRepository;
        this.storageService = storageService;
    }

    @PostMapping
    public ResponseEntity<Void> upload(@PathVariable("id") Long id, @RequestParam("file") MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file provided");
        }
        Resume resume = ownedResumeOr404(id);
        Long userId = resume.getUser() != null ? resume.getUser().getId() : null;
        // Replace any previously stored object so we don't orphan bytes in R2.
        String previousKey = resume.getr2ObjectKey();
        String key = storageService.objectKeyFor(userId, resume.getId(), file.getOriginalFilename());
        storageService.store(key, file.getBytes(), file.getContentType());
        resume.setr2ObjectKey(key);
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
        StoredFile stored = storageService.load(key);
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
