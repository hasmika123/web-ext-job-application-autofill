package com.dossier.api.web.rest.ent;

import com.dossier.api.service.ent.submissions.OrgSubmissionQueryService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Accounts workspace Submissions page: the organization's submissions as read-only RECORDS. There is no write route on purpose (the consultant submits;
 * the marketer records the fact on the Marketing workspace; Kiwiply never submits). Needs {@code submissions.record}; a caller without it and a foreign
 * tenant get the same generic 404.
 */
@RestController("entOrgSubmissionResource")
@RequestMapping("/api/orgs/{orgId}/submissions")
@Tag(name = "submissions", description = "Submissions as records for the Accounts workspace: who, which requirement and client, status. Read only.")
public class OrgSubmissionResource {

    private final OrgSubmissionQueryService query;

    public OrgSubmissionResource(OrgSubmissionQueryService query) {
        this.query = query;
    }

    @Operation(summary = "List the organization's submissions", description = "Paged, newest first. Query: status (DRAFT, SUBMITTED, CLIENT_REVIEW, INTERVIEW_REQUESTED, REJECTED), q (2 to 80 characters: consultant, client, requirement or code), clientId, page (from 0), size (1 to 100, default 10). Withdrawn drafts are left out.")
    @GetMapping
    @OrgPermissionRequired
    public ResponseEntity<OrgSubmissionQueryService.Page> list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "status", required = false) String status,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "clientId", required = false) Long clientId,
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size
    ) {
        OrgSubmissionQueryService.Page result = query.list(me, status, q, clientId, page, size);
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(summary = "Counts for the tiles and the status filter", description = "The total, the count per recorded status and how many wait on the consultant's approval.")
    @GetMapping("/counts")
    @OrgPermissionRequired
    public OrgSubmissionQueryService.Counts counts(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return query.counts(me);
    }
}
