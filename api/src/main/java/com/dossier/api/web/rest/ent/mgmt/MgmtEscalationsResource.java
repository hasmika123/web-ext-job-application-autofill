package com.dossier.api.web.rest.ent.mgmt;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.mkt.escalations.EscalationDTO;
import com.dossier.api.service.ent.mkt.escalations.EscalationService;
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
 * The Marketing Manager's Escalations page (docs/enterprise-v2/deferred/marketing-manager.md section 5). Permission {@code escalations.manage} at TEAM scope or
 * wider, resolved by the service: a caller without it, a member of another organization, a row outside the manager's team and an unknown id all get the same generic
 * 404. An action needs an {@code Idempotency-Key} (400 without) AFTER the permission wall, so an unauthorised caller never learns about the header. Escalations
 * record what needs a manager's attention; nothing here changes a consultant's application.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mgmt/escalations")
@Tag(name = "mgmt-escalations", description = "Marketing Manager: the escalations of the team, and what a manager does with them.")
public class MgmtEscalationsResource {

    private final EscalationService service;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;

    public MgmtEscalationsResource(EscalationService service, IdempotencyService idempotency, DemoGuard demoGuard) {
        this.service = service;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "The escalations of the team",
        description = "escalations.manage at TEAM scope or wider. Query: status (OPEN by default = open and acknowledged, most severe and oldest first; SNOOZED; RESOLVED = resolved and dismissed, newest first; ALL), " +
            "severity (LOW, MEDIUM, HIGH), kind (STALLED_OPPORTUNITY, OVERDUE_FOLLOWUP, UNANSWERED_QUESTION, OVERLOADED_MARKETER, MANUAL, APPROVAL_AGING), marketer (a marketer of the team), consultant, " +
            "q (title search, 2 to 80 characters), page (from 0), size (1 to 100, default 20). A page and X-Total-Count."
    )
    @GetMapping
    @OrgPermissionRequired
    public ResponseEntity<EscalationDTO.Page> list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "status", required = false) String status,
        @RequestParam(name = "severity", required = false) String severity,
        @RequestParam(name = "kind", required = false) String kind,
        @RequestParam(name = "marketer", required = false) Long marketer,
        @RequestParam(name = "consultant", required = false) Long consultant,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "page", defaultValue = "0") int page,
        @RequestParam(name = "size", defaultValue = "20") int size
    ) {
        EscalationDTO.Page result = service.list(me, new EscalationService.Filter(status, severity, kind, marketer, consultant, q), page, size);
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(summary = "The live escalations of the team by severity", description = "escalations.manage. Open (open and acknowledged) in total and by severity, and snoozed apart: the badge and the Home tile.")
    @GetMapping("/counts")
    @OrgPermissionRequired
    public EscalationDTO.Counts counts(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.counts(me);
    }

    @Operation(summary = "One escalation with its trail", description = "escalations.manage. Who raised it and when, the rule behind it, the assignee, and every step taken (the trail). A row outside the team: the generic 404.")
    @GetMapping("/{id}")
    @OrgPermissionRequired
    public EscalationDTO get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.get(me, id);
    }

    @Operation(summary = "Acknowledge an escalation", description = "escalations.manage. OPEN or SNOOZED to ACKNOWLEDGED (a second call changes nothing). 409 ESCALATION_NOT_OPEN on a closed one. Idempotency-Key required.")
    @PostMapping("/{id}/acknowledge")
    @OrgPermissionRequired
    public ResponseEntity<EscalationDTO> acknowledge(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        HttpServletRequest request
    ) {
        return act(me, key, request, null, () -> service.acknowledge(me, id));
    }

    @Operation(summary = "Assign an escalation", description = "escalations.manage. Body: memberId (a marketer of the team, or yourself). A person outside the team: the generic 404. 409 ESCALATION_NOT_OPEN on a closed one. Idempotency-Key required.")
    @PostMapping("/{id}/assign")
    @OrgPermissionRequired
    public ResponseEntity<EscalationDTO> assign(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody EscalationDTO.AssignRequest body,
        HttpServletRequest request
    ) {
        return act(me, key, request, body, () -> service.assign(me, id, body == null ? null : body.memberId()));
    }

    @Operation(summary = "Snooze an escalation", description = "escalations.manage. Body: until (a time in the future, within a year). It comes back as OPEN when the time passes. 409 ESCALATION_NOT_OPEN on a closed one. Idempotency-Key required.")
    @PostMapping("/{id}/snooze")
    @OrgPermissionRequired
    public ResponseEntity<EscalationDTO> snooze(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody EscalationDTO.SnoozeRequest body,
        HttpServletRequest request
    ) {
        return act(me, key, request, body, () -> service.snooze(me, id, body == null ? null : body.until()));
    }

    @Operation(summary = "Resolve an escalation", description = "escalations.manage. Body: resolution (required, 1 to 300 characters, scanned for sensitive data). 409 ESCALATION_NOT_OPEN on a closed one. Idempotency-Key required.")
    @PostMapping("/{id}/resolve")
    @OrgPermissionRequired
    public ResponseEntity<EscalationDTO> resolve(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody EscalationDTO.ResolveRequest body,
        HttpServletRequest request
    ) {
        return act(me, key, request, body, () -> service.resolve(me, id, body == null ? null : body.resolution()));
    }

    @Operation(summary = "Dismiss an escalation", description = "escalations.manage. Body: note (optional, 300 characters). 409 ESCALATION_NOT_OPEN on a closed one. Idempotency-Key required.")
    @PostMapping("/{id}/dismiss")
    @OrgPermissionRequired
    public ResponseEntity<EscalationDTO> dismiss(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody(required = false) EscalationDTO.NoteRequest body,
        HttpServletRequest request
    ) {
        return act(me, key, request, body, () -> service.dismiss(me, id, body == null ? null : body.note()));
    }

    @Operation(summary = "Reopen an escalation", description = "escalations.manage. A resolved, dismissed or snoozed escalation becomes OPEN again (the Undo of resolve and dismiss). 409 ESCALATION_ALREADY_OPEN when it is open, or when the same thing is open as another row. Idempotency-Key required.")
    @PostMapping("/{id}/reopen")
    @OrgPermissionRequired
    public ResponseEntity<EscalationDTO> reopen(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        HttpServletRequest request
    ) {
        return act(me, key, request, null, () -> service.reopen(me, id));
    }

    @Operation(summary = "Comment on an escalation", description = "escalations.manage. Body: note (required, 1 to 500 characters, scanned for sensitive data). Allowed on a closed escalation too. Idempotency-Key required.")
    @PostMapping("/{id}/comment")
    @OrgPermissionRequired
    public ResponseEntity<EscalationDTO> comment(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody EscalationDTO.NoteRequest body,
        HttpServletRequest request
    ) {
        return act(me, key, request, body, () -> service.comment(me, id, body == null ? null : body.note()));
    }

    private ResponseEntity<EscalationDTO> act(OrgMembership me, String key, HttpServletRequest request, Object body, Supplier<EscalationDTO> work) {
        demoGuard.assertNotDemo();
        service.gateWrite(me); // the permission wall first: an unauthorised caller never learns about the header
        IdempotencyService.Outcome<EscalationDTO> out = idempotency.execute(me, key, true, "POST", request.getRequestURI(), body, 200, EscalationDTO.class, work);
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }
}
