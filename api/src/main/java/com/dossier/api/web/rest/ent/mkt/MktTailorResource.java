package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.tailor.MktTailorService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Marketer tailoring (docs/enterprise-v2/MKT-TAILOR-BUILD.md, gap D2): on an assigned job, AI tailors one of the consultant's resumes; the marketer keeps
 * or skips each change and saves it as a new resume that waits for the consultant's approval and is chosen for the job. Nothing is submitted (E1).
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/opportunities")
@Tag(name = "Marketing: tailoring")
public class MktTailorResource {

    private final MktTailorService service;

    public MktTailorResource(MktTailorService service) {
        this.service = service;
    }

    @Operation(
        summary = "Tailor a consultant's resume for this job with AI",
        description = "resumes.edit_for + opportunities.manage. Body {orgResumeId?} (default: the job's chosen resume, else the primary). Charges the CONSULTANT's AI budget; 402 FEATURE_NOT_LICENSED without ai.resume_tailoring on their licence; 409 NOT_ASSIGNED, CONSULTANT_HAS_NO_ACCOUNT, NO_RESUME. Answers the changes with the keyword score; status QUOTA_EXCEEDED / NO_JOB_DESCRIPTION / NOTHING_TO_CHANGE / DISABLED / ERROR when there is nothing to keep."
    )
    @PostMapping("/{id}/tailor")
    @OrgPermissionRequired
    public MktTailorService.Proposal propose(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id, @RequestBody(required = false) MktTailorService.ProposeRequest body) {
        return service.propose(me, id, body == null ? null : body.orgResumeId());
    }

    @Operation(
        summary = "Save the kept changes as a new resume for the consultant",
        description = "Body {keep: [refs], additions: [missing keywords that are true], label?}. Creates a new resume in the consultant's account that waits for their approval, and chooses it for this job. 409 RESUME_CHANGED when the source changed since; 400 when nothing is kept."
    )
    @PostMapping("/{id}/tailor/{proposalId}/save")
    @OrgPermissionRequired
    public MktTailorService.Applied save(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @PathVariable Long proposalId,
        @RequestBody MktTailorService.ApplyRequest body
    ) {
        return service.apply(me, id, proposalId, body);
    }
}
