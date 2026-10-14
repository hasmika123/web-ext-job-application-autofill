package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.JobMatchesDTO;
import com.dossier.api.service.ent.consultantws.JobMatchesService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Consultant workspace Job Matches: the caller's OWN matched jobs. 404 for anyone who is not a consultant of this organization, and for a match that is not theirs. */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/matches")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class JobMatchesResource {

    private final JobMatchesService service;

    public JobMatchesResource(JobMatchesService service) {
        this.service = service;
    }

    @Operation(summary = "Job Matches page", description = "Tiles, the ranked matched jobs, the match-quality checklist and personalised alerts, all for the caller's own consultant record.")
    @GetMapping
    @OrgPermissionRequired
    public JobMatchesDTO.Response page(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.page(me);
    }

    @Operation(summary = "Match details and insights", description = "Skill alignment (present or missing, no proficiency levels), the match explanation and areas to improve for one of the caller's own matches.")
    @GetMapping("/{matchId}")
    @OrgPermissionRequired
    public JobMatchesDTO.Detail detail(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long matchId) {
        return service.detail(me, matchId);
    }

    @Operation(summary = "Record that the match was opened", description = "Idempotent; keeps the first view time. Drives the Viewed Matches tile.")
    @PostMapping("/{matchId}/view")
    @OrgPermissionRequired
    public JobMatchesDTO.ViewResponse view(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long matchId) {
        return service.recordView(me, matchId);
    }

    @Operation(summary = "Save the job (bookmark)")
    @PutMapping("/{matchId}/save")
    @OrgPermissionRequired
    public JobMatchesDTO.SavedResponse save(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long matchId) {
        return service.save(me, matchId);
    }

    @Operation(summary = "Remove the bookmark")
    @DeleteMapping("/{matchId}/save")
    @OrgPermissionRequired
    public JobMatchesDTO.SavedResponse unsave(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long matchId) {
        return service.unsave(me, matchId);
    }

    @Operation(
        summary = "Express interest",
        description = "Records that the consultant wants this job (optional note, scanned for sensitive data). Creates no application and submits nothing; the marketer reacts later. Idempotent."
    )
    @PostMapping("/{matchId}/interest")
    @OrgPermissionRequired
    public JobMatchesDTO.InterestResponse interest(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable long matchId,
        @RequestBody(required = false) JobMatchesDTO.InterestRequest body
    ) {
        return service.expressInterest(me, matchId, body == null ? null : body.note());
    }
}
