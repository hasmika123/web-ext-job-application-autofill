package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesDTO;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesDTO.*;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesService;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesService.Query;
import com.dossier.api.service.ent.pipeline.DuplicateGuard;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
 * The Marketing workspace's Opportunities page. Permission {@code opportunities.manage}, resolved by {@code MktScope}: a caller without it,
 * a non-member and an organization outside the flags all get the same generic 404, and a consultant outside the caller's scope is a 404 too.
 * E1: every write here prepares or requests; none answers for the consultant, submits, or signs in as anyone.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/opportunities")
@Tag(name = "mkt-opportunities", description = "Marketing: opportunities (assigned and suggested matches), consultant interest requests and the activity feed.")
public class MktOpportunitiesResource {

    private final MktOpportunitiesService service;

    public MktOpportunitiesResource(MktOpportunitiesService service) {
        this.service = service;
    }

    @Operation(
        summary = "The Opportunities board (one call)",
        description = "{kpis, items, total, page, size, topMatches, responses, activity, filters}. Filters: q (consultant or job title), consultantId, clientId, "
            + "interest, minScore, days (0 = any time, default 30), stale, ready, sort (recent|score|consultant|client|next), dir (asc|desc), page, size (max 100), responseDays."
    )
    @GetMapping
    @OrgPermissionRequired
    public ListResponse list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) Long consultantId,
        @RequestParam(required = false) Long clientId,
        @RequestParam(required = false) String interest,
        @RequestParam(required = false) Integer minScore,
        @RequestParam(defaultValue = "30") int days,
        @RequestParam(defaultValue = "false") boolean stale,
        @RequestParam(defaultValue = "false") boolean ready,
        @RequestParam(defaultValue = "recent") String sort,
        @RequestParam(defaultValue = "desc") String dir,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "8") int size,
        @RequestParam(defaultValue = "30") int responseDays
    ) {
        return service.list(me, new Query(q, consultantId, clientId, interest, minScore, days, stale, ready, sort, !"asc".equalsIgnoreCase(dir), page, size, responseDays));
    }

    @Operation(summary = "The visible rows under the same filters as a CSV download (names and job facts only; audited)")
    @GetMapping("/export")
    @OrgPermissionRequired
    public ResponseEntity<byte[]> export(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) Long consultantId,
        @RequestParam(required = false) Long clientId,
        @RequestParam(required = false) String interest,
        @RequestParam(required = false) Integer minScore,
        @RequestParam(defaultValue = "30") int days,
        @RequestParam(defaultValue = "false") boolean stale,
        @RequestParam(defaultValue = "recent") String sort,
        @RequestParam(defaultValue = "desc") String dir
    ) {
        String csv = service.exportCsv(me, new Query(q, consultantId, clientId, interest, minScore, days, stale, false, sort, !"asc".equalsIgnoreCase(dir), 0, 100, 30));
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"opportunities.csv\"")
            .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
            .body(csv.getBytes(StandardCharsets.UTF_8));
    }

    @Operation(summary = "Consultants (in the caller's scope) and open jobs for the Add Opportunity dialog")
    @GetMapping("/options")
    @OrgPermissionRequired
    public Options options(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestParam(required = false) String q) {
        return service.options(me, q);
    }

    @Operation(summary = "One opportunity with the same consultant's other open opportunities (Compare) and its timeline")
    @GetMapping("/{id}")
    @OrgPermissionRequired
    public MktOpportunitiesDTO.Detail detail(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.detail(me, id);
    }

    @Operation(summary = "Add an opportunity: a SUGGESTED match for a consultant in scope and an open job. 409 OPPORTUNITY_EXISTS when it already exists.")
    @PostMapping
    @OrgPermissionRequired
    public ActionResult create(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody CreateRequest body) {
        return service.create(me, body == null ? null : body.consultantId(), body == null ? null : body.requirementId());
    }

    @Operation(summary = "Assign a suggested opportunity and ask the consultant for their interest (needs an approved resume: 409 RESUME_NOT_APPROVED). Never answers for the consultant. Optional body {confirmDuplicate, duplicateReason}: 409 DUPLICATE_WARNING when the consultant already has the same posting or role (confirm with a reason to go ahead), 409 DUPLICATE_BLOCKED when the organization's policy is BLOCK, 409 ASSIGNMENT_CAP when the consultant holds the most open opportunities allowed.")
    @PostMapping("/{id}/assign")
    @OrgPermissionRequired
    public ActionResult assign(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id, @RequestBody(required = false) AssignRequest body) {
        return service.assign(me, id, body == null ? DuplicateGuard.Confirm.NONE : DuplicateGuard.Confirm.of(body.confirmDuplicate(), body.duplicateReason()));
    }

    @Operation(summary = "Assign several ready opportunities (max 50); the ones that cannot be assigned come back in `skipped` with a code.")
    @PostMapping("/bulk-assign")
    @OrgPermissionRequired
    public BulkResult bulkAssign(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody BulkRequest body) {
        return service.bulkAssign(me, body == null ? null : body.ids());
    }

    @Operation(summary = "Ask every consultant who has not answered yet for their interest (not asked in the last 24 hours). A request only; the consultant answers on their own workspace.")
    @PostMapping("/notify")
    @OrgPermissionRequired
    public BulkResult notifyAwaiting(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.notifyAwaiting(me);
    }

    @Operation(summary = "Follow up: ask the consultant for their interest (kind INTEREST) or for an updated resume (kind RESUME).")
    @PostMapping("/{id}/request")
    @OrgPermissionRequired
    public ActionResult request(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id, @RequestBody RequestKind body) {
        return service.requestFromConsultant(me, id, body == null ? null : body.kind());
    }

    @Operation(summary = "Answer the consultant's question (state stays NEEDS_INFO; the consultant moves on). 409 NO_OPEN_INFO_REQUEST when nothing is waiting; 422 SENSITIVE_CONTENT. Never changes the consultant's state.")
    @PostMapping("/{id}/answer-info")
    @OrgPermissionRequired
    public ActionResult answerInfo(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id, @RequestBody AnswerInfoRequest body) {
        return service.answerInfo(me, id, body == null ? null : body.answer());
    }

    @Operation(summary = "Withdraw an assignment (state CLOSED, reason WITHDRAWN). Body {reason} is required (1 to 200 characters, PII-scanned); the consultant is notified. 409 NOT_ASSIGNED / ILLEGAL_TRANSITION.")
    @PostMapping("/{id}/withdraw")
    @OrgPermissionRequired
    public ActionResult withdraw(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id, @RequestBody WithdrawRequest body) {
        return service.withdraw(me, id, body == null ? null : body.reason());
    }

    @Operation(summary = "Offer a declined or withdrawn opportunity to another consultant of the caller's scope. Body {consultantId}. Answers the new row. 409 NOT_REASSIGNABLE / JOB_NOT_OPEN / RESUME_NOT_APPROVED.")
    @PostMapping("/{id}/reassign")
    @OrgPermissionRequired
    public ActionResult reassign(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id, @RequestBody ReassignRequest body) {
        return service.reassign(me, id, body == null ? null : body.consultantId(), body == null ? DuplicateGuard.Confirm.NONE : DuplicateGuard.Confirm.of(body.confirmDuplicate(), body.duplicateReason()));
    }

    @Operation(summary = "Record that the marketer reviewed the opportunity.")
    @PostMapping("/{id}/review")
    @OrgPermissionRequired
    public ActionResult review(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.review(me, id);
    }

    @Operation(summary = "Move or clear the next action date.")
    @PatchMapping("/{id}/next-action")
    @OrgPermissionRequired
    public ActionResult nextAction(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id, @RequestBody NextActionRequest body) {
        return service.setNextAction(me, id, body == null ? null : body.nextActionAt());
    }
}
