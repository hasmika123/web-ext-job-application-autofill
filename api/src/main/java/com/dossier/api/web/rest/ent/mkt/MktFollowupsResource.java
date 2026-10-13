package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.ActionResult;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.Bucket;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.CallRequest;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.CreateRequest;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.Page;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.ReminderRequest;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.StatusRequest;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.View;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.Window;
import com.dossier.api.service.ent.mkt.followups.MktFollowupService;
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
 * The Marketing workspace Follow-ups page (`/w/marketing/followups`). Permission {@code followups.manage}, ASSIGNED scope: a marketer only sees and
 * changes follow-ups of the consultants assigned to them (anyone else, anything else: the generic 404). Writes only RECORD (E1): a reminder is a
 * stored request, never an email, and nothing here submits for a consultant.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/followups")
@Tag(name = "mkt-followups", description = "Marketing workspace: follow-up items, KPIs and insights (record-only writes).")
public class MktFollowupsResource {

    private final MktFollowupService service;

    public MktFollowupsResource(MktFollowupService service) {
        this.service = service;
    }

    @Operation(
        summary = "The Follow-ups board (one call)",
        description = "{generatedAt, kpis[dueToday, overdue, completedToday, waiting], today, overdue, upcoming: {items,total,page,size}, insights}. window = THIS_WEEK (last 7 days), LAST_WEEK or THIS_MONTH (last 30 days) drives only the insights. 404 without followups.manage."
    )
    @GetMapping
    @OrgPermissionRequired
    public View get(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(defaultValue = "THIS_WEEK") Window window,
        @RequestParam(defaultValue = "50") int size,
        @RequestParam(required = false) String q
    ) {
        return service.view(me, window, size, q);
    }

    @Operation(summary = "One bucket as a page (today, overdue, upcoming, completed, waiting)", description = "page (0-based), size (cap 100), q (title, detail, client or consultant), sort = dueAt|priority|consultant[,desc].")
    @GetMapping("/list")
    @OrgPermissionRequired
    public Page list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(defaultValue = "TODAY") Bucket bucket,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "50") int size,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String sort
    ) {
        return service.list(me, bucket, page, size, q, sort);
    }

    @Operation(summary = "Add a follow-up for one of your consultants", description = "Record only. 404 when the consultant, application or client is not yours to see.")
    @PostMapping
    @OrgPermissionRequired
    public ActionResult create(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @Valid @RequestBody CreateRequest body) {
        return service.create(me, body);
    }

    @Operation(summary = "Update a follow-up's status", description = "PENDING, IN_PROGRESS, SCHEDULED, NOT_STARTED, WAITING or COMPLETED (completing stamps completed_at). Logs a STATUS_CHANGED event.")
    @PatchMapping("/{id}/status")
    @OrgPermissionRequired
    public ActionResult status(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id, @Valid @RequestBody StatusRequest body) {
        return service.updateStatus(me, id, body.status());
    }

    @Operation(summary = "Mark a follow-up complete")
    @PostMapping("/{id}/complete")
    @OrgPermissionRequired
    public ActionResult complete(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.complete(me, id);
    }

    @Operation(summary = "Log a call (note and outcome)", description = "Records a CALL_LOGGED event; awaitingReply parks the item as WAITING.")
    @PostMapping("/{id}/call")
    @OrgPermissionRequired
    public ActionResult call(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id, @Valid @RequestBody CallRequest body) {
        return service.logCall(me, id, body);
    }

    @Operation(summary = "Record a reminder request", description = "Stores a REMINDER_SENT event. It does NOT email or message anyone (E1: no outbound mail from this build); the reply says emailed=false.")
    @PostMapping("/{id}/reminder")
    @OrgPermissionRequired
    public ActionResult reminder(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id, @Valid @RequestBody(required = false) ReminderRequest body) {
        return service.sendReminder(me, id, body);
    }
}
