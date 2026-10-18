package com.dossier.api.web.rest;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ApplicationEventService;
import com.dossier.api.service.tracker.ChangeActor;
import com.dossier.api.service.tracker.Changes;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.FileStorage.StoredFile;
import com.dossier.api.service.storage.StorageKeys;
import com.dossier.api.service.storage.StorageObjectNotFoundException;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/**
 * Uploads, previews and deletes the one-off resume PDF attached to a single application — the
 * file actually submitted for that job — kept separate from the resume library (so it never
 * shows on the Resumes page). User-scoped: every call operates on the current user's own
 * application (404 otherwise, no existence leak). Bytes live in S3; the row holds the key.
 */
@RestController
@RequestMapping("/api/profile/applications/{id}/attachment")
public class ApplicationAttachmentResource {

    private static final Logger LOG = LoggerFactory.getLogger(ApplicationAttachmentResource.class);
    private static final String PREFIX = StorageKeys.APPLICATION_ATTACHMENTS;

    private final ApplicationRepository applicationRepository;
    private final FileStorage storageService;
    private final ApplicationEventService eventService;

    public ApplicationAttachmentResource(
        ApplicationRepository applicationRepository,
        FileStorage storageService,
        ApplicationEventService eventService
    ) {
        this.applicationRepository = applicationRepository;
        this.storageService = storageService;
        this.eventService = eventService;
    }

    @PostMapping
    @Transactional
    public ResponseEntity<Void> upload(@PathVariable("id") Long id, @RequestParam("file") MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file provided");
        }
        Application app = ownedOr404(id);
        Long userId = app.getUser() != null ? app.getUser().getId() : null;
        // Replace any previously stored attachment so we don't orphan stored bytes.
        String previousKey = app.getAttachmentObjectKey();
        String key = storageService.objectKeyFor(PREFIX, userId, app.getId(), file.getOriginalFilename());
        storageService.store(key, file.getBytes(), file.getContentType());
        app.setAttachmentObjectKey(key);
        app.setAttachmentFilename(safeName(file.getOriginalFilename()));
        applicationRepository.save(app);
        // Change audit: attaching or replacing the submitted file is a change to the application (the file name is not recorded: it can name a person).
        eventService.record(
            app,
            ApplicationEvent.ATTACHMENT,
            null,
            null,
            ApplicationEvent.SRC_WEB,
            null,
            previousKey != null && !previousKey.isBlank() ? "Attachment replaced" : "Attachment added",
            ChangeActor.forOwner(app.getUser()),
            new Changes().text("attachment")
        );
        if (previousKey != null && !previousKey.isBlank() && !previousKey.equals(key)) {
            storageService.delete(previousKey);
        }
        LOG.debug("Stored attachment for application {}", id);
        return ResponseEntity.ok().build();
    }

    @GetMapping
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> download(@PathVariable("id") Long id) {
        Application app = ownedOr404(id);
        String key = app.getAttachmentObjectKey();
        if (key == null || key.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No attachment for this application");
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
        String name = app.getAttachmentFilename() != null ? app.getAttachmentFilename() : "attachment";
        // inline so the browser can render the PDF in the side-panel preview.
        return ResponseEntity.ok()
            .contentType(contentType)
            .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + name + "\"")
            .body(stored.content());
    }

    @DeleteMapping
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        Application app = ownedOr404(id);
        String key = app.getAttachmentObjectKey();
        if (key != null && !key.isBlank()) {
            storageService.delete(key);
        }
        boolean had = key != null && !key.isBlank();
        app.setAttachmentObjectKey(null);
        app.setAttachmentFilename(null);
        applicationRepository.save(app);
        if (had) {
            eventService.record(app, ApplicationEvent.ATTACHMENT, null, null, ApplicationEvent.SRC_WEB, null, "Attachment removed", ChangeActor.forOwner(app.getUser()), new Changes().text("attachment"));
        }
        return ResponseEntity.noContent().build();
    }

    /** Load the application and ensure it belongs to the current user; 404 otherwise. */
    private Application ownedOr404(Long id) {
        String login = SecurityUtils.getCurrentUserLogin().orElse(null);
        Application app = applicationRepository.findById(id).orElse(null);
        if (app == null || app.getUser() == null || !app.getUser().getLogin().equals(login)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Application not found");
        }
        return app;
    }

    private static String safeName(String name) {
        if (name == null || name.isBlank()) {
            return "attachment";
        }
        String cleaned = name.replaceAll("[^A-Za-z0-9._-]+", "_");
        return cleaned.length() > 255 ? cleaned.substring(0, 255) : cleaned;
    }
}
