package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantSubmissionsDTO;
import com.dossier.api.service.ent.consultantws.ConsultantSubmissionsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Consultant workspace Submissions and Approvals: the caller's OWN submissions. 404 for anyone who is not a consultant of this organization
 * and for a submission that is not theirs. Approving and declining only record the consultant's decision; nothing is sent to a client.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/submissions")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ConsultantSubmissionsResource {

    private final ConsultantSubmissionsService service;

    public ConsultantSubmissionsResource(ConsultantSubmissionsService service) {
        this.service = service;
    }

    @Operation(summary = "Submissions and Approvals page", description = "Tiles, the submissions awaiting the caller's approval, and the first page of past submissions (status filter and paging optional).")
    @GetMapping
    @OrgPermissionRequired
    public ConsultantSubmissionsDTO.Response page(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size
    ) {
        return service.page(me, status, page, size);
    }

    @Operation(summary = "Past submissions", description = "One page of the caller's past submissions, newest first, optionally for one status.")
    @GetMapping("/past")
    @OrgPermissionRequired
    public ConsultantSubmissionsDTO.PastPage past(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size
    ) {
        return service.past(me, status, page, size);
    }

    @Operation(summary = "One submission", description = "The job, the resume summary, the marketer note and the outcome of one of the caller's own submissions.")
    @GetMapping("/{id}")
    @OrgPermissionRequired
    public ConsultantSubmissionsDTO.Detail detail(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long id) {
        return service.detail(me, id);
    }

    @Operation(
        summary = "Approve a submission",
        description = "Needs submissions.authorize. Records the consultant's attestation only: nothing is sent to the client by Kiwiply. 409 SUBMISSION_NOT_PENDING when it was already decided."
    )
    @PostMapping("/{id}/approve")
    @OrgPermissionRequired
    public ConsultantSubmissionsDTO.Decision approve(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long id) {
        return service.approve(me, id);
    }

    @Operation(
        summary = "Decline a submission",
        description = "Needs submissions.authorize. A reason of 3 to 300 characters is required and scanned for sensitive data. 409 SUBMISSION_NOT_PENDING when it was already decided."
    )
    @PostMapping("/{id}/decline")
    @OrgPermissionRequired
    public ConsultantSubmissionsDTO.Decision decline(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable long id,
        @RequestBody(required = false) ConsultantSubmissionsDTO.DeclineRequest body
    ) {
        return service.decline(me, id, body == null ? null : body.reason());
    }
}
