package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.ResumeDocService;
import com.dossier.api.service.dto.BuiltResumeDTO;
import com.dossier.api.service.dto.ResumeDocDTO;
import com.dossier.api.service.dto.ResumePdfDTO;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * The Resume Builder document API (R0.3), a sibling of {@link ProfileResource} under
 * {@code /api/profile/resumes}. Everything is scoped to the authenticated user; another user's
 * resume id is a 404 for every verb. A document is loaded with its version in the {@code ETag} and
 * saved only with that version in {@code If-Match}.
 */
@RestController
@RequestMapping("/api/profile/resumes")
@Tag(name = "resume-builder", description = "Resume Builder documents: create, load, save with ETag/If-Match, template, plain text.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class ResumeDocResource {

    private static final Logger LOG = LoggerFactory.getLogger(ResumeDocResource.class);

    private final ResumeDocService resumeDocService;
    private final DemoGuard demoGuard;

    public ResumeDocResource(ResumeDocService resumeDocService, DemoGuard demoGuard) {
        this.resumeDocService = resumeDocService;
        this.demoGuard = demoGuard;
    }

    /** Body of {@code POST /built}. */
    public record CreateBuiltVM(
        @Schema(description = "An enabled template id (setting resume.templates.enabled); the configured default (modern) when omitted.") String templateId,
        @Schema(description = "Free label for the role this resume targets (meta.target).") String target,
        @Schema(description = "The resume's name; defaults by source: the target / 'My resume', the file name, '<from> (copy)'.") String label,
        @Schema(
            type = "object",
            description = "Where the content comes from: 'profile' (default), 'scratch', {kind:'upload', structured, bio?, fileName, keep?} or {kind:'copy', fromResumeId}."
        ) JsonNode source
    ) {}

    /** Body of {@code POST /{id}/doc/duplicate}. */
    public record DuplicateVM(@Schema(description = "The copy's name; '<name> (copy)' when omitted.") String label) {}

    /** Body of {@code PATCH /{id}/doc/template}. */
    public record TemplateVM(String templateId) {}

    /**
     * {@code POST /api/profile/resumes/built} : create a built resume and its first document, seeded
     * from the user's profile (items when they have any, else the bio header only).
     */
    @Operation(
        summary = "Create a built resume",
        description = "Creates a BUILT resume (the plan's resume cap applies first: 402 RESUME_LIMIT) from a source: the profile (default), scratch (header from the bio only), an upload (parsed structure; 422 SENSITIVE_CONTENT) or a copy of one of the caller's resumes (404 if not theirs)."
    )
    @PostMapping("/built")
    public ResponseEntity<BuiltResumeDTO> createBuilt(@RequestBody(required = false) CreateBuiltVM vm) {
        demoGuard.assertNotDemo();
        LOG.debug("REST request to create a built resume");
        CreateBuiltVM body = vm == null ? new CreateBuiltVM(null, null, null, null) : vm;
        BuiltResumeDTO created = resumeDocService.createBuilt(body.templateId(), body.target(), body.label(), body.source());
        return ResponseEntity.status(HttpStatus.CREATED)
            .header(HttpHeaders.ETAG, etag(created.doc()))
            .body(created);
    }

    /** {@code POST /api/profile/resumes/:id/doc/import} : turn an uploaded resume into a built one, in place. */
    @Operation(summary = "Open an uploaded resume in the builder", description = "Builds a document from the uploaded resume's parsed structure and makes it BUILT (same id). 409 ALREADY_BUILT when it already is; 404 if not owned.")
    @PostMapping("/{id}/doc/import")
    public ResponseEntity<BuiltResumeDTO> importUploaded(@PathVariable("id") Long id) {
        demoGuard.assertNotDemo();
        BuiltResumeDTO built = resumeDocService.importUploaded(id);
        return ResponseEntity.ok().header(HttpHeaders.ETAG, etag(built.doc())).body(built);
    }

    /** {@code POST /api/profile/resumes/:id/doc/duplicate} : a copy of a resume (an alias of {@code source: copy}). */
    @Operation(summary = "Duplicate a resume", description = "Same as POST /built with source {kind:'copy', fromResumeId}: the plan cap applies first (402), ids are regenerated, label '<name> (copy)'.")
    @PostMapping("/{id}/doc/duplicate")
    public ResponseEntity<BuiltResumeDTO> duplicate(@PathVariable("id") Long id, @RequestBody(required = false) DuplicateVM vm) {
        demoGuard.assertNotDemo();
        BuiltResumeDTO created = resumeDocService.duplicate(id, vm == null ? null : vm.label());
        return ResponseEntity.status(HttpStatus.CREATED).header(HttpHeaders.ETAG, etag(created.doc())).body(created);
    }

    /** {@code GET /api/profile/resumes/:id/original} : the file the resume was made from. */
    @Operation(summary = "Download the original uploaded file", description = "Owner only. 404 when the resume was not made from an upload or the file is gone.")
    @GetMapping("/{id}/original")
    public ResponseEntity<byte[]> original(@PathVariable("id") Long id) {
        ResumeDocService.StoredOriginal f = resumeDocService.original(id);
        MediaType type = f.contentType() != null ? MediaType.parseMediaType(f.contentType()) : MediaType.APPLICATION_OCTET_STREAM;
        return ResponseEntity.ok()
            .contentType(type)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + f.fileName() + "\"")
            .body(f.content());
    }

    /** {@code GET /api/profile/resumes/:id/doc} : the document, with its version as the ETag. */
    @Operation(summary = "Get a resume document", description = "The builder document; the ETag header is its version for If-Match. 404 if not owned.")
    @GetMapping("/{id}/doc")
    public ResponseEntity<ResumeDocDTO> getDoc(@PathVariable("id") Long id) {
        ResumeDocDTO dto = resumeDocService.get(id);
        return ResponseEntity.ok().header(HttpHeaders.ETAG, etag(dto)).body(dto);
    }

    /**
     * {@code PUT /api/profile/resumes/:id/doc} : save the whole document. {@code If-Match} is required
     * (428); a stale one is 409 {@code DOC_VERSION_CONFLICT} carrying the server's document.
     */
    @Operation(
        summary = "Save a resume document",
        description = "Body {doc, theme?}. Requires If-Match with the ETag you loaded: 428 without it, 409 DOC_VERSION_CONFLICT {serverVersion, doc} when stale, 413 DOC_TOO_LARGE over 256 KB, 422 DOC_INVALID {path, message}."
    )
    @PutMapping("/{id}/doc")
    public ResponseEntity<ResumeDocDTO> putDoc(
        @PathVariable("id") Long id,
        @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
        @RequestBody(required = false) JsonNode body
    ) {
        demoGuard.assertNotDemo();
        ResumeDocDTO dto;
        try {
            dto = resumeDocService.put(id, ifMatch, body);
        } catch (OptimisticLockingFailureException e) {
            // Lost a race between the If-Match check and the write: same answer as a stale If-Match.
            throw resumeDocService.conflictFor(id);
        }
        return ResponseEntity.ok().header(HttpHeaders.ETAG, etag(dto)).body(dto);
    }

    /** {@code PATCH /api/profile/resumes/:id/doc/template} : switch the template (422 if unknown). */
    @Operation(summary = "Switch a resume's template", description = "Body {templateId}; 422 DOC_INVALID for an unknown or disabled id. Does not change the fillable content.")
    @PatchMapping("/{id}/doc/template")
    public ResponseEntity<ResumeDocDTO> patchTemplate(@PathVariable("id") Long id, @RequestBody(required = false) TemplateVM vm) {
        demoGuard.assertNotDemo();
        ResumeDocDTO dto = resumeDocService.setTemplate(id, vm == null ? null : vm.templateId());
        return ResponseEntity.ok().header(HttpHeaders.ETAG, etag(dto)).body(dto);
    }

    /**
     * {@code PATCH /api/profile/resumes/:id/doc/theme} : replace the presentation (Customize Template).
     * Needs no If-Match; bumps the version like the template switch.
     */
    @Operation(
        summary = "Change a resume's theme",
        description = "Body {theme} (accent, fontPair, spacing, pageSize, dateStyle, showPhoto, fit{mode,target,step}, _touched): bounded fields only, at most 8 KB; 422 THEME_INVALID {path, message}. Does not change the content, writes no version row and bumps doc_version (the ETag)."
    )
    @PatchMapping("/{id}/doc/theme")
    public ResponseEntity<ResumeDocDTO> patchTheme(@PathVariable("id") Long id, @RequestBody(required = false) JsonNode body) {
        demoGuard.assertNotDemo();
        ResumeDocDTO dto = resumeDocService.setTheme(id, body);
        return ResponseEntity.ok().header(HttpHeaders.ETAG, etag(dto)).body(dto);
    }

    /** Body of {@code POST /{id}/export-recorded}. */
    public record ExportRecordedVM(@Schema(description = "The content hash of the document that was exported (ResumeDocDTO.contentHash).") String hash) {}

    /**
     * {@code POST /api/profile/resumes/:id/export-recorded} : the web calls it after a PDF was
     * uploaded to {@code /api/resumes/:id/file}. Sets {@code exportedAt}/{@code exportedHash}; never
     * bumps the document version.
     */
    @Operation(
        summary = "Record a successful PDF export",
        description = "Body {hash}: the contentHash that was exported. Sets exportedAt and exportedHash; 404 if not owned, 422 DOC_INVALID for a malformed hash."
    )
    @PostMapping("/{id}/export-recorded")
    public ResponseEntity<Void> exportRecorded(@PathVariable("id") Long id, @RequestBody(required = false) ExportRecordedVM vm) {
        demoGuard.assertNotDemo();
        resumeDocService.recordExport(id, vm == null ? null : vm.hash());
        return ResponseEntity.noContent().build();
    }

    /**
     * {@code GET /api/profile/resumes/:id/doc/pdf-status} : the stored PDF's state (R3.7). The editor polls it
     * while the PDF is not READY; {@code pollMs} / {@code pollWindowMs} tell it how often and for how long.
     */
    @Operation(summary = "Get the state of a resume's stored PDF", description = "NONE | PENDING | RUNNING | READY | FAILED | STALE (READY but behind the document); 404 if not owned.")
    @GetMapping("/{id}/doc/pdf-status")
    public ResponseEntity<ResumePdfDTO> getPdfStatus(@PathVariable("id") Long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(resumeDocService.pdfStatus(id));
    }

    /**
     * {@code POST /api/profile/resumes/:id/doc/pdf-now} : render the PDF without waiting for the settle delay
     * (leaving the editor; Retry after FAILED). A no-op when the stored PDF is current or a render is running.
     */
    @Operation(summary = "Generate the resume's PDF now", description = "Queues the PDF job immediately when the stored PDF is behind the document; 204 either way, 404 if not owned.")
    @PostMapping("/{id}/doc/pdf-now")
    public ResponseEntity<Void> pdfNow(@PathVariable("id") Long id) {
        demoGuard.assertNotDemo();
        resumeDocService.requestPdfNow(id);
        return ResponseEntity.noContent().build();
    }

    /** {@code GET /api/profile/resumes/:id/doc/text} : the document as plain text (what an ATS reads). */
    @Operation(summary = "Get a resume document as plain text", description = "text/plain rendering of the visible parts of the document.")
    @GetMapping(value = "/{id}/doc/text", produces = MediaType.TEXT_PLAIN_VALUE + ";charset=UTF-8")
    public ResponseEntity<String> getDocText(@PathVariable("id") Long id) {
        return ResponseEntity.ok().contentType(new MediaType(MediaType.TEXT_PLAIN, java.nio.charset.StandardCharsets.UTF_8)).body(resumeDocService.text(id));
    }

    private static String etag(ResumeDocDTO dto) {
        return "\"" + dto.getDocVersion() + "\"";
    }
}
