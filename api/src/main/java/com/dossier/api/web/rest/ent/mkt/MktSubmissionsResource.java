package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.submissions.MktSubmissionsDto.*;
import com.dossier.api.service.ent.mkt.submissions.MktSubmissionsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Marketing workspace, Submissions page: `/api/orgs/{orgId}/mkt/submissions`. Every handler goes through {@code MktScope} in the service
 * (permission {@code submissions.record}, ASSIGNED scope): a caller without it, an organization outside the module, an unassigned consultant and
 * another tenant's ids are all the same generic 404. E1: a submission is a record of a prepared package; nothing here sends anything to a client
 * or submits for a consultant.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/submissions")
@Tag(name = "mkt-submissions", description = "Marketing workspace: submission records (profile packages prepared for a job) and their approval state.")
public class MktSubmissionsResource {

    private final MktSubmissionsService service;

    public MktSubmissionsResource(MktSubmissionsService service) {
        this.service = service;
    }

    @Operation(
        summary = "The Submissions board in one call",
        description = "submissions.record (ASSIGNED). {kpis{pendingApprovals,submittedToday,underClientReview,rejected}, items[], total, page (0-based), size (max 100), breakdown{period,total,buckets[]}, "
            + "activity[], filters{clients,jobTitles}, views[]}. Filters: q, status (DRAFT|AWAITING_APPROVAL|SUBMITTED|CLIENT_REVIEW|INTERVIEW_REQUESTED|REJECTED), approval, clientId, jobTitle, "
            + "period (7d|30d|90d|all, default 30d), donutPeriod, sort (consultant|jobTitle|client|date|approval|resume), dir (asc|desc)."
    )
    @GetMapping
    @OrgPermissionRequired
    public BoardResponse board(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String approval,
        @RequestParam(required = false) Long clientId,
        @RequestParam(required = false) String jobTitle,
        @RequestParam(required = false) String period,
        @RequestParam(required = false) String donutPeriod,
        @RequestParam(required = false) String sort,
        @RequestParam(required = false) String dir,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "10") int size
    ) {
        return service.board(me, new Query(q, status, approval, clientId, jobTitle, period, donutPeriod, sort, dir, page, size));
    }

    @Operation(summary = "The choices of the New Submission dialog", description = "submissions.record (ASSIGNED). {consultants[] (the ones you are assigned to), jobs[] (open)}.")
    @GetMapping("/options")
    @OrgPermissionRequired
    public Options options(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.options(me);
    }

    @Operation(summary = "One submission record with its history", description = "submissions.record (ASSIGNED). 404 for an unknown id or a consultant the caller is not assigned to.")
    @GetMapping("/{id}")
    @OrgPermissionRequired
    public Detail detail(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.detail(me, id);
    }

    @Operation(summary = "Prepare a package for a job (creates a DRAFT record)", description = "submissions.record. Body {consultantId, requirementId, resumeId?, note?}. Nothing is sent to anyone. 409 when the pair already has a live record.")
    @PostMapping
    @OrgPermissionRequired
    public ResponseEntity<Row> create(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody CreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(me, request));
    }

    @Operation(summary = "Ask the consultant/approver to approve a draft", description = "submissions.record. DRAFT to AWAITING_APPROVAL; 409 from any other state.")
    @PostMapping("/{id}/request-approval")
    @OrgPermissionRequired
    public Row requestApproval(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.requestApproval(me, id);
    }

    @Operation(summary = "Record the approver's decision", description = "submissions.record. Body {decision: APPROVED|REJECTED, note?}. A rejection also ends the record as REJECTED.")
    @PostMapping("/{id}/approval")
    @OrgPermissionRequired
    public Row recordApproval(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id, @RequestBody ApprovalRequest request) {
        return service.recordApproval(me, id, request);
    }

    @Operation(summary = "Record where the submission stands", description = "submissions.record. Body {status: SUBMITTED|CLIENT_REVIEW|INTERVIEW_REQUESTED|REJECTED, note?}: a fact reported by the consultant or the client; it submits nothing.")
    @PatchMapping("/{id}/status")
    @OrgPermissionRequired
    public Row recordStatus(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id, @RequestBody StatusRequest request) {
        return service.recordStatus(me, id, request);
    }

    @Operation(summary = "Withdraw a draft", description = "submissions.record. The record leaves the board; its history is kept. 409 unless it is still a draft.")
    @DeleteMapping("/{id}")
    @OrgPermissionRequired
    public ResponseEntity<Void> withdraw(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        service.withdraw(me, id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Save View: keep the current filters under a name (yours only)", description = "submissions.record. Same name replaces; at most 20 views.")
    @PostMapping("/views")
    @OrgPermissionRequired
    public ResponseEntity<SavedView> saveView(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody ViewRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.saveView(me, request));
    }

    @Operation(summary = "Delete one of your saved views", description = "submissions.record. 404 for a view that is not yours.")
    @DeleteMapping("/views/{viewId}")
    @OrgPermissionRequired
    public ResponseEntity<Void> deleteView(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long viewId) {
        service.deleteView(me, viewId);
        return ResponseEntity.noContent().build();
    }
}
