package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.ResumeAccessException;
import com.dossier.api.service.ResumeAccessService;
import com.dossier.api.service.ResumeAccessService.PdfFile;
import com.dossier.api.service.dto.ResumeAccessDTOs.AccessGrantDTO;
import com.dossier.api.service.dto.ResumeAccessDTOs.ResumeAccessOverviewDTO;
import com.dossier.api.service.dto.ResumeAccessDTOs.ResumeViewDTO;
import com.dossier.api.service.dto.ResumeAccessDTOs.SharedResumeDTO;
import com.dossier.api.service.dto.ResumeDocDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who can see a resume (Resume Builder R3.11, DESIGN 9.7): the owner's grants, links and view audit, and the
 * signed-in viewer's side (resumes shared with me, read-only). Every owner route is scoped to the authenticated
 * user - another user's resume id is a 404 for every verb - and every viewer route answers 404 to anyone who may
 * not read the resume, so ids cannot be probed. The extension's list ({@code GET /api/profile/resumes}) is not
 * touched: it still returns only the caller's own resumes.
 */
@RestController
@RequestMapping("/api/profile/resumes")
@Tag(name = "resume-builder", description = "Resume Builder documents: create, load, save with ETag/If-Match, template, plain text.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class ResumeAccessResource {

    private final ResumeAccessService accessService;

    public ResumeAccessResource(ResumeAccessService accessService) {
        this.accessService = accessService;
    }

    /** Body of {@code POST /{id}/access}. */
    public record GrantVM(
        @Schema(description = "The email of a Kiwiply account.") String email,
        @Schema(description = "VIEW (the default); EDIT is not available yet.") String role,
        @Schema(description = "When the grant ends; omitted = it does not expire.") Instant expiresAt,
        @Schema(description = "A note for yourself, at most 80 characters.") String label
    ) {}

    /** Body of {@code POST /{id}/access/link}. */
    public record LinkVM(
        @Schema(description = "When the link stops working; omitted = resume.share.linkDefaultDays from now (0 = never).") Instant expiresAt,
        @Schema(description = "A note for yourself, e.g. 'Sent to recruiter at Acme' (at most 80 characters).") String label,
        @Schema(description = "May the holder download the PDF? Omitted = resume.share.allowDownloadDefault.") Boolean allowDownload
    ) {}

    @Operation(
        summary = "Who can see this resume",
        description = "{org, grants, links, viewers}: the org row is null when the organisation area is not in play. Expired grants are listed (expired=true) until removed; revoked ones are not. 404 if not owned."
    )
    @GetMapping("/{id}/access")
    public ResumeAccessOverviewDTO overview(@PathVariable("id") Long id) {
        return accessService.overview(id);
    }

    @Operation(
        summary = "Share a resume with a Kiwiply account",
        description = "Body {email, role?, expiresAt?, label?}. 404 USER_NOT_FOUND (no active account with that email), 409 ALREADY_GRANTED, 422 ROLE_NOT_AVAILABLE (only VIEW), 422 LIMIT (resume.share.maxGrants), 422 NOT_SHAREABLE (uploaded files), 422 ACCESS_INVALID, 422 SENSITIVE_CONTENT."
    )
    @PostMapping("/{id}/access")
    public ResponseEntity<AccessGrantDTO> grant(@PathVariable("id") Long id, @RequestBody(required = false) GrantVM vm) {
        GrantVM body = vm == null ? new GrantVM(null, null, null, null) : vm;
        return ResponseEntity.status(HttpStatus.CREATED).body(accessService.grantUser(id, body.email(), body.role(), body.expiresAt(), body.label()));
    }

    @Operation(
        summary = "Create a share link",
        description = "Body {expiresAt?, label?, allowDownload?}. The response carries the url. 403 FEATURE_DISABLED (feature.resume_share_links.enabled), 422 LIMIT (resume.share.maxLinks), 422 NOT_SHAREABLE, 422 ACCESS_INVALID."
    )
    @PostMapping("/{id}/access/link")
    public ResponseEntity<AccessGrantDTO> link(@PathVariable("id") Long id, @RequestBody(required = false) LinkVM vm) {
        LinkVM body = vm == null ? new LinkVM(null, null, null) : vm;
        return ResponseEntity.status(HttpStatus.CREATED).body(accessService.createLink(id, body.expiresAt(), body.label(), body.allowDownload()));
    }

    /** Body of {@code PATCH /{id}/access/{accessId}}. */
    public record LinkPatchVM(@Schema(description = "May the holder of this link download the PDF?") Boolean allowDownload) {}

    @Operation(
        summary = "Change a share link",
        description = "Body {allowDownload}: allow or stop PDF download on a live link without changing its address. 404 if the resume, or a live link of it, is not yours; 422 ACCESS_INVALID without allowDownload."
    )
    @PatchMapping("/{id}/access/{accessId}")
    public AccessGrantDTO patchLink(@PathVariable("id") Long id, @PathVariable("accessId") Long accessId, @RequestBody(required = false) LinkPatchVM vm) {
        if (vm == null || vm.allowDownload() == null) throw ResumeAccessException.invalid("$.allowDownload", "must be true or false");
        return accessService.setLinkDownload(id, accessId, vm.allowDownload());
    }

    @Operation(summary = "Revoke a grant or link",description = "Idempotent: 204 whether or not it was already revoked. 404 if the resume or the grant is not yours.")
    @DeleteMapping("/{id}/access/{accessId}")
    public ResponseEntity<Void> revoke(@PathVariable("id") Long id, @PathVariable("accessId") Long accessId) {
        accessService.revoke(id, accessId);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Who viewed this resume", description = "Newest first; limit defaults to 50 (1-200). Owner views are not recorded; link viewers are anonymous.")
    @GetMapping("/{id}/views")
    public List<ResumeViewDTO> views(@PathVariable("id") Long id, @RequestParam(value = "limit", required = false) Integer limit) {
        return accessService.views(id, limit);
    }

    @Operation(summary = "Resumes shared with me", description = "Web only: resumes where I hold a USER grant, plus (when the org area is in play) those of members who gave me FULL scope.")
    @GetMapping("/shared-with-me")
    public List<SharedResumeDTO> sharedWithMe() {
        return accessService.sharedWithMe();
    }

    @Operation(summary = "Read a resume shared with me", description = "Read-only, scrubbed document, no ETag; writes a view event. 404 unless I may read it.")
    @GetMapping("/shared/{id}/doc")
    public ResponseEntity<ResumeDocDTO> sharedDoc(@PathVariable("id") Long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(accessService.sharedDoc(id));
    }

    @Operation(summary = "Export a resume shared with me", description = "format=pdf: the stored PDF (409 PDF_NOT_READY while it is not current); writes a view event. 404 unless I may read it.")
    @GetMapping("/shared/{id}/export")
    public ResponseEntity<byte[]> sharedExport(@PathVariable("id") Long id, @RequestParam(value = "format", required = false) String format) {
        if (!"pdf".equals(format)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "format must be pdf");
        PdfFile pdf = accessService.sharedPdf(id);
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .contentType(MediaType.APPLICATION_PDF)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"resume.pdf\"")
            .body(pdf.file().content());
    }
}
