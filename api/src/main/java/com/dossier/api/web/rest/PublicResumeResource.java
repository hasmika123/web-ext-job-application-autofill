package com.dossier.api.web.rest;

import com.dossier.api.service.ResumeAccessService;
import com.dossier.api.service.ResumeAccessService.PdfFile;
import com.dossier.api.service.dto.ResumeAccessDTOs.PublicResumeDTO;
import com.dossier.api.web.filter.PublicShareRateLimiter;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * What a resume share link opens (Resume Builder R3.11, DESIGN 8.7 / 9.7). No login: the 32-character token is
 * the credential, so everything here is built not to confirm or deny anything else. An unknown, revoked or
 * expired link, and a link whose feature switch is off, are the same plain 404; lookups are rate-limited per
 * visitor and token and, for misses, per visitor ({@link PublicShareRateLimiter}); nothing about the visitor is
 * stored; responses are never cached and are marked {@code noindex}. Called by the web app on the visitor's behalf
 * (the public {@code /r/[token]} page), which forwards the visitor's address in {@code X-Forwarded-For}.
 */
@RestController
@RequestMapping("/api/public/resumes")
@Tag(name = "resume-builder", description = "Resume Builder documents: create, load, save with ETag/If-Match, template, plain text.")
public class PublicResumeResource {

    private final ResumeAccessService access;
    private final PublicShareRateLimiter limiter;

    public PublicResumeResource(ResumeAccessService access, PublicShareRateLimiter limiter) {
        this.access = access;
        this.limiter = limiter;
    }

    @Operation(
        summary = "Open a resume share link",
        description = "No authentication. The page content only: {name, doc, templateId, theme, allowDownload, pdfReady}. Writes an anonymous LINK view event. 404 for an unknown, revoked or expired link, 429 over the public rate limit."
    )
    @GetMapping("/{token}")
    public ResponseEntity<?> page(@PathVariable("token") String token, HttpServletRequest request) {
        ResponseEntity<?> throttled = throttle(request, token);
        if (throttled != null) return throttled;
        try {
            PublicResumeDTO dto = access.publicView(token);
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Robots-Tag", "noindex, nofollow").body(dto);
        } catch (ResponseStatusException e) {
            return missed(request, e);
        }
    }

    @Operation(
        summary = "Download the PDF behind a resume share link",
        description = "No authentication. 404 unless the link allows download, 409 PDF_NOT_READY while the stored PDF is not current. Writes an anonymous LINK view event."
    )
    @GetMapping("/{token}/pdf")
    public ResponseEntity<?> pdf(@PathVariable("token") String token, HttpServletRequest request) {
        ResponseEntity<?> throttled = throttle(request, token);
        if (throttled != null) return throttled;
        try {
            PdfFile pdf = access.publicPdf(token);
            return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header("X-Robots-Tag", "noindex, nofollow")
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"resume.pdf\"")
                .body(pdf.file().content());
        } catch (ResponseStatusException e) {
            return missed(request, e);
        }
    }

    /** 429 when this visitor has used up their requests for this token, else null. */
    private ResponseEntity<?> throttle(HttpServletRequest request, String token) {
        long retry = limiter.hit(request, token);
        return retry > 0 ? tooMany(retry) : null;
    }

    /** A 404 counts against the visitor's miss budget (so tokens cannot be walked); everything else is rethrown. */
    private ResponseEntity<?> missed(HttpServletRequest request, ResponseStatusException e) {
        if (e.getStatusCode() != HttpStatus.NOT_FOUND) throw e;
        long retry = limiter.miss(request);
        if (retry > 0) return tooMany(retry);
        throw e;
    }

    private static ResponseEntity<?> tooMany(long retryAfterSeconds) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header(HttpHeaders.RETRY_AFTER, Long.toString(retryAfterSeconds)).build();
    }
}
