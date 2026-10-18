package com.dossier.api.web.rest.ent.mgmt;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.marketing.MarketingAssignmentsService;
import com.dossier.api.service.ent.mgmt.MgmtAssignmentsDTO;
import com.dossier.api.service.ent.mgmt.MgmtAssignmentsService;
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
 * The Marketing Manager's Consultant Assignments and Workload pages. There is no second writer: every change is the admin board's own
 * ({@code MarketingAssignmentsService}) behind the team wall ({@code TeamScope}). A caller without the keys, a member of another organization, a marketer outside the
 * team and an unknown id all get the same generic 404; a consultant carried outside the team is skipped NOT_FOUND. Every change needs an {@code Idempotency-Key}
 * AFTER the permission wall. A marketer prepares, requests and records: nothing here submits anything or acts as a consultant.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mgmt")
@Tag(name = "mgmt-assignments", description = "Marketing Manager: consultant assignments of the team, the team's workload and the rebalance.")
public class MgmtAssignmentsResource {

    private final MgmtAssignmentsService service;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;

    public MgmtAssignmentsResource(MgmtAssignmentsService service, IdempotencyService idempotency, DemoGuard demoGuard) {
        this.service = service;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "The consultants table of the team",
        description = "assignments.manage at TEAM scope or wider (and workload.view). The admin board's table narrowed to the consultants the team's marketers carry (unassigned consultants are listed so they can be assigned). " +
            "Query: marketerId (one marketer of the team), unassigned=true, q, status (ACTIVE, PAUSED), priority (HIGH, MEDIUM, LOW), clientId (needs clients.view), availability, noBackup, " +
            "sort=field,dir (name, priority, status, activeApps, lastActivity, assigned), page (from 0), size (1 to 100, default 10). A page and X-Total-Count."
    )
    @GetMapping("/assignments")
    @OrgPermissionRequired
    public ResponseEntity<MarketingAssignmentsDTO.Page> consultants(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "marketerId", required = false) Long marketerId,
        @RequestParam(name = "unassigned", required = false) Boolean unassigned,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "status", required = false) String status,
        @RequestParam(name = "priority", required = false) String priority,
        @RequestParam(name = "clientId", required = false) Long clientId,
        @RequestParam(name = "availability", required = false) String availability,
        @RequestParam(name = "noBackup", required = false) Boolean noBackup,
        @RequestParam(name = "sort", required = false) String sort,
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size
    ) {
        MarketingAssignmentsDTO.Page result = service.consultants(
            me, new MarketingAssignmentsService.ConsultantQuery(marketerId, unassigned, q, status, priority, clientId, availability, noBackup, sort, page, size)
        );
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(
        summary = "One consultant's assignment history",
        description = "assignments.manage at TEAM scope or wider. The admin board's history (newest first, append-only) for a consultant carried by a marketer of the team; a consultant outside the team or unknown: the generic 404."
    )
    @GetMapping("/assignments/consultants/{consultantId}/history")
    @OrgPermissionRequired
    public MarketingAssignmentsDTO.History history(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long consultantId
    ) {
        return service.history(me, consultantId);
    }

    @Operation(
        summary = "Assign or reassign consultants to a marketer of the team",
        description = "assignments.manage. The admin board's assign (capacity rule, 409 OVER_CAPACITY unless allowOverCapacity, history line, hand-over of open work, audit, previous for Undo) with the team wall: " +
            "a marketer or backup outside the team is the generic 404, a consultant carried outside the team is skipped NOT_FOUND. Idempotency-Key required."
    )
    @PostMapping("/assignments/assign")
    @OrgPermissionRequired
    public ResponseEntity<MarketingAssignmentsDTO.BulkResult> assign(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody MarketingAssignmentsDTO.AssignRequest body,
        HttpServletRequest request
    ) {
        return run(me, key, request, body, () -> service.assign(me, body));
    }

    @Operation(
        summary = "Set priority, status or backup on many assignments of the team",
        description = "assignments.manage. Body: consultantIds and exactly one of priority (HIGH, MEDIUM, LOW), status (ACTIVE, PAUSED), backupMemberId (a marketer of the team), clearBackup. Idempotency-Key required."
    )
    @PostMapping("/assignments/update")
    @OrgPermissionRequired
    public ResponseEntity<MarketingAssignmentsDTO.BulkResult> update(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody MarketingAssignmentsDTO.UpdateRequest body,
        HttpServletRequest request
    ) {
        return run(me, key, request, body, () -> service.update(me, body));
    }

    @Operation(summary = "Unassign consultants of the team", description = "assignments.manage. Body: consultantIds, reason. Per-consultant previous for Undo. Idempotency-Key required.")
    @PostMapping("/assignments/unassign")
    @OrgPermissionRequired
    public ResponseEntity<MarketingAssignmentsDTO.BulkResult> unassign(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody MarketingAssignmentsDTO.UnassignRequest body,
        HttpServletRequest request
    ) {
        return run(me, key, request, body, () -> service.unassign(me, body));
    }

    @Operation(
        summary = "Undo: put assignments of the team back as they were",
        description = "assignments.manage. Body: rows taken from an earlier answer's previous. No capacity check. A row outside the team is skipped NOT_FOUND. Idempotency-Key required."
    )
    @PostMapping("/assignments/restore")
    @OrgPermissionRequired
    public ResponseEntity<MarketingAssignmentsDTO.BulkResult> restore(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody MarketingAssignmentsDTO.RestoreRequest body,
        HttpServletRequest request
    ) {
        return run(me, key, request, body, () -> service.restore(me, body));
    }

    @Operation(
        summary = "The workload of the team",
        description = "workload.view at TEAM scope or wider. Per marketer of the team: capacity, assigned, percent, overloaded, high priority, paused, without a backup, open applications, backup-for, and eight weekly load points " +
            "(oldest first, the last is now) rebuilt from the assignment history; plus the footer figures and the end of each of the eight weeks."
    )
    @GetMapping("/workload")
    @OrgPermissionRequired
    public MgmtAssignmentsDTO.Workload workload(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.workload(me);
    }

    @Operation(
        summary = "Rebalance: move consultants between marketers of the team",
        description = "assignments.manage. Body: moves [{consultantId, toMarketerMemberId}] (1 to 200) and an optional reason (200 characters, kept in each consultant's history). Each target must be an active marketer of the team " +
            "(outside it: the generic 404; paused: 422 MARKETER_INVALID). 409 OVER_CAPACITY (with capacity, current, adding, projected) when the figures after all the moves put a target over capacity; there is no override. " +
            "Each moved consultant gets its history line and its hand-over of open work; one MARKETING_REASSIGN audit row each and one MARKETING_BULK for the whole call. " +
            "Per-consultant previous is what Undo sends to /assignments/restore. Idempotency-Key required."
    )
    @PostMapping("/workload/rebalance")
    @OrgPermissionRequired
    public ResponseEntity<MarketingAssignmentsDTO.BulkResult> rebalance(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody MarketingAssignmentsDTO.RebalanceRequest body,
        HttpServletRequest request
    ) {
        return run(me, key, request, body, () -> service.rebalance(me, body));
    }

    private ResponseEntity<MarketingAssignmentsDTO.BulkResult> run(
        OrgMembership me,
        String key,
        HttpServletRequest request,
        Object body,
        Supplier<MarketingAssignmentsDTO.BulkResult> work
    ) {
        demoGuard.assertNotDemo();
        service.gateWrite(me); // the permission wall first: an unauthorised caller never learns about the header
        service.validate(me, body); // then the shape of the body, outside any transaction
        IdempotencyService.Outcome<MarketingAssignmentsDTO.BulkResult> out = idempotency.execute(
            me, key, true, "POST", request.getRequestURI(), body, 200, MarketingAssignmentsDTO.BulkResult.class, work
        );
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }
}
