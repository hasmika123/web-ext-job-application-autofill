package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantPlacementDTO;
import com.dossier.api.service.ent.consultantws.ConsultantPlacementService;
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

/**
 * Consultant workspace My Placement: the caller's OWN current placement. 404 for anyone who is not a consultant of this organization and for a
 * checklist item that is not on their placement. No response carries a rate, an email address or a phone number.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/placements")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ConsultantPlacementResource {

    private final ConsultantPlacementService service;

    public ConsultantPlacementResource(ConsultantPlacementService service) {
        this.service = service;
    }

    @Operation(summary = "My Placement page", description = "The caller's most recent ACTIVE placement with its overview, onboarding checklist, milestones, upcoming meetings and activity; ended placements are listed; never any rate.")
    @GetMapping
    @OrgPermissionRequired
    public ConsultantPlacementDTO.Response page(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.page(me);
    }

    @Operation(summary = "Tick or untick a checklist item", description = "Body {completed: true|false}. Idempotent. 409 PLACEMENT_NOT_ACTIVE for an item of an ended placement.")
    @PutMapping("/checklist/{itemId}")
    @OrgPermissionRequired
    public ConsultantPlacementDTO.ChecklistItem checklist(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable long itemId,
        @RequestBody(required = false) ConsultantPlacementDTO.ChecklistRequest body
    ) {
        return service.setChecklist(me, itemId, body == null ? null : body.completed());
    }

    @Operation(summary = "Post a status note", description = "A note of 3 to 300 characters, scanned for sensitive data, stored as an UPDATE activity row on the caller's current ACTIVE placement.")
    @PostMapping("/status-note")
    @OrgPermissionRequired
    public ConsultantPlacementDTO.Activity statusNote(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody(required = false) ConsultantPlacementDTO.StatusNoteRequest body
    ) {
        return service.postStatusNote(me, body == null ? null : body.note());
    }
}
