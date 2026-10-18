package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.jobs.MktJobsDTO;
import com.dossier.api.service.ent.mkt.jobs.MktJobsService;
import com.dossier.api.service.ent.pipeline.DuplicateGuard;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Job Discovery of the Marketing workspace (`/w/marketing/jobs`): the board's one call, one job, the assignment picker, the assignment
 * itself and the caller's saved searches. Every endpoint goes through {@code MktScope} (generic 404, never 403). Assign only writes a
 * match record; nothing here submits an application for a consultant (E1).
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/jobs")
@Tag(name = "mkt-jobs", description = "Marketing workspace: Job Discovery.")
public class MktJobsResource {

    private final MktJobsService service;

    public MktJobsResource(MktJobsService service) {
        this.service = service;
    }

    @Operation(
        summary = "The Job Discovery board",
        description = "{kpis, items, total, page, size, canAssign, facets, trendingSkills, topClients, alerts, savedSearches, streams}. matches.run required. "
            + "Filters: q, skills (comma separated, any), location, workType (ON_SITE|HYBRID|REMOTE), visa, source, rateMin/rateMax (dollars per hour; a yearly rate is /2080), "
            + "sort (posted_desc|posted_asc|rate_desc|title_asc|client_asc), page (0-based), size (max 100). 404 for everyone without the permission."
    )
    @GetMapping
    @OrgPermissionRequired
    public MktJobsDTO.Response list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "8") int size,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) List<String> skills,
        @RequestParam(required = false) String location,
        @RequestParam(required = false) String workType,
        @RequestParam(required = false) String visa,
        @RequestParam(required = false) String source,
        @RequestParam(required = false) Integer rateMin,
        @RequestParam(required = false) Integer rateMax,
        @RequestParam(required = false) String sort
    ) {
        return service.list(me, new MktJobsDTO.Query(page, size, q, skills, location, workType, visa, source, rateMin, rateMax, sort));
    }

    @Operation(summary = "One job with its description and the best matches among the consultants the caller may see", description = "matches.run required; unknown id 404.")
    @GetMapping("/{jobId}")
    @OrgPermissionRequired
    public MktJobsDTO.Detail detail(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long jobId) {
        return service.detail(me, jobId);
    }

    @Operation(summary = "Consultants the caller may assign to this job, best match first", description = "opportunities.manage required; only consultants inside the caller's scope.")
    @GetMapping("/{jobId}/candidates")
    @OrgPermissionRequired
    public List<MktJobsDTO.Candidate> candidates(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long jobId,
        @RequestParam(required = false) String q
    ) {
        return service.candidates(me, jobId, q);
    }

    @Operation(
        summary = "Assign a consultant to a job (a record only)",
        description = "opportunities.manage required. Creates or updates the consultant's match row for the job in ASSIGNED. It never submits an application "
            + "or contacts a client (the consultant submits). Idempotent. 404 for a consultant outside the caller's scope; 409 JOB_NOT_OPEN."
    )
    @PostMapping("/{jobId}/assign")
    @OrgPermissionRequired
    public MktJobsDTO.AssignResult assign(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long jobId,
        @RequestBody MktJobsDTO.AssignRequest body
    ) {
        return service.assign(me, jobId, body == null ? null : body.consultantId(), body == null ? DuplicateGuard.Confirm.NONE : DuplicateGuard.Confirm.of(body.confirmDuplicate(), body.duplicateReason()));
    }

    @Operation(summary = "Save the current filters as one of the caller's saved searches", description = "matches.run required. {name, criteria}. 422 ORG_INVALID with the field; at most 50 per person.")
    @PostMapping("/saved-searches")
    @ResponseStatus(HttpStatus.CREATED)
    @OrgPermissionRequired
    public MktJobsDTO.SavedSearch createSavedSearch(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody MktJobsDTO.SavedSearchRequest body) {
        return service.createSavedSearch(me, body);
    }

    @Operation(summary = "Mark a saved search as looked at (its \"N new\" counts again from now)", description = "Only the owner's own search; anything else 404.")
    @PostMapping("/saved-searches/{searchId}/seen")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @OrgPermissionRequired
    public void seen(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long searchId) {
        service.markSeen(me, searchId);
    }

    @Operation(summary = "Delete one of the caller's saved searches", description = "Only the owner's own search; anything else 404.")
    @DeleteMapping("/saved-searches/{searchId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @OrgPermissionRequired
    public void deleteSavedSearch(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long searchId) {
        service.deleteSavedSearch(me, searchId);
    }
}
