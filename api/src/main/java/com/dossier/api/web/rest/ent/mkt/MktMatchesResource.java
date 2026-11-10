package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.matches.MktMatchesDto;
import com.dossier.api.service.ent.mkt.matches.MktMatchesService;
import com.dossier.api.service.ent.pipeline.DuplicateGuard;
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
 * Job Matches of the Marketing workspace. Permission {@code matches.run} (the service also checks {@code opportunities.manage} for Assign);
 * every call is limited to the consultants the caller may see, and anything else is the generic 404. E1: nothing here submits for a consultant.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/matches")
@Tag(name = "mkt-matches", description = "Marketing workspace: consultant-to-job matches with KPIs, filters, explanation and insights.")
public class MktMatchesResource {

    private final MktMatchesService service;

    public MktMatchesResource(MktMatchesService service) {
        this.service = service;
    }

    @Operation(
        summary = "The Job Matches board (one call)",
        description = "{kpis, filters, items, total, page, size, topToday, explanation}. Filters: consultantId, skill (primary skill), clientId, score (high|mid|low), q; sort: score|consultant|job|client|created, '-' = descending (default -score); page (0-based), size (max 100); selected = the match whose explanation to return."
    )
    @GetMapping
    @OrgPermissionRequired
    public MktMatchesDto.Response list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "10") int size,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) Long consultantId,
        @RequestParam(required = false) String skill,
        @RequestParam(required = false) Long clientId,
        @RequestParam(required = false) String score,
        @RequestParam(required = false) String sort,
        @RequestParam(required = false) Long selected
    ) {
        return service.list(me, new MktMatchesService.Query(page, size, q, consultantId, skill, clientId, score, sort, selected));
    }

    @Operation(summary = "Two matches side by side (Compare drawer)")
    @GetMapping("/compare")
    @OrgPermissionRequired
    public MktMatchesDto.Compare compare(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestParam Long a, @RequestParam Long b) {
        return service.compare(me, a, b);
    }

    @Operation(summary = "One match with its explanation and insights (Review drawer)")
    @GetMapping("/{id}")
    @OrgPermissionRequired
    public MktMatchesDto.Detail get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.detail(me, id);
    }

    @Operation(
        summary = "Assign: record that the marketer puts this match forward (SUGGESTED to ASSIGNED)",
        description = "Needs matches.run and opportunities.manage. Record only (E1): it never submits anything for the consultant. Idempotent for an assigned match; 409 for a dismissed match or a closed job. " +
            "Optional body {confirmDuplicate, duplicateReason}: 409 DUPLICATE_WARNING when the consultant already has the same posting or role (confirm with a reason to go ahead), " +
            "409 DUPLICATE_BLOCKED when the organization's policy is BLOCK, 409 ASSIGNMENT_CAP when the consultant holds the most open opportunities allowed."
    )
    @PostMapping("/{id}/assign")
    @OrgPermissionRequired
    public MktMatchesDto.Row assign(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestBody(required = false) MktMatchesDto.AssignRequest body
    ) {
        return service.assign(me, id, body == null ? DuplicateGuard.Confirm.NONE : DuplicateGuard.Confirm.of(body.confirmDuplicate(), body.duplicateReason()));
    }

    @Operation(summary = "Dismiss a suggested match (SUGGESTED to DISMISSED)")
    @PostMapping("/{id}/dismiss")
    @OrgPermissionRequired
    public MktMatchesDto.Row dismiss(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.dismiss(me, id);
    }
}
