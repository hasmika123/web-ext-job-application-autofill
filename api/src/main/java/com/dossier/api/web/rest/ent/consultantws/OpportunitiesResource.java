package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.OpportunitiesDTO;
import com.dossier.api.service.ent.consultantws.OpportunitiesService;
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

/** Consultant workspace Assigned Opportunities: the caller's OWN assigned jobs. 404 for anyone who is not a consultant of this organization, and for a match that is not theirs. */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/opportunities")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class OpportunitiesResource {

    private final OpportunitiesService service;

    public OpportunitiesResource(OpportunitiesService service) {
        this.service = service;
    }

    @Operation(summary = "Assigned Opportunities page", description = "Tiles, one page of the caller's own assigned opportunities (sort due, priority or newest; page size capped at 50) and the facts behind the next steps.")
    @GetMapping
    @OrgPermissionRequired
    public OpportunitiesDTO.Response page(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String sort,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size
    ) {
        return service.page(me, sort, page, size);
    }

    @Operation(summary = "Opportunity details", description = "Description, skills, rate band, marketer, match score and reason, and the timeline of one of the caller's own assigned opportunities.")
    @GetMapping("/{matchId}")
    @OrgPermissionRequired
    public OpportunitiesDTO.Detail detail(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long matchId) {
        return service.detail(me, matchId);
    }

    @Operation(summary = "Express interest", description = "Moves the shared opportunity record to INTERESTED (the marketer's board reads it) and keeps the interest row Job Matches shows (optional note, scanned for sensitive data). Creates no application, submits nothing. Idempotent.")
    @PostMapping("/{matchId}/express-interest")
    @OrgPermissionRequired
    public OpportunitiesDTO.Outcome expressInterest(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable long matchId,
        @RequestBody(required = false) OpportunitiesDTO.InterestRequest body
    ) {
        return service.expressInterest(me, matchId, body == null ? null : body.note());
    }

    @Operation(summary = "Need more info", description = "Stores a question for the marketer on the shared opportunity record (3-300 characters, scanned): the state becomes NEEDS_INFO (shown AWAITING_RESPONSE) and the marketer's activity feed records it. Asking again replaces the question.")
    @PostMapping("/{matchId}/need-more-info")
    @OrgPermissionRequired
    public OpportunitiesDTO.Outcome needMoreInfo(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable long matchId,
        @RequestBody(required = false) OpportunitiesDTO.InfoRequest body
    ) {
        return service.needMoreInfo(me, matchId, body == null ? null : body.message());
    }

    @Operation(summary = "Decline the opportunity", description = "A reason is required (3-300 characters, scanned). Moves the shared opportunity record to DECLINED (the marketer's board reads Not Interested). Idempotent.")
    @PostMapping("/{matchId}/decline")
    @OrgPermissionRequired
    public OpportunitiesDTO.Outcome decline(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable long matchId,
        @RequestBody(required = false) OpportunitiesDTO.DeclineRequest body
    ) {
        return service.decline(me, matchId, body == null ? null : body.reason());
    }

    @Operation(summary = "Undo a decline", description = "Moves a DECLINED opportunity back to NEW and clears the reason. Idempotent.")
    @PostMapping("/{matchId}/reopen")
    @OrgPermissionRequired
    public OpportunitiesDTO.Outcome reopen(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long matchId) {
        return service.reopen(me, matchId);
    }

    @Operation(
        summary = "I applied",
        description = "The consultant records that THEY applied on the source site (state APPLIED; the marketer sees \"says they applied\"). Kiwiply never applies or submits for anyone: this stores a statement only. Idempotent."
    )
    @PostMapping("/{matchId}/applied")
    @OrgPermissionRequired
    public OpportunitiesDTO.Outcome iApplied(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long matchId) {
        return service.markApplied(me, matchId);
    }

    @Operation(summary = "Request a resume update", description = "Leaves a note for the marketer (optional, 3-300 characters, scanned). Changes no status.")
    @PostMapping("/{matchId}/request-resume-update")
    @OrgPermissionRequired
    public OpportunitiesDTO.Outcome requestResumeUpdate(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable long matchId,
        @RequestBody(required = false) OpportunitiesDTO.ResumeUpdateRequest body
    ) {
        return service.requestResumeUpdate(me, matchId, body == null ? null : body.note());
    }
}
