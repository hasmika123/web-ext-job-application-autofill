package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.mkt.approvals.ApprovalRequestDTO;
import com.dossier.api.service.ent.mkt.approvals.MktApprovalsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.function.Supplier;
import org.springframework.data.domain.PageRequest;
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
 * The marketer's side of the manager approvals: ask a Marketing Manager to release a step, see one's own requests, take one back. Permission
 * {@code opportunities.manage}, resolved by {@code MktScope}: a caller without it, a non-member, an organization outside the flags and a consultant or request that is not
 * the caller's all get the same generic 404. A marketer names what to approve, never how: the held step is built from stored rows. Nothing here submits an application.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/approvals")
@Tag(name = "mkt-approvals", description = "Marketing: ask a manager to approve a step, the requester's own requests, withdraw.")
public class MktApprovalsResource {

    private final MktApprovalsService service;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;

    public MktApprovalsResource(MktApprovalsService service, IdempotencyService idempotency, DemoGuard demoGuard) {
        this.service = service;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "Ask a manager to approve a step",
        description = "opportunities.manage for a consultant the caller may see. Body: kind (OPPORTUNITY_ASSIGN with subjectId = the suggested opportunity's id, or RESUME_RELEASE with subjectId = the resume), note (optional, 500 characters). " +
            "409 APPROVAL_PENDING (with the id of the open one) when it is already waiting, 409 NOT_SUGGESTED for an opportunity that is already assigned. A duplicate override is asked for by the duplicate warning itself (422). " +
            "The held step is built from the stored rows; a body can not name its arguments. One audit row. Idempotency-Key required."
    )
    @PostMapping
    @OrgPermissionRequired
    public ResponseEntity<ApprovalRequestDTO> open(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody ApprovalRequestDTO.OpenRequest body,
        HttpServletRequest request
    ) {
        return write(me, key, request, body, () -> service.open(me, body));
    }

    @Operation(
        summary = "The caller's own requests",
        description = "opportunities.manage. Query: status (PENDING by default, DECIDED, ALL or one status), page (from 0), size (1 to 100, default 20). Newest first. A page and X-Total-Count."
    )
    @GetMapping
    @OrgPermissionRequired
    public ResponseEntity<ApprovalRequestDTO.Page> mine(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "mine", required = false) Boolean mine,
        @RequestParam(name = "status", required = false) String status,
        @RequestParam(name = "page", defaultValue = "0") int page,
        @RequestParam(name = "size", defaultValue = "20") int size
    ) {
        if (page < 0 || size < 1 || size > 100) throw com.dossier.api.service.org.OrgException.invalid("size", "page from 0, size 1 to 100");
        ApprovalRequestDTO.Page result = service.mine(me, status, PageRequest.of(page, size));
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(summary = "Withdraw a request", description = "opportunities.manage; only the marketer who asked, only while it is pending (409 APPROVAL_NOT_PENDING otherwise). One audit row. Idempotency-Key required.")
    @PostMapping("/{id}/withdraw")
    @OrgPermissionRequired
    public ResponseEntity<ApprovalRequestDTO> withdraw(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        HttpServletRequest request
    ) {
        return write(me, key, request, null, () -> service.withdraw(me, id));
    }

    private ResponseEntity<ApprovalRequestDTO> write(OrgMembership me, String key, HttpServletRequest request, Object body, Supplier<ApprovalRequestDTO> work) {
        demoGuard.assertNotDemo();
        service.gate(me); // the permission wall first
        IdempotencyService.Outcome<ApprovalRequestDTO> out = idempotency.execute(me, key, true, "POST", request.getRequestURI(), body, 200, ApprovalRequestDTO.class, work);
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }
}
