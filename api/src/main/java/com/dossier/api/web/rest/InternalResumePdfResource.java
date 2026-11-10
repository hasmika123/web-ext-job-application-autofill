package com.dossier.api.web.rest;

import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ResumeDocService;
import com.dossier.api.service.ResumePdfJobService;
import com.dossier.api.service.ResumePdfJobService.ClaimedJob;
import com.dossier.api.service.ResumePdfJobService.FailKind;
import com.dossier.api.service.dto.ResumeDocDTO;
import com.dossier.api.service.storage.FileStorage.StoredFile;
import io.swagger.v3.oas.annotations.Hidden;
import java.io.IOException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/**
 * The PDF worker's endpoints (Resume Builder R3.7, DESIGN 8.5 / 9.8). Service-to-service only: the
 * {@code /api/internal/**} chain ({@code InternalSecurityConfiguration}) admits a request with the shared
 * {@code X-Internal-Token} and nothing else, the BFF never proxies these paths, the edge never routes them
 * and they are left out of the published OpenAPI contract. They carry no user, so they are keyed by resume id.
 */
@Hidden
@RestController
@RequestMapping("/api/internal")
public class InternalResumePdfResource {

    /** Response header telling the worker how long to wait between claims (a setting, {@code resume.pdf.pollMs}). */
    public static final String POLL_HEADER = "X-Pdf-Poll-Ms";

    private final ResumePdfJobService jobs;
    private final ResumeDocService docs;
    private final ResumeBuilderSettings settings;

    public InternalResumePdfResource(ResumePdfJobService jobs, ResumeDocService docs, ResumeBuilderSettings settings) {
        this.jobs = jobs;
        this.docs = docs;
        this.settings = settings;
    }

    public record ClaimVM(String worker, Integer limit) {}

    public record FailVM(String kind, String message, String worker) {}

    /** Leases up to {@code limit} due jobs to {@code worker}. The poll interval travels in {@link #POLL_HEADER}. */
    @PostMapping("/resume-pdf-jobs/claim")
    public ResponseEntity<List<ClaimedJob>> claim(@RequestBody(required = false) ClaimVM vm) {
        ClaimVM body = vm == null ? new ClaimVM(null, null) : vm;
        List<ClaimedJob> claimed = jobs.claim(body.worker(), body.limit() == null ? 1 : body.limit());
        return ResponseEntity.ok().header(POLL_HEADER, String.valueOf(settings.getInt(ResumeBuilderSettingKeys.PDF_POLL_MS))).body(claimed);
    }

    /** A render did not produce a PDF: {@code kind} is BUSY, TIMEOUT or ERROR. */
    @PostMapping("/resume-pdf-jobs/{id}/fail")
    public ResponseEntity<Void> fail(@PathVariable("id") Long id, @RequestBody(required = false) FailVM vm) {
        FailKind kind = vm == null ? null : FailKind.parse(vm.kind());
        if (kind == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "kind must be BUSY, TIMEOUT or ERROR");
        }
        jobs.fail(id, vm.worker(), kind, vm.message());
        return ResponseEntity.noContent().build();
    }

    /** The document to render, by resume id (no user, no ETag). */
    @GetMapping("/resumes/{id}/doc")
    public ResponseEntity<ResumeDocDTO> doc(@PathVariable("id") Long id) {
        return ResponseEntity.ok(docs.getForWorker(id));
    }

    /** The document's photo bytes (404 when it has none). */
    @GetMapping("/resumes/{id}/photo")
    public ResponseEntity<byte[]> photo(@PathVariable("id") Long id) {
        StoredFile file = jobs.photo(id);
        MediaType type = file.contentType() != null ? MediaType.parseMediaType(file.contentType()) : MediaType.APPLICATION_OCTET_STREAM;
        return ResponseEntity.ok().contentType(type).body(file.content());
    }

    /**
     * The rendered PDF. Stored as the resume's file when {@code renderHash} is still the document's current
     * render hash, otherwise discarded; both answer 204 (a discard is a normal outcome, not an error). The optional
     * {@code thumb} part is the card thumbnail PNG of the first page (R3.13), stored with the PDF.
     */
    @PostMapping(value = "/resumes/{id}/pdf", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Void> pdf(
        @PathVariable("id") Long id,
        @RequestParam("file") MultipartFile file,
        @RequestParam("renderHash") String renderHash,
        @RequestParam(value = "pages", required = false, defaultValue = "1") int pages,
        @RequestParam(value = "fits", required = false, defaultValue = "true") boolean fits,
        @RequestParam(value = "thumb", required = false) MultipartFile thumb
    ) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file provided");
        }
        jobs.store(id, file.getBytes(), renderHash, pages, fits, thumb == null || thumb.isEmpty() ? null : thumb.getBytes());
        return ResponseEntity.noContent().build();
    }
}
