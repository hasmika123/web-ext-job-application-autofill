package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.ApplicationSyncService;
import com.dossier.api.service.dto.ApplicationDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * The user-scoped applications sync API consumed by the extension and web board.
 * Lives under {@code /api/profile/applications} alongside the rest of the per-user
 * sync surface (the bare {@code /api/applications} is the generated, ADMIN-locked
 * entity CRUD). Everything here operates on the authenticated user's own rows.
 *
 * <p>{@code POST} is an UPSERT keyed on {@code externalJobId}/{@code jobUrl} so the
 * tracker fills itself without duplicating an entry each time the same job is filled.
 */
@RestController
@RequestMapping("/api/profile/applications")
@Tag(name = "applications-sync", description = "User-scoped application tracker: the authenticated user's applications.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class ApplicationSyncResource {

    private static final Logger LOG = LoggerFactory.getLogger(ApplicationSyncResource.class);

    private final ApplicationSyncService applicationSyncService;

    public ApplicationSyncResource(ApplicationSyncService applicationSyncService) {
        this.applicationSyncService = applicationSyncService;
    }

    /** {@code GET /api/profile/applications} : the current user's applications. */
    @Operation(summary = "List my applications", description = "All applications owned by the current user.")
    @GetMapping("")
    public List<ApplicationDTO> listApplications() {
        LOG.debug("REST request to list the current user's applications");
        return applicationSyncService.listApplications();
    }

    // No @Valid: the tracker fills server-owned fields (createdAt/updatedAt/user) and
    // the entry is upserted as a DRAFT, so the client doesn't send those timestamps.

    /**
     * {@code POST /api/profile/applications} : upsert an application for the current
     * user — creates it, or updates the existing entry for the same job (dedup on
     * {@code externalJobId}/{@code jobUrl}).
     */
    @Operation(summary = "Upsert an application", description = "Create or update (dedup on externalJobId/jobUrl) one of the current user's applications.")
    @PostMapping("")
    public ResponseEntity<ApplicationDTO> upsertApplication(@RequestBody ApplicationDTO applicationDTO) {
        LOG.debug("REST request to upsert an application for the current user");
        return ResponseEntity.ok(applicationSyncService.upsertApplication(applicationDTO));
    }

    /** {@code PUT /api/profile/applications/:id} : update one of the current user's applications. */
    @Operation(summary = "Update an application", description = "Partial update (status/confirm/edits) of one of the current user's applications; 404 if not owned.")
    @PutMapping("/{id}")
    public ResponseEntity<ApplicationDTO> updateApplication(@PathVariable("id") Long id, @RequestBody ApplicationDTO applicationDTO) {
        LOG.debug("REST request to update application {} for the current user", id);
        return ResponseEntity.ok(applicationSyncService.updateApplication(id, applicationDTO));
    }

    /** {@code DELETE /api/profile/applications/:id} : delete one of the current user's applications. */
    @Operation(summary = "Delete an application", description = "Delete one of the current user's applications (dismiss a draft); 404 if not owned.")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteApplication(@PathVariable("id") Long id) {
        LOG.debug("REST request to delete application {} for the current user", id);
        applicationSyncService.deleteApplication(id);
        return ResponseEntity.noContent().build();
    }
}
