package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.ProfileService;
import com.dossier.api.service.dto.BioDTO;
import com.dossier.api.service.dto.ResumeDTO;
import com.dossier.api.web.rest.vm.ProfileVM;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * The user-scoped sync API consumed by the extension and web app. Everything here
 * operates on the authenticated user's own data — the profile (single bio) and
 * their resumes. Raw id-based CRUD lives in {@code BioResource}/{@code ResumeResource}.
 */
@RestController
@RequestMapping("/api/profile")
@Tag(name = "profile-sync", description = "User-scoped sync API: the authenticated user's bio and resumes.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class ProfileResource {

    private static final Logger LOG = LoggerFactory.getLogger(ProfileResource.class);

    private final ProfileService profileService;

    public ProfileResource(ProfileService profileService) {
        this.profileService = profileService;
    }

    /** {@code GET /api/profile} : the current user's bio, or 404 if none yet. */
    @Operation(summary = "Get my bio", description = "The current user's bio payload, or 404 if none saved yet.")
    @GetMapping("")
    public ResponseEntity<BioDTO> getProfile() {
        LOG.debug("REST request to get the current user's profile");
        return profileService.getProfile()
            .map(ResponseEntity::ok)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No profile yet"));
    }

    /** {@code PUT /api/profile} : create or overwrite the current user's bio. */
    @Operation(summary = "Upsert my bio", description = "Create or overwrite the current user's single bio.")
    @PutMapping("")
    public ResponseEntity<BioDTO> putProfile(@Valid @RequestBody ProfileVM vm) {
        LOG.debug("REST request to upsert the current user's profile");
        return ResponseEntity.ok(profileService.upsertProfile(vm.getPayload()));
    }

    /** {@code GET /api/profile/resumes} : the current user's resumes. */
    @Operation(summary = "List my resumes", description = "All resumes owned by the current user.")
    @GetMapping("/resumes")
    public List<ResumeDTO> listResumes() {
        LOG.debug("REST request to list the current user's resumes");
        return profileService.listResumes();
    }

    // Note: no @Valid on resume create/update — a resume is synced before its file
    // exists, so the DTO's @NotNull r2ObjectKey isn't required here; the service
    // fills server-owned fields (object key, status, createdAt, user).

    /** {@code POST /api/profile/resumes} : create a resume owned by the current user. */
    @Operation(summary = "Create a resume", description = "Create a resume owned by the current user (server fills object key, status, createdAt).")
    @PostMapping("/resumes")
    public ResponseEntity<ResumeDTO> createResume(@RequestBody ResumeDTO resumeDTO) {
        LOG.debug("REST request to create a resume for the current user");
        return ResponseEntity.status(HttpStatus.CREATED).body(profileService.createResume(resumeDTO));
    }

    /** {@code PUT /api/profile/resumes/:id} : update one of the current user's resumes. */
    @Operation(summary = "Update a resume", description = "Update one of the current user's resumes; 404 if not owned.")
    @PutMapping("/resumes/{id}")
    public ResponseEntity<ResumeDTO> updateResume(@PathVariable("id") Long id, @RequestBody ResumeDTO resumeDTO) {
        LOG.debug("REST request to update resume {} for the current user", id);
        return ResponseEntity.ok(profileService.updateResume(id, resumeDTO));
    }

    /** {@code DELETE /api/profile/resumes/:id} : delete one of the current user's resumes. */
    @Operation(summary = "Delete a resume", description = "Delete one of the current user's resumes (and its stored file); 404 if not owned.")
    @DeleteMapping("/resumes/{id}")
    public ResponseEntity<Void> deleteResume(@PathVariable("id") Long id) {
        LOG.debug("REST request to delete resume {} for the current user", id);
        profileService.deleteResume(id);
        return ResponseEntity.noContent().build();
    }
}
