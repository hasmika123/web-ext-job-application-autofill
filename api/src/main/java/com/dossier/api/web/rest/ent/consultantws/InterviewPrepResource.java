package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.InterviewPrepDTO;
import com.dossier.api.service.ent.consultantws.InterviewPrepService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Consultant workspace Interview Prep: the caller's OWN practice history and checklist. 404 for anyone who is not a consultant of this organization, and for a session that is not theirs. */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/interview-prep")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class InterviewPrepResource {

    private final InterviewPrepService service;

    public InterviewPrepResource(InterviewPrepService service) {
        this.service = service;
    }

    @Operation(summary = "Interview Prep page", description = "Tiles, the preparation modules (static default content), the practice history and the before-interview checklist, all for the caller's own consultant record.")
    @GetMapping
    @OrgPermissionRequired
    public InterviewPrepDTO.Response page(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.page(me);
    }

    @Operation(summary = "One practice session", description = "The stored self-notes and question-level self-scores of one of the caller's own sessions.")
    @GetMapping("/sessions/{sessionId}")
    @OrgPermissionRequired
    public InterviewPrepDTO.SessionDetail session(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long sessionId) {
        return service.session(me, sessionId);
    }

    @Operation(
        summary = "Record a self-scored practice session",
        description = "The consultant scores catalog questions 0-100 themselves; there is no AI scoring. Notes are scanned for sensitive data."
    )
    @PostMapping("/sessions")
    @OrgPermissionRequired
    public InterviewPrepDTO.SessionDetail create(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody(required = false) InterviewPrepDTO.SessionRequest body
    ) {
        return service.create(me, body);
    }

    @Operation(summary = "Tick or untick a checklist item", description = "Idempotent. An unknown item key is the generic 404.")
    @PutMapping("/checklist/{itemKey}")
    @OrgPermissionRequired
    public InterviewPrepDTO.CheckResponse check(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable String itemKey,
        @RequestBody(required = false) InterviewPrepDTO.CheckRequest body
    ) {
        return service.setCheck(me, itemKey, body == null ? null : body.checked());
    }
}
