package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.ResumePhotoService;
import com.dossier.api.service.dto.ResumeDocDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * The profile photo of a built resume (Resume Builder R7.4, DESIGN 5): {@code /api/profile/resumes/{id}/photo}. Owner only;
 * another user's resume id is the same plain 404 as a missing one, for every verb.
 */
@RestController
@RequestMapping("/api/profile/resumes")
@Tag(name = "resume-builder", description = "Resume Builder documents: create, load, save with ETag/If-Match, template, plain text.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class ResumePhotoResource {

    private final ResumePhotoService photos;

    public ResumePhotoResource(ResumePhotoService photos) {
        this.photos = photos;
    }

    @Operation(
        summary = "Add or replace a resume's photo",
        description = "multipart field 'file': a JPEG, PNG or WebP (magic bytes decide). Metadata (EXIF, GPS, ICC, XMP) is removed server-side; JPEG/PNG are cropped to a centred square, scaled to at most 512 px and stored as JPEG. " +
            "Answers the saved document (new ETag). 404 if the resume is not yours, 403 FEATURE_DISABLED (feature.resume_photo.enabled), 413 PHOTO_TOO_LARGE (resume.photo.maxBytes), 415 PHOTO_FORMAT, 422 PHOTO_INVALID."
    )
    @PostMapping("/{id}/photo")
    public ResponseEntity<ResumeDocDTO> upload(@PathVariable("id") Long id, @RequestParam("file") MultipartFile file) throws IOException {
        ResumeDocDTO dto = photos.upload(id, file.getBytes());
        return ResponseEntity.ok().header(HttpHeaders.ETAG, "\"" + dto.getDocVersion() + "\"").body(dto);
    }

    @Operation(summary = "Remove a resume's photo", description = "Deletes the file and sets basics.photo to null; answers the saved document (new ETag). Idempotent. 404 if not owned.")
    @DeleteMapping("/{id}/photo")
    public ResponseEntity<ResumeDocDTO> remove(@PathVariable("id") Long id) {
        ResumeDocDTO dto = photos.remove(id);
        return ResponseEntity.ok().header(HttpHeaders.ETAG, "\"" + dto.getDocVersion() + "\"").body(dto);
    }

    @Operation(summary = "A resume's photo", description = "The stored picture. ETag = its storage key (a new upload is a new key); Cache-Control: private, max-age=300; 304 on a matching If-None-Match. 404 when the resume is not yours or has no photo.")
    @GetMapping("/{id}/photo")
    public ResponseEntity<byte[]> get(@PathVariable("id") Long id, @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        CacheControl cache = CacheControl.maxAge(java.time.Duration.ofSeconds(300)).cachePrivate();
        String etag = "\"" + photos.keyFor(id) + "\"";
        if (ifNoneMatch != null && matches(ifNoneMatch, etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).cacheControl(cache).build();
        }
        ResumePhotoService.Photo photo = photos.get(id);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(photo.contentType())).eTag("\"" + photo.key() + "\"").cacheControl(cache).body(photo.content());
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
