package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.resumes.MktResumeBuilderDto;
import com.dossier.api.service.ent.mkt.resumes.MktResumeBuilderService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Marketing workspace, Resumes board: "New resume for a consultant". Every handler goes through the Marketing gate in the service (generic 404 for a
 * non-member, a flag that is off, a missing permission or a consultant the caller is not assigned to). The resume is created in act-for mode under the
 * consultant's account and waits for the consultant's approval; nothing here submits anything and no share link is ever created.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/resumes/consultants")
@Tag(name = "mkt-resumes", description = "Marketing workspace: consultant resumes (metadata), preview, edit, approval request, activity, and a new resume for an assigned consultant.")
public class MktResumeBuilderResource {

    private final MktResumeBuilderService service;

    public MktResumeBuilderResource(MktResumeBuilderService service) {
        this.service = service;
    }

    @Operation(summary = "Consultants I can start a resume for", description = "The caller's ASSIGNED consultants (everyone for an ORG-scope holder): {consultantId, name, title, hasAccount}. resumes.edit_for; 404 for everyone else.")
    @GetMapping
    @OrgPermissionRequired
    public List<MktResumeBuilderDto.NewResumeConsultant> consultantsToStartFor(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.candidates(me);
    }

    @Operation(summary = "What a new resume for this consultant can start from", description = "Counts from the consultant's saved profile and the consultant's resumes the copy source offers. 404 for a consultant outside the caller's scope, 409 CONSULTANT_HAS_NO_ACCOUNT.")
    @GetMapping("/{consultantId}/sources")
    @OrgPermissionRequired
    public MktResumeBuilderDto.NewResumeSources resumeSourcesFor(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId) {
        return service.sources(me, consultantId);
    }

    @Operation(
        summary = "Create a resume for a consultant (act-for)",
        description = "Body: {templateId?, target?, label?, source?} exactly as the personal builder's create (source: profile, scratch, {kind:'upload', structured, bio?, fileName, keep?} or {kind:'copy', fromResumeId}). " +
            "The resume is saved under the consultant's account with the marketer as author, starts PENDING and waits for the consultant. The consultant's resume cap applies first (402 RESUME_LIMIT); a parsed upload carrying a never-collected value is 422 SENSITIVE_CONTENT. " +
            "resumes.edit_for (ASSIGNED); 404 for a consultant outside the caller's scope."
    )
    @PostMapping("/{consultantId}/built")
    @ResponseStatus(HttpStatus.CREATED)
    @OrgPermissionRequired
    public MktResumeBuilderDto.NewResumeCreated createForConsultant(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long consultantId,
        @RequestBody(required = false) MktResumeBuilderDto.NewResumeBody body
    ) {
        return service.create(me, consultantId, body);
    }
}
