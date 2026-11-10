package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
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
 * Marketing workspace, Interviews page. Permission {@code interviews.coordinate} (ASSIGNED scope) through {@code MktScope}: a caller
 * without it, a non-member, a flag-off organization and an interview of a consultant the caller is not assigned to all get the same 404.
 * E1: every write records or proposes; none submits for a consultant.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/interviews")
@Tag(name = "mkt-interviews", description = "Marketing workspace: interview schedule, feedback and preparation (record / propose only).")
public class MktInterviewsResource {

    private final MktInterviewsService service;

    public MktInterviewsResource(MktInterviewsService service) {
        this.service = service;
    }

    @Operation(
        summary = "The Interviews board (one call)",
        description = "{generatedAt, kpis[4], schedule{items,total,page,size,from,to}, upcoming[<=5], pendingFeedback[<=5], checklist, reminders[<=5], clients[]}. "
            + "from/to (yyyy-MM-dd) default to the viewer's current week (Sunday start; tzOffsetMinutes = local minus UTC); status = CONFIRMED|SCHEDULED|PENDING_FEEDBACK|RESCHEDULED|AWAITING_CONFIRMATION|COMPLETED; "
            + "sort = date|consultant|client|role|status|round; size is capped at 100."
    )
    @GetMapping
    @OrgPermissionRequired
    public MktInterviewsDto.Overview overview(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) Long clientId,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String sort,
        @RequestParam(required = false) String dir,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "25") int size,
        @RequestParam(defaultValue = "0") int tzOffsetMinutes
    ) {
        return service.overview(me, new MktInterviewsDto.Query(from, to, status, clientId, q, sort, dir, page, size, tzOffsetMinutes));
    }

    @Operation(summary = "The Preparation Checklist of one interview (the seven default items are created on first read)")
    @GetMapping("/{interviewId}/prep")
    @OrgPermissionRequired
    public MktInterviewsDto.Checklist prep(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long interviewId) {
        return service.checklist(me, interviewId);
    }

    @Operation(summary = "Tick or untick one checklist item")
    @PatchMapping("/{interviewId}/prep/{itemId}")
    @OrgPermissionRequired
    public MktInterviewsDto.Checklist tick(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long interviewId,
        @PathVariable Long itemId,
        @Valid @RequestBody MktInterviewsDto.PrepTickRequest body
    ) {
        return service.tick(me, interviewId, itemId, body.done());
    }

    @Operation(summary = "Propose a reschedule (a proposal: the consultant confirms; the slot keeps its time until a confirmed slot is recorded)")
    @PostMapping("/{interviewId}/reschedule")
    @OrgPermissionRequired
    public MktInterviewsDto.Row reschedule(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long interviewId,
        @Valid @RequestBody MktInterviewsDto.RescheduleRequest body
    ) {
        return service.proposeReschedule(me, interviewId, body);
    }

    @Operation(summary = "Record that the slot was confirmed (applies a pending proposal's time)")
    @PostMapping("/{interviewId}/confirm")
    @OrgPermissionRequired
    public MktInterviewsDto.Row confirm(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long interviewId) {
        return service.confirmSlot(me, interviewId);
    }

    @Operation(summary = "Record feedback after the interview (409 while it is still in the future)")
    @PostMapping("/{interviewId}/feedback")
    @OrgPermissionRequired
    public MktInterviewsDto.Row feedback(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long interviewId,
        @Valid @RequestBody MktInterviewsDto.FeedbackRequest body
    ) {
        return service.recordFeedback(me, interviewId, body);
    }

    @Operation(summary = "Request a reminder for the consultant (a record; nothing is sent from here)")
    @PostMapping("/{interviewId}/remind")
    @OrgPermissionRequired
    public MktInterviewsDto.Row remind(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long interviewId) {
        return service.requestReminder(me, interviewId);
    }
}
