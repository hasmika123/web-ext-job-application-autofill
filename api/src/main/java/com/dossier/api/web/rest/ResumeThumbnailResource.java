package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.ResumeThumbnailService;
import com.dossier.api.service.ResumeThumbnailService.Thumbnail;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The card thumbnail of a built resume (Resume Builder R3.13, DESIGN 8.10): {@code GET /api/profile/resumes/{id}/thumbnail}.
 * The ETag is the render hash the picture shows, so a browser (and the web's BFF) revalidates for free and a re-render
 * with the same hash never re-downloads; {@code Cache-Control: private, max-age=86400}. Owner only.
 */
@RestController
@RequestMapping("/api/profile/resumes")
@Tag(name = "resume-builder", description = "Resume Builder documents: create, load, save with ETag/If-Match, template, plain text.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class ResumeThumbnailResource {

    /** One day, in seconds (DESIGN 8.10). */
    private static final long MAX_AGE_SECONDS = 86_400;

    private final ResumeThumbnailService thumbnails;

    public ResumeThumbnailResource(ResumeThumbnailService thumbnails) {
        this.thumbnails = thumbnails;
    }

    @Operation(
        summary = "A built resume's card thumbnail (PNG)",
        description = "The first page of the stored render, taken by the PDF job. ETag = the render hash; 304 on a matching If-None-Match. 404 when the resume is not yours, is an uploaded file, or has no thumbnail yet."
    )
    @GetMapping("/{id}/thumbnail")
    public ResponseEntity<byte[]> thumbnail(@PathVariable("id") Long id, @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        String hash = thumbnails.hash(id);
        String etag = "\"" + hash + "\"";
        CacheControl cache = CacheControl.maxAge(java.time.Duration.ofSeconds(MAX_AGE_SECONDS)).cachePrivate();
        if (ifNoneMatch != null && matches(ifNoneMatch, etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).cacheControl(cache).build();
        }
        Thumbnail t = thumbnails.get(id);
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).eTag("\"" + t.hash() + "\"").cacheControl(cache).body(t.content());
    }

    private static boolean matches(String header, String etag) {
        for (String candidate : header.split(",")) {
            String c = candidate.trim();
            if (c.startsWith("W/")) c = c.substring(2);
            if (c.equals(etag) || c.equals("*")) return true;
        }
        return false;
    }
}
