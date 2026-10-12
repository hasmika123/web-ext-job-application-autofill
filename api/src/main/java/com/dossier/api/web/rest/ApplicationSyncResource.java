package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.ApplicationEventService;
import com.dossier.api.service.ApplicationListService;
import com.dossier.api.service.ApplicationNoteService;
import com.dossier.api.service.ApplicationPatchService;
import com.dossier.api.service.ApplicationSyncService;
import com.dossier.api.service.dto.ApplicationDTO;
import com.dossier.api.service.dto.TrackerDTOs.ActivityDay;
import com.dossier.api.service.dto.TrackerDTOs.ApplicationDetailDTO;
import com.dossier.api.service.dto.TrackerDTOs.ApplicationListPage;
import com.dossier.api.service.dto.TrackerDTOs.ApplicationPatchRequest;
import com.dossier.api.service.dto.TrackerDTOs.BulkRequest;
import com.dossier.api.service.dto.TrackerDTOs.BulkResult;
import com.dossier.api.service.dto.TrackerDTOs.NoteDTO;
import com.dossier.api.service.dto.TrackerDTOs.NoteRequest;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
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
 *
 * <p>The tracker (APP-E2E U6.2) adds a filtered, sorted, paged {@code GET} with per-tab counts, a detail
 * view (timeline, notes, interviews), {@code PATCH}, notes and bulk actions, and the dashboard's activity
 * feed. A {@code GET} that names none of the new parameters returns the old unpaged array, unchanged for
 * the extension. Another user's id is a 404 everywhere.
 */
@RestController
@RequestMapping("/api/profile/applications")
@Tag(name = "applications-sync", description = "User-scoped application tracker: the authenticated user's applications.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class ApplicationSyncResource {

    private static final Logger LOG = LoggerFactory.getLogger(ApplicationSyncResource.class);

    private final ApplicationSyncService applicationSyncService;
    private final ApplicationListService listService;
    private final ApplicationPatchService patchService;
    private final ApplicationNoteService noteService;
    private final ApplicationEventService eventService;

    public ApplicationSyncResource(
        ApplicationSyncService applicationSyncService,
        ApplicationListService listService,
        ApplicationPatchService patchService,
        ApplicationNoteService noteService,
        ApplicationEventService eventService
    ) {
        this.applicationSyncService = applicationSyncService;
        this.listService = listService;
        this.patchService = patchService;
        this.noteService = noteService;
        this.eventService = eventService;
    }

    /**
     * {@code GET /api/profile/applications} : the current user's applications - the old unpaged array, or,
     * when any of {@code page, size, sort, q, status, company, archived, ghosted} is present, one page.
     */
    @Operation(
        summary = "List my applications",
        description = "With none of the query parameters: every application owned by the current user as a plain array, newest update first (the extension's contract). " +
        "With any of page, size, sort, q, status (comma-separated), company, archived (true|false|all, default false) or ghosted: " +
        "a page {items, total, page, size, summary}; summary holds the per-tab counts ALL, DRAFT, SAVED, APPLIED, IN_REVIEW, INTERVIEW, OFFER, REJECTED, WITHDRAWN, GHOSTED, ARCHIVED " +
        "(they follow q and company, not the status/archived filters). size is clamped to the server's maximum; sort is field[,asc|desc] over " +
        "updatedAt, createdAt, appliedAt, lastEventAt, nextActionAt, company, roleTitle, status (400 SORT_INVALID otherwise).",
        responses = @ApiResponse(responseCode = "200", content = @Content(schema = @Schema(oneOf = { ApplicationListPage.class })))
    )
    @GetMapping("")
    public ResponseEntity<?> listApplications(
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size,
        @RequestParam(name = "sort", required = false) String sort,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "status", required = false) String status,
        @RequestParam(name = "company", required = false) String company,
        @RequestParam(name = "archived", required = false) String archived,
        @RequestParam(name = "ghosted", required = false) Boolean ghosted
    ) {
        LOG.debug("REST request to list the current user's applications");
        boolean v2 = page != null || size != null || sort != null || q != null || status != null || company != null || archived != null || ghosted != null;
        if (!v2) return ResponseEntity.ok(applicationSyncService.listApplications());
        return ResponseEntity.ok(listService.list(new ApplicationListService.Query(status, q, company, archived, ghosted, sort, page, size)));
    }

    /** {@code GET /api/profile/applications/activity} : events per day for the dashboard's activity bars. */
    @Operation(
        summary = "My tracker activity per day",
        description = "One row per day for the last N days (default and cap are settings), oldest first, quiet days as 0: [{day: yyyy-MM-dd, count}]. Days are named in tz (an IANA zone, default UTC)."
    )
    @GetMapping("/activity")
    public List<ActivityDay> activity(@RequestParam(name = "days", required = false) Integer days, @RequestParam(name = "tz", required = false) String tz) {
        return eventService.activity(days, tz);
    }

    /** {@code GET /api/profile/applications/:id} : one application with its timeline, notes and interviews. */
    @Operation(summary = "One application with its history", description = "The application plus events (newest first), notes, interviews, mailCount and inbox suggestions. 404 if not owned.")
    @GetMapping("/{id}")
    public ApplicationDetailDTO getApplication(@PathVariable("id") Long id) {
        LOG.debug("REST request to get application {} for the current user", id);
        return listService.detail(id);
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

    /** {@code PATCH /api/profile/applications/:id} : the user's own changes (status, next action, star, archive, resume, outcome). */
    @Operation(
        summary = "Change an application",
        description = "Only the fields sent change; null clears nextAction, nextActionAt, resumeId and outcome. Every real change writes a timeline event (source WEB). " +
        "outcome ACCEPTED sets acceptedAt, DECLINED clears it. 404 if not owned; 422 TRACKER_INVALID for a bad value, SENSITIVE_CONTENT for a never-collected value in nextAction.",
        requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(content = @Content(schema = @Schema(implementation = ApplicationPatchRequest.class)))
    )
    @PatchMapping("/{id}")
    public ApplicationDTO patchApplication(@PathVariable("id") Long id, @RequestBody ObjectNode body) {
        LOG.debug("REST request to patch application {} for the current user", id);
        return patchService.patch(id, body);
    }

    /** {@code DELETE /api/profile/applications/:id} : delete one of the current user's applications. */
    @Operation(summary = "Delete an application", description = "Delete one of the current user's applications (dismiss a draft); 404 if not owned.")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteApplication(@PathVariable("id") Long id) {
        LOG.debug("REST request to delete application {} for the current user", id);
        applicationSyncService.deleteApplication(id);
        return ResponseEntity.noContent().build();
    }

    /** {@code POST /api/profile/applications/bulk} : one action over several applications. */
    @Operation(
        summary = "Bulk action on applications",
        description = "action ARCHIVE | UNARCHIVE | STATUS (with status) | STAR | UNSTAR over at most the configured number of ids. Returns {done: [ids], failed: [{id, reason}]}; an id that is not yours is failed NOT_FOUND, not an error."
    )
    @PostMapping("/bulk")
    public BulkResult bulk(@RequestBody BulkRequest request) {
        LOG.debug("REST request for a bulk action on applications");
        return patchService.bulk(request);
    }

    /** {@code POST /api/profile/applications/:id/notes} : add a note. */
    @Operation(summary = "Add a note", description = "{body (required), pinned?}. 422 SENSITIVE_CONTENT for a never-collected value, TRACKER_INVALID / TRACKER_LIMIT for size and count caps; 404 if the application is not owned.",
        requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(content = @Content(schema = @Schema(implementation = NoteRequest.class))))
    @PostMapping("/{id}/notes")
    public ResponseEntity<NoteDTO> addNote(@PathVariable("id") Long id, @RequestBody ObjectNode body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(noteService.create(id, body));
    }

    /** {@code PUT /api/profile/applications/:id/notes/:nid} : edit or pin a note. */
    @Operation(summary = "Edit a note", description = "Partial: only the fields sent change (body, pinned). 404 if the application or note is not owned.",
        requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(content = @Content(schema = @Schema(implementation = NoteRequest.class))))
    @PutMapping("/{id}/notes/{nid}")
    public NoteDTO updateNote(@PathVariable("id") Long id, @PathVariable("nid") Long nid, @RequestBody ObjectNode body) {
        return noteService.update(id, nid, body);
    }

    /** {@code DELETE /api/profile/applications/:id/notes/:nid} : remove a note. */
    @Operation(summary = "Delete a note", description = "404 if the application or note is not owned.")
    @DeleteMapping("/{id}/notes/{nid}")
    public ResponseEntity<Void> deleteNote(@PathVariable("id") Long id, @PathVariable("nid") Long nid) {
        noteService.delete(id, nid);
        return ResponseEntity.noContent().build();
    }
}
