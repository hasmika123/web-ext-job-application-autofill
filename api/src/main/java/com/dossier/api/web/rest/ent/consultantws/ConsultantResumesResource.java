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

    @Operation(summary = "Duplicate a resume", description = "A private, non-primary copy at the next version number, pending the organization's review again.")
    @PostMapping("/{resumeId}/duplicate")
    @ResponseStatus(HttpStatus.CREATED)
    @OrgPermissionRequired
    public ConsultantResumesDTO.ResumeRow duplicate(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long resumeId) {
        return service.duplicate(me, resumeId);
    }
}
