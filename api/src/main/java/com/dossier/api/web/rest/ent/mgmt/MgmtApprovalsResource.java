package com.dossier.api.web.rest.ent.mgmt;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.mkt.approvals.ApprovalRequestDTO;
import com.dossier.api.service.ent.mkt.approvals.ApprovalService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.function.Supplier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Marketing Manager's Approvals page (docs/enterprise-v2/deferred/marketing-manager.md section 5). Permission {@code approvals.decide} at TEAM scope or
 * wider, resolved by the service: a caller without it, a member of another organization, a request outside the manager's team and an unknown id all get the
 * same generic 404. A decision needs an {@code Idempotency-Key} (400 without) AFTER the permission wall, so an unauthorised caller never learns about the header.
 * A manager approves PREPARATION (an assignment, a duplicate override, the release of a resume to the consultant); nothing here submits an application.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mgmt/approvals")
@Tag(name = "mgmt-approvals", description = "Marketing Manager: the approval requests of the team, approve and reject.")
public class MgmtApprovalsResource {

    private final ApprovalService service;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;

    public MgmtApprovalsResource(ApprovalService service, IdempotencyService idempotency, DemoGuard demoGuard) {
        this.service = service;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "The approval requests of the team",
        description = "approvals.decide at TEAM scope or wider. Query: status (PENDING by default, oldest first; DECIDED, ALL, APPROVED, REJECTED, WITHDRAWN or EXPIRED, newest first), kind " +
            "(OPPORTUNITY_ASSIGN, DUPLICATE_OVERRIDE or RESUME_RELEASE), marketer (a marketer of the team), page (from 0), size (1 to 100, default 20). Metadata only: titles, names, the stated reason; never resume content or rates. A page and X-Total-Count."
    )
    @GetMapping
    @OrgPermissionRequired
    public ResponseEntity<ApprovalRequestDTO.Page> list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "status", required = false) String status,
        @RequestParam(name = "kind", required = false) String kind,
        @RequestParam(name = "marketer", required = false) Long marketer,
        @RequestParam(name = "page", defaultValue = "0") int page,
        @RequestParam(name = "size", defaultValue = "20") int size
    ) {
        ApprovalRequestDTO.Page result = service.list(me, new ApprovalService.Filter(status, kind, marketer), page, size);
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(summary = "One approval request", description = "approvals.decide. The request, its payload summary (ids and flags, never content), who asked, who decided and when. A request outside the team: the generic 404.")
    @GetMapping("/{id}")
    @OrgPermissionRequired
    public ApprovalRequestDTO get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.detail(me, id);
    }

    @Operation(
        summary = "Approve a request",
        description = "approvals.decide at a scope covering the marketer who asked. Body: note (optional, 300 characters). Carries out the held step under the manager's name in the same transaction " +
            "(an assignment goes through the same checks as before; a held resume goes to the consultant's own approval). 409 APPROVAL_NOT_PENDING when it was already decided or expired, " +
            "409 SELF_APPROVAL for your own request (unless you hold the key organization-wide), or the reason the step no longer works (the request then stays pending). One audit row. Idempotency-Key required."
    )
    @PostMapping("/{id}/approve")
    @OrgPermissionRequired
    public ResponseEntity<ApprovalRequestDTO> approve(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody(required = false) ApprovalRequestDTO.DecisionRequest body,
        HttpServletRequest request
    ) {
        return decide(me, key, request, body, () -> service.approve(me, id, body == null ? null : body.note()));
    }

    @Operation(
        summary = "Reject a request",
        description = "approvals.decide at a scope covering the marketer who asked. Body: note (required, 1 to 300 characters; the marketer is told). Nothing is carried out. " +
            "409 APPROVAL_NOT_PENDING when it was already decided or expired, 409 SELF_APPROVAL for your own request. One audit row. Idempotency-Key required."
    )
    @PostMapping("/{id}/reject")
    @OrgPermissionRequired
    public ResponseEntity<ApprovalRequestDTO> reject(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody(required = false) ApprovalRequestDTO.DecisionRequest body,
        HttpServletRequest request
    ) {
        return decide(me, key, request, body, () -> service.reject(me, id, body == null ? null : body.note()));
    }

    private ResponseEntity<ApprovalRequestDTO> decide(OrgMembership me, String key, HttpServletRequest request, Object body, Supplier<ApprovalRequestDTO> work) {
        demoGuard.assertNotDemo();
        service.gateDecide(me); // the permission wall first: an unauthorised caller never learns about the header
        IdempotencyService.Outcome<ApprovalRequestDTO> out = idempotency.execute(me, key, true, "POST", request.getRequestURI(), body, 200, ApprovalRequestDTO.class, work);
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }
}
