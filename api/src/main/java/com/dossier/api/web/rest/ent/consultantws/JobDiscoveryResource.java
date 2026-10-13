package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.JobDiscoveryDTO;
import com.dossier.api.service.ent.consultantws.JobDiscoveryService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Consultant workspace Job Discovery: search the OPEN jobs of the caller's own organization and keep the caller's own bookmarks and
 * searches. 404 for anyone who is not a consultant of this organization, and for a job or search that is not visible to them.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/job-discovery")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class JobDiscoveryResource {

    private final JobDiscoveryService service;

    public JobDiscoveryResource(JobDiscoveryService service) {
        this.service = service;
    }

    @Operation(summary = "Filter options, recommended filters, trending skills, saved and recent searches", description = "Everything the page's right rail and filter bar need, computed from the organization's OPEN jobs and the caller's own rows.")
    @GetMapping("/overview")
    @OrgPermissionRequired
    public JobDiscoveryDTO.Overview overview(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.overview(me);
    }

    @Operation(
        summary = "Search open jobs",
        description = "Runs in the database over OPEN jobs of the caller's organization. sort = match | newest | rate; size is capped at 50; minScore keeps only jobs scoring at least that (the Recommended tab). 'match' orders the newest 500 matching jobs by the caller's own score."
    )
    @GetMapping("/search")
    @OrgPermissionRequired
    public JobDiscoveryDTO.SearchResponse search(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String location,
        @RequestParam(required = false) String jobType,
        @RequestParam(required = false) String workMode,
        @RequestParam(required = false) String experience,
        @RequestParam(required = false) String industry,
        @RequestParam(required = false) String skill,
        @RequestParam(required = false) Long clientId,
        @RequestParam(required = false) Long minRateMinor,
        @RequestParam(required = false, defaultValue = "match") String sort,
        @RequestParam(required = false, defaultValue = "0") int page,
        @RequestParam(required = false, defaultValue = "10") int size,
        @RequestParam(required = false, defaultValue = "0") int minScore
    ) {
        return service.search(me, new JobDiscoveryDTO.Filters(q, location, jobType, workMode, experience, industry, skill, clientId, minRateMinor), sort, page, size, minScore);
    }

    @Operation(summary = "One job's detail", description = "Description, open positions and what Apply would do. Another organization's job is a 404.")
    @GetMapping("/jobs/{requirementId}")
    @OrgPermissionRequired
    public JobDiscoveryDTO.Detail detail(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long requirementId) {
        return service.detail(me, requirementId);
    }

    @Operation(summary = "Save the job (bookmark)", description = "Idempotent. Uses the shared cws_saved_job table.")
    @PostMapping("/saved/{requirementId}")
    @OrgPermissionRequired
    public JobDiscoveryDTO.SavedJobResult save(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long requirementId) {
        return service.saveJob(me, requirementId);
    }

    @Operation(summary = "Remove the bookmark", description = "Idempotent.")
    @DeleteMapping("/saved/{requirementId}")
    @OrgPermissionRequired
    public JobDiscoveryDTO.SavedJobResult unsave(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long requirementId) {
        return service.unsaveJob(me, requirementId);
    }

    @Operation(
        summary = "Apply (intent only)",
        description = "Kiwiply never submits. With a match or application on the role it adds one follow-up task for the consultant; otherwise it records nothing and says the marketer must assign or approve the role first."
    )
    @PostMapping("/jobs/{requirementId}/apply")
    @OrgPermissionRequired
    public JobDiscoveryDTO.ApplyResult apply(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long requirementId) {
        return service.applyIntent(me, requirementId);
    }

    @Operation(summary = "Save this search", description = "Name and filters are scanned for sensitive data (422 SENSITIVE_CONTENT). At most 10 saved searches; a duplicate name is a 409.")
    @PostMapping("/saved-searches")
    @OrgPermissionRequired
    public JobDiscoveryDTO.SavedSearch createSavedSearch(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody JobDiscoveryDTO.SaveSearchRequest body) {
        return service.createSavedSearch(me, body == null ? null : body.name(), body == null ? null : body.filters());
    }

    @Operation(summary = "Delete a saved search")
    @DeleteMapping("/saved-searches/{id}")
    @OrgPermissionRequired
    public ResponseEntity<Void> deleteSavedSearch(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long id) {
        service.deleteSavedSearch(me, id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Mark a saved search as viewed", description = "Restarts its 'new results' counter from now.")
    @PostMapping("/saved-searches/{id}/viewed")
    @OrgPermissionRequired
    public JobDiscoveryDTO.SavedSearch viewSavedSearch(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long id) {
        return service.viewSavedSearch(me, id);
    }

    @Operation(summary = "Remember a search that was run", description = "Keeps the latest 5, deduplicated; text is scanned for sensitive data.")
    @PostMapping("/recent-searches")
    @OrgPermissionRequired
    public JobDiscoveryDTO.RecentSearch recordRecent(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody JobDiscoveryDTO.Filters body) {
        return service.recordRecent(me, body);
    }
}
