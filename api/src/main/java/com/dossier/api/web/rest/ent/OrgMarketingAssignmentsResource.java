package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.marketing.MarketingAssignmentsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.function.Supplier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Marketing Assignments board (design/enterprise-talent/marketing-assignments.png). The permission checks live in the service (roles-as-data keys
 * {@code workload.view} / {@code assignments.manage} at their scopes); a caller without them, a member of another organization and an id outside the
 * caller's scope all get the same generic 404. Every change needs an {@code Idempotency-Key} (400 without) AFTER the permission wall, so an unauthorised
 * caller never learns about the header. A marketer prepares, requests and records: nothing here submits anything or acts as a consultant.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/marketing-assignments")
@Tag(name = "marketing-assignments", description = "Marketing Assignments: marketers with workload, their consultants, KPI tiles, assign / reassign / unassign with undo.")
public class OrgMarketingAssignmentsResource {

    private final MarketingAssignmentsService service;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;

    public OrgMarketingAssignmentsResource(MarketingAssignmentsService service, IdempotencyService idempotency, DemoGuard demoGuard) {
        this.service = service;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "Marketing specialists with their workload",
        description = "workload.view or assignments.manage. Query: q (name or title, 2 to 80 characters), status (ACTIVE, PAUSED or ALL). Each marketer: capacity, assigned, percent, " +
            "overloaded (assigned >= 90 percent of capacity). The summary is the left panel's footer. Only the marketers inside the caller's scope are listed."
    )
    @GetMapping("/marketers")
    @OrgPermissionRequired
    public MarketingAssignmentsDTO.MarketerList marketers(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "status", required = false) String status
    ) {
        return service.marketers(me, q, status);
    }

    @Operation(
        summary = "Members who may be added as marketers",
        description = "assignments.manage at ORG scope. Active members holding a marketing role who have no capacity yet."
    )
    @GetMapping("/marketers/candidates")
    @OrgPermissionRequired
    public MarketingAssignmentsDTO.MarketerCandidates candidates(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.candidates(me);
    }

    @Operation(
        summary = "Add a marketer",
        description = "assignments.manage at ORG scope. Body: memberId (an active member with a marketing role; no account is created), capacity (1 to 200, default 20), title. " +
            "422 MARKETER_INVALID, 409 ALREADY_MARKETER. One MARKETER_ADD audit row."
    )
    @PostMapping("/marketers")
    @OrgPermissionRequired
    public ResponseEntity<MarketingAssignmentsDTO.Marketer> addMarketer(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody MarketingAssignmentsDTO.AddMarketerRequest body
    ) {
        demoGuard.assertNotDemo();
        return ResponseEntity.status(201).body(service.addMarketer(me, body));
    }

    @Operation(
        summary = "Change a marketer's capacity, status or title",
        description = "assignments.manage at a scope covering the marketer. Body: any of capacity (1 to 200), status (ACTIVE or PAUSED), title. One MARKETER_UPDATE audit row when something changed."
    )
    @PatchMapping("/marketers/{memberId}")
    @OrgPermissionRequired
    public MarketingAssignmentsDTO.Marketer updateMarketer(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long memberId,
        @RequestBody MarketingAssignmentsDTO.UpdateMarketerRequest body
    ) {
        demoGuard.assertNotDemo();
        return service.updateMarketer(me, memberId, body);
    }

    @Operation(
        summary = "The consultants table",
        description = "workload.view or assignments.manage. Query: marketerId (one marketer's consultants), unassigned=true (consultants nobody carries), q (name, job title, email, skill, and client name with clients.view), " +
            "status (ACTIVE, PAUSED), priority (HIGH, MEDIUM, LOW), clientId (needs clients.view), availability, noBackup, sort=field,dir (name, priority, status, activeApps, lastActivity, assigned), page (from 0), size (1 to 100, default 10). " +
            "A PageDTO and X-Total-Count."
    )
    @GetMapping("/consultants")
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

    @Operation(summary = "Filter options of the table", description = "Statuses, priorities, availabilities, and the clients when the caller holds clients.view.")
    @GetMapping("/filters")
    @OrgPermissionRequired
    public MarketingAssignmentsDTO.Filters filters(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.filters(me);
    }

    @Operation(
        summary = "The four KPI tiles",
        description = "Assigned consultants, active marketers, unassigned consultants, overloaded marketers: each with the figure 30 days ago, the delta, and an 8-week series, all rebuilt from the rows' own timestamps (see the note in the answer)."
    )
    @GetMapping("/kpis")
    @OrgPermissionRequired
    public MarketingAssignmentsDTO.Kpis kpis(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.kpis(me);
    }

    @Operation(summary = "Workload report", description = "Per marketer: capacity, assigned, percent, high-priority, paused, without a backup, open applications, backup-for; plus the summary.")
    @GetMapping("/workload")
    @OrgPermissionRequired
    public MarketingAssignmentsDTO.WorkloadReport workload(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.workload(me);
    }

    @Operation(
        summary = "Assign or reassign consultants to a marketer",
        description = "assignments.manage at a scope covering the marketer (and the current marketer of any consultant that moves). Body: consultantIds (1 to 200), marketerMemberId, backupMemberId, priority, status, allowOverCapacity. " +
            "409 OVER_CAPACITY (with capacity, current, adding, projected) unless allowOverCapacity is true; an override is audited at MEDIUM. Per-consultant result with previous (what Undo sends to /restore); " +
            "a consultant that cannot be reached is skipped NOT_FOUND. One audit row per changed consultant plus one MARKETING_BULK. Idempotency-Key required."
    )
    @PostMapping("/assign")
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
        summary = "Set priority, status or backup on many assignments",
        description = "assignments.manage at a scope covering each consultant's marketer. Body: consultantIds and exactly one of priority (HIGH, MEDIUM, LOW), status (ACTIVE, PAUSED), backupMemberId, clearBackup. Idempotency-Key required."
    )
    @PostMapping("/update")
    @OrgPermissionRequired
    public ResponseEntity<MarketingAssignmentsDTO.BulkResult> update(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody MarketingAssignmentsDTO.UpdateRequest body,
        HttpServletRequest request
    ) {
        return run(me, key, request, body, () -> service.update(me, body));
    }

    @Operation(summary = "Unassign consultants", description = "assignments.manage at a scope covering each consultant's marketer. Body: consultantIds. Per-consultant previous for Undo. Idempotency-Key required.")
    @PostMapping("/unassign")
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
        summary = "Undo: put assignments back as they were",
        description = "Body: rows [{consultantId, marketerMemberId (null = there was none), backupMemberId, priority, status}] taken from an earlier answer's previous. No capacity check. Idempotency-Key required."
    )
    @PostMapping("/restore")
    @OrgPermissionRequired
    public ResponseEntity<MarketingAssignmentsDTO.BulkResult> restore(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody MarketingAssignmentsDTO.RestoreRequest body,
        HttpServletRequest request
    ) {
        return run(me, key, request, body, () -> service.restore(me, body));
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
        service.validate(me.orgId(), body); // then the shape of the body, outside any transaction
        IdempotencyService.Outcome<MarketingAssignmentsDTO.BulkResult> out = idempotency.execute(
            me, key, true, "POST", request.getRequestURI(), body, 200, MarketingAssignmentsDTO.BulkResult.class, work
        );
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }
}
