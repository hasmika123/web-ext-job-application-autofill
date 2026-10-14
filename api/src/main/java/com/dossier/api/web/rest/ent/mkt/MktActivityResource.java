package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.activity.MktActivityDto.ActionResult;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.CreateRequest;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Query;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.StatusRequest;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.View;
import com.dossier.api.service.ent.mkt.activity.MktActivityService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Marketing workspace Activities page (`/w/marketing/activity`). Read needs {@code pipeline.view} (ASSIGNED scope: only the marketer's own consultants, anyone
 * else the generic 404); "Log Activity" and a status change need {@code followups.manage}. Writes only RECORD (E1): nothing here submits for a consultant,
 * mails anyone or signs in as anyone.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/activity")
@Tag(name = "mkt-activity", description = "Marketing workspace: the unified activity feed, its KPIs, summary and upcoming items (record-only manual entries).")
public class MktActivityResource {

    private final MktActivityService service;

    public MktActivityResource(MktActivityService service) {
        this.service = service;
    }

    @Operation(
        summary = "The Activities board (one call)",
        description = "{generatedAt, from, to, canLog, kpis[total,resume,submission,followup,interview], activities:{items,total,page,size}, summary, upcoming, upcomingTotal, options}. "
            + "from/to are yyyy-MM-dd (UTC, inclusive; default the current month); type = RESUME|OPPORTUNITY|SUBMISSION|FOLLOWUP|INTERVIEW|FEEDBACK|APPLICATION|OFFER|PLACEMENT; "
            + "status = COMPLETED|SCHEDULED|CANCELLED; ownerId = the member who did it; sort = recent (default) | oldest; summaryRange = THIS_MONTH|LAST_MONTH|LAST_7_DAYS|LAST_30_DAYS; size cap 100. 404 without pipeline.view."
    )
    @GetMapping
    @OrgPermissionRequired
    public View get(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        @RequestParam(required = false) Long consultantId,
        @RequestParam(required = false) String type,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) Long clientId,
        @RequestParam(required = false) Long ownerId,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String sort,
        @RequestParam(required = false) String summaryRange,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "10") int size
    ) {
        return service.view(me, new Query(from, to, consultantId, type, status, clientId, ownerId, q, sort, summaryRange, page, size));
    }

    @Operation(summary = "Log an activity for one of your consultants", description = "Record only (followups.manage). 404 when the consultant or client is not yours to see; 400 for a type that only the system records.")
    @PostMapping
    @OrgPermissionRequired
    public ActionResult create(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @Valid @RequestBody CreateRequest body) {
        return service.create(me, body);
    }

    @Operation(summary = "Mark a logged activity COMPLETED, SCHEDULED or CANCELLED", description = "Only manual rows (id of MANUAL:n); a source-derived line is not editable (404).")
    @PatchMapping("/{id}/status")
    @OrgPermissionRequired
    public ActionResult status(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id, @Valid @RequestBody StatusRequest body) {
        return service.updateStatus(me, id, body.status());
    }
}
