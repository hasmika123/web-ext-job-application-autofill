package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantResumesDTO;
import com.dossier.api.service.ent.consultantws.ConsultantResumesService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The Consultant workspace My Resumes: the caller's OWN resumes, their activity, and a few writes on them. 404 for anyone who is not a consultant of this organization or does not own the resume. */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/resumes")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ConsultantResumesResource {

    private final ConsultantResumesService service;

    public ConsultantResumesResource(ConsultantResumesService service) {
        this.service = service;
    }

    @Operation(summary = "My resumes page", description = "Tiles, the caller's resumes, resume strength, suggested improvements and recent activity. opportunities.respond required; 404 for everyone else.")
    @GetMapping
    @OrgPermissionRequired
    public ConsultantResumesDTO.Response page(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.page(me);
    }

    @Operation(
        summary = "Create a resume in the builder",
        description = "Body: {templateId?, target?, label?, source?} exactly as the personal builder's create (source: profile, scratch, {kind:'upload', structured, bio?, fileName, keep?} or {kind:'copy', fromResumeId}). " +
            "The resume is the signed-in consultant's own, approved by definition, and appears in this page and the marketer's board at once. The organization license's resume cap applies first (402 RESUME_LIMIT); " +
            "a parsed upload carrying a never-collected value is 422 SENSITIVE_CONTENT. resumes.manage required; 404 for everyone who is not a consultant of this organization."
    )
    @PostMapping("/built")
    @ResponseStatus(HttpStatus.CREATED)
    @OrgPermissionRequired
    public ConsultantResumesDTO.BuiltResumeCreated createBuiltForMe(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody(required = false) ConsultantResumesDTO.BuiltResumeBody body
    ) {
        return service.createBuilt(me, body);
    }

    @Operation(
        summary = "What the new-resume chooser offers",
        description = "{profile: {itemCount, roles, schools, skills, headline}, resumes: [{id, resumeId, name, updatedAt}]}: the account's profile items, or the career profile in this organization when there are none; and the caller's approved resumes " +
            "(resumeId is null for a directory record with no builder document: copy it with source {kind:'directory', orgResumeId: id}). resumes.manage required; 404 for everyone else."
    )
    @GetMapping("/sources")
    @OrgPermissionRequired
    public ConsultantResumesDTO.Sources sources(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.sources(me);
    }

    @Operation(summary = "Resume preview", description = "The structured fields (headline, summary, skills, experience) one of the caller's own resumes is drawn, downloaded and printed from.")
    @GetMapping("/{resumeId}/preview")
    @OrgPermissionRequired
    public ConsultantResumesDTO.Preview preview(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long resumeId) {
        return service.preview(me, resumeId);
    }

    @Operation(summary = "Set the primary resume", description = "Makes this resume primary (the previous primary is cleared). resumes.manage required.")
    @PostMapping("/{resumeId}/primary")
    @OrgPermissionRequired
    public ConsultantResumesDTO.ResumeRow primary(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long resumeId) {
        return service.setPrimary(me, resumeId);
    }

    @Operation(summary = "Rename a resume or change its visibility", description = "Body: {name?, visibility?} with visibility INTERNAL, PUBLIC or PRIVATE. Names are scanned for never-collected personal data (422).")
    @PatchMapping("/{resumeId}")
    @OrgPermissionRequired
    public ConsultantResumesDTO.ResumeRow patch(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long resumeId,
        @RequestBody ConsultantResumesDTO.Patch body
    ) {
        return service.patch(me, resumeId, body);
    }

    @Operation(summary = "Record resume activity", description = "Body: {kind: VIEWED | DOWNLOADED | SHARED}. Feeds the Total Views, Downloads and Times Shared tiles.")
    @PostMapping("/{resumeId}/activity")
    @OrgPermissionRequired
    public ResponseEntity<Void> activity(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long resumeId,
        @RequestBody ConsultantResumesDTO.ActivityBody body
    ) {
        service.record(me, resumeId, body == null ? null : body.kind());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Approve a resume a marketer made for me", description = "Only while it waits for the consultant (a resume a marketer made or edited through the builder). Body {versionNo, contentHash}: the version the consultant reviewed (both from the row they were shown); 422 without them, 409 RESUME_CHANGED when the resume changed since. resumes.manage required; 409 NOT_PENDING for anything else.")
    @PostMapping("/{resumeId}/approve")
    @OrgPermissionRequired
    public ConsultantResumesDTO.ResumeRow approveMyResume(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long resumeId,
        @RequestBody(required = false) ConsultantResumesDTO.ResumeApproval body
    ) {
        return service.approve(me, resumeId, body);
    }

    @Operation(summary = "Send a resume a marketer made for me back", description = "Body: {note?, versionNo, contentHash} (note at most 200 characters; versionNo and contentHash are the version the consultant reviewed: 422 without them, 409 RESUME_CHANGED when the resume changed since). The marketer's board reads it as Needs update until they edit it again. resumes.manage required; 409 NOT_PENDING when it is not waiting for the consultant.")
    @PostMapping("/{resumeId}/request-changes")
    @OrgPermissionRequired
    public ConsultantResumesDTO.ResumeRow requestChangesMyResume(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long resumeId,
        @RequestBody(required = false) ConsultantResumesDTO.ResumeChangeRequest body
    ) {
        return service.requestChanges(me, resumeId, body);
    }

    @Operation(summary = "Duplicate a resume", description = "A private, non-primary copy at the next version number, pending the organization's review again.")
    @PostMapping("/{resumeId}/duplicate")
    @ResponseStatus(HttpStatus.CREATED)
    @OrgPermissionRequired
    public ConsultantResumesDTO.ResumeRow duplicate(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long resumeId) {
        return service.duplicate(me, resumeId);
    }
}
