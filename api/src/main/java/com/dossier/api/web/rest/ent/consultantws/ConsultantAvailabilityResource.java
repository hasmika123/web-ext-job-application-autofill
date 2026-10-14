package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantAvailabilityDTO;
import com.dossier.api.service.ent.consultantws.ConsultantAvailabilityService;
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

/**
 * Consultant workspace Availability: the caller's OWN availability, calendar entries, work preferences and history. 404 for anyone who is
 * not a consultant of this organization and for an entry that is not theirs. Every write answers with the fresh page. Nothing is sent to a marketer.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/availability")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ConsultantAvailabilityResource {

    private final ConsultantAvailabilityService service;

    public ConsultantAvailabilityResource(ConsultantAvailabilityService service) {
        this.service = service;
    }

    @Operation(summary = "Availability page", description = "Tiles, the availability, work preferences (read from the Profile tables where they live), every calendar entry and the history.")
    @GetMapping
    @OrgPermissionRequired
    public ConsultantAvailabilityDTO.Response page(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.page(me);
    }

    @Operation(summary = "Update availability", description = "Sets the status and the available-from date (also written to the profile the way the Profile page does) and appends a history row. Unchanged values add no row.")
    @PutMapping("/status")
    @OrgPermissionRequired
    public ConsultantAvailabilityDTO.Response status(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody(required = false) ConsultantAvailabilityDTO.StatusRequest body
    ) {
        return service.setAvailability(me, body);
    }

    @Operation(summary = "Add a calendar entry", description = "VACATION | PERSONAL | HOLIDAY | AVAILABLE with a start and end date and an optional reason (PII-scanned). A vacation starts PENDING (the marketer's approval is not built yet); the other kinds are APPROVED. 409 BLOCK_OVERLAP when it covers a day of another entry.")
    @PostMapping("/blocks")
    @OrgPermissionRequired
    public ConsultantAvailabilityDTO.Response addBlock(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody(required = false) ConsultantAvailabilityDTO.BlockRequest body
    ) {
        return service.addBlock(me, body);
    }

    @Operation(summary = "Edit a calendar entry", description = "Own entries only. Changing the kind or the dates puts the entry through the approval rule again.")
    @PutMapping("/blocks/{id}")
    @OrgPermissionRequired
    public ConsultantAvailabilityDTO.Response updateBlock(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable long id,
        @RequestBody(required = false) ConsultantAvailabilityDTO.BlockRequest body
    ) {
        return service.updateBlock(me, id, body);
    }

    @Operation(summary = "Delete a calendar entry", description = "Own entries only.")
    @DeleteMapping("/blocks/{id}")
    @OrgPermissionRequired
    public ConsultantAvailabilityDTO.Response deleteBlock(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long id) {
        return service.deleteBlock(me, id);
    }

    @Operation(summary = "Work preferences", description = "Replaces work mode, notice period, hourly rate range (record only, minor units), rate note (PII-scanned) and travel willingness. Locations, employment types and work authorization are edited on the Profile page.")
    @PutMapping("/preferences")
    @OrgPermissionRequired
    public ConsultantAvailabilityDTO.Response preferences(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody(required = false) ConsultantAvailabilityDTO.PreferenceRequest body
    ) {
        return service.setPreferences(me, body);
    }
}
