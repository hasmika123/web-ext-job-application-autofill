package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.applications.MktApplicationsDTO.NextActionRequest;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsDTO.NoteRequest;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsDTO.Query;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsDTO.Response;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsDTO.Row;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsDTO.StageRequest;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
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
 * The Marketing > Applications board (design: Applications). One GET draws the whole page; the writes are RECORDS only (E1: the
 * consultant submits; nothing here submits to a client or signs in as a consultant). Gate and scope: {@code MktScope} inside the service
 * ({@code member.view_summary} + {@code pipeline.view}, ASSIGNED consultants); everyone else, and any consultant outside the caller's
 * assignments, gets the generic 404.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/applications")
@Tag(name = "mkt-applications", description = "Marketing workspace: the Applications board (KPIs, tracker, funnel, overdue actions, recent updates) and the marketer's records.")
public class MktApplicationsResource {

    private final MktApplicationsService service;

    public MktApplicationsResource(MktApplicationsService service) {
        this.service = service;
    }

    @Operation(
        summary = "The Applications board",
        description = "{kpis, tracker{items,total,page,size,tabs,filters,notShared}, funnel, overdue, overdueTotal, updates, perms}. Query: q, consultantId, clientId, "
            + "stage (applied|awaiting|interviewing|offer|hired|not_selected|all), period and funnelPeriod (1m|3m|6m|12m|all), sort (appliedOn,desc|asc), page (0-based), size (max 100). "
            + "A consultant who shares less than FULL shows the stage only; one who shares nothing is counted in tracker.notShared and listed nowhere."
    )
    @GetMapping
    @OrgPermissionRequired
    public Response get(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) Long consultantId,
        @RequestParam(required = false) Long clientId,
        @RequestParam(required = false) String stage,
        @RequestParam(required = false) String period,
        @RequestParam(required = false) String funnelPeriod,
        @RequestParam(required = false) String sort,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "8") int size
    ) {
        return service.get(me, new Query(q, consultantId, clientId, stage, period, funnelPeriod, sort, page, size));
    }

    @Operation(summary = "Add a note to an application (followups.manage). A record; the PII scanner runs on the text.")
    @PostMapping("/{applicationId}/notes")
    @OrgPermissionRequired
    public Row addNote(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long applicationId, @RequestBody NoteRequest body) {
        return service.addNote(me, applicationId, body);
    }

    @Operation(summary = "Set (or clear, with an empty text) the next action and its due date (followups.manage).")
    @PatchMapping("/{applicationId}/next-action")
    @OrgPermissionRequired
    public Row setNextAction(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long applicationId, @RequestBody NextActionRequest body) {
        return service.setNextAction(me, applicationId, body);
    }

    @Operation(summary = "Mark the follow-up done: clears the next action and leaves a line on the timeline (followups.manage).")
    @PostMapping("/{applicationId}/follow-up-done")
    @OrgPermissionRequired
    public Row followUpDone(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long applicationId) {
        return service.markFollowUpDone(me, applicationId);
    }

    @Operation(summary = "RECORD the stage the consultant's application reached (submissions.record). An event on the timeline; it submits nothing.")
    @PostMapping("/{applicationId}/stage")
    @OrgPermissionRequired
    public Row recordStage(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long applicationId, @RequestBody StageRequest body) {
        return service.recordStage(me, applicationId, body);
    }
}
