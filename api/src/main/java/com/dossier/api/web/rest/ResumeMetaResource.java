package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.ResumeMetaService;
import com.dossier.api.service.dto.ResumeLineageDTO;
import com.dossier.api.service.dto.ResumeMetaDTO;
import com.dossier.api.service.dto.ResumeVersionDTO;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Resume metadata (Resume Builder R3.9, DESIGN 9.7, 9.10, 9.11), for built and uploaded resumes alike:
 * the {@code meta} read/patch, the master to tailored lineage, checkpoints and the version history.
 * Everything is scoped to the authenticated user; another user's resume id is a 404 for every verb.
 */
@RestController
@RequestMapping("/api/profile/resumes")
@Tag(name = "resume-builder", description = "Resume Builder documents: create, load, save with ETag/If-Match, template, plain text.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class ResumeMetaResource {

    private final ResumeMetaService metaService;
    private final DemoGuard demoGuard;

    public ResumeMetaResource(ResumeMetaService metaService, DemoGuard demoGuard) {
        this.metaService = metaService;
        this.demoGuard = demoGuard;
    }

    /** Body of {@code POST /{id}/doc/checkpoint}. */
    public record CheckpointVM(@Schema(description = "Optional name for this version (at most 80 characters); without it the checkpoint is unnamed.") String name) {}

    @Operation(summary = "Get a resume's metadata", description = "Name, target, tags, primary, lifecycle, role, lineage, visibility, version and PDF state. 404 if not owned.")
    @GetMapping("/{id}/meta")
    public ResumeMetaDTO getMeta(@PathVariable("id") Long id) {
        return metaService.get(id);
    }

    @Operation(
        summary = "Change a resume's metadata",
        description = "Body {name?, target?, tags?, primary?, starred?, archived?, shareWithOrg?}; only the fields sent change. 422 META_INVALID (blank or over-long name, over-long target, more than 10 tags or one over 24 characters), 409 PRIMARY_REQUIRED (unsetting the primary, or archiving it while other live resumes exist)."
    )
    @PatchMapping("/{id}/meta")
    public ResumeMetaDTO patchMeta(@PathVariable("id") Long id, @RequestBody(required = false) JsonNode body) {
        demoGuard.assertNotDemo();
        return metaService.patch(id, body);
    }

    @Operation(summary = "Get a resume's master/tailored family", description = "The master (the resume itself for a master), its tailored children, and this resume's role.")
    @GetMapping("/{id}/lineage")
    public ResumeLineageDTO getLineage(@PathVariable("id") Long id) {
        return metaService.lineage(id);
    }

    @Operation(summary = "Detach a tailored resume", description = "Turns a tailored resume into a master (it keeps its content and job target). 409 NOT_TAILORED otherwise.")
    @PostMapping("/{id}/detach")
    public ResumeMetaDTO detach(@PathVariable("id") Long id) {
        demoGuard.assertNotDemo();
        return metaService.detach(id);
    }

    @Operation(
        summary = "Write a checkpoint",
        description = "Body {name?}. Writes a MANUAL (or NAMED) version of the saved document and asks for its PDF at once. 404 if not owned or uploaded, 422 DOC_INVALID for a name over 80 characters."
    )
    @PostMapping("/{id}/doc/checkpoint")
    public ResumeMetaService.Checkpoint checkpoint(@PathVariable("id") Long id, @RequestBody(required = false) CheckpointVM vm) {
        demoGuard.assertNotDemo();
        return metaService.checkpoint(id, vm == null ? null : vm.name());
    }

    @Operation(summary = "List a resume's versions", description = "Newest first: {versionNo, reason, name, createdAt, contentHash, by, kind (auto|named|checkpoint|system)}.")
    @GetMapping("/{id}/doc/versions")
    public List<ResumeVersionDTO> versions(@PathVariable("id") Long id) {
        return metaService.versions(id);
    }

    @Operation(summary = "A version as plain text", description = "The ATS text of one version, for Compare. 404 if there is no such version.")
    @GetMapping(value = "/{id}/doc/versions/{n}/text", produces = MediaType.TEXT_PLAIN_VALUE + ";charset=UTF-8")
    public ResponseEntity<String> versionText(@PathVariable("id") Long id, @PathVariable("n") int n) {
        return ResponseEntity.ok().contentType(new MediaType(MediaType.TEXT_PLAIN, StandardCharsets.UTF_8)).body(metaService.versionText(id, n));
    }
}
