package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ActivityTimelineDTO;
import com.dossier.api.service.ent.consultantws.ActivityTimelineService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Consultant workspace Activity Timeline: a read-only, derived, merged feed of the caller's OWN events (no table of its own). 404 for anyone who
 * is not a consultant of this organization. No writes.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/activity-timeline")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ActivityTimelineResource {

    private final ActivityTimelineService service;

    public ActivityTimelineResource(ActivityTimelineService service) {
        this.service = service;
    }

    @Operation(
        summary = "Activity timeline",
        description = "Tiles, one cursor page (size 1 to 50, newest first) of the caller's own merged events for the chosen group and period (7, 30 or 90 days), and the milestone checklist."
    )
    @GetMapping
    @OrgPermissionRequired
    public ActivityTimelineDTO.Response timeline(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String type,
        @RequestParam(required = false) Integer days,
        @RequestParam(required = false) String cursor,
        @RequestParam(required = false) Integer size
    ) {
        return service.timeline(me, type, days, cursor, size);
    }
}
