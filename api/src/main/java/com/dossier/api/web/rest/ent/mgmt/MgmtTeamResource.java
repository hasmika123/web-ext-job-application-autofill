package com.dossier.api.web.rest.ent.mgmt;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.mgmt.MgmtTeamService;
import com.dossier.api.service.ent.mgmt.TeamMemberDTO;
import com.dossier.api.service.ent.mgmt.TeamRowDTO;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Marketing Manager's Team page. Reads need {@code member.view_summary} at TEAM scope or wider, the edit {@code assignments.manage}; the team is
 * {@code TeamScope}'s. A caller without the key, a member of another organization, a marketer outside the team and an unknown id all get the same generic 404.
 * The edit is the admin board's own (same checks, same audit row) and needs an {@code Idempotency-Key} AFTER the permission wall.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mgmt/team")
@Tag(name = "mgmt-team", description = "Marketing Manager: the marketers of the team, one marketer in full, and the edits a manager may make.")
public class MgmtTeamResource {

    private final MgmtTeamService service;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;

    public MgmtTeamResource(MgmtTeamService service, IdempotencyService idempotency, DemoGuard demoGuard) {
        this.service = service;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "The marketers of the team",
        description = "member.view_summary at TEAM scope or wider. Query: q (name or title, 2 to 80 characters), status (ACTIVE, PAUSED or ALL), sort (name, load, approvals, escalations, activity; a leading minus reverses it), " +
            "page (from 0), size (1 to 100, default 20). Each marketer: capacity, assigned consultants, percent, overloaded, approvals and escalations waiting, last active. A page and X-Total-Count."
    )
    @GetMapping
    @OrgPermissionRequired
    public ResponseEntity<TeamRowDTO.Page> list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "status", required = false) String status,
        @RequestParam(name = "sort", required = false) String sort,
        @RequestParam(name = "page", defaultValue = "0") int page,
        @RequestParam(name = "size", defaultValue = "20") int size
    ) {
        TeamRowDTO.Page result = service.list(me, new TeamRowDTO.Filter(q, status, sort), page, size);
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(
        summary = "One marketer of the team",
        description = "member.view_summary. The row, the consultants they carry (as marketer or backup), eight weeks of what they got done (assigned, recorded as submitted, interviews) and their open approvals and escalations. A marketer outside the team: the generic 404."
    )
    @GetMapping("/{memberId}")
    @OrgPermissionRequired
    public TeamMemberDTO member(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long memberId) {
        return service.member(me, memberId);
    }

    @Operation(
        summary = "Change a marketer of the team",
        description = "assignments.manage at a scope covering the marketer. Body: any of capacity (1 up to the admin cap), status (ACTIVE or PAUSED), title. The same checks and the same MARKETER_UPDATE audit row as the admin board. Idempotency-Key required."
    )
    @PatchMapping("/{memberId}")
    @OrgPermissionRequired
    public ResponseEntity<MarketingAssignmentsDTO.Marketer> update(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long memberId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody MarketingAssignmentsDTO.UpdateMarketerRequest body,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        service.gateWrite(me); // the permission wall first: an unauthorised caller never learns about the header
        IdempotencyService.Outcome<MarketingAssignmentsDTO.Marketer> out = idempotency.execute(
            me, key, true, "PATCH", request.getRequestURI(), body, 200, MarketingAssignmentsDTO.Marketer.class, () -> service.update(me, memberId, body)
        );
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }
}
