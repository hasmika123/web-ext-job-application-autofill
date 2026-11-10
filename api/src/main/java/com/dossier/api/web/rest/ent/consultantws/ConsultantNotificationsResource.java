package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantNotificationsDTO;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Consultant workspace Notifications: the caller's OWN feed and preferences. 404 for anyone who is not a consultant of this organization and for a
 * notification that is not theirs. Nothing is ever emailed, texted or pushed: the channel switches are stored preferences only.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/notifications")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ConsultantNotificationsResource {

    private final ConsultantNotificationsService service;

    public ConsultantNotificationsResource(ConsultantNotificationsService service) {
        this.service = service;
    }

    @Operation(
        summary = "Notifications page",
        description = "First creates any missing notifications from the caller's own rows (idempotent), then answers tiles, per-category tab counts, one filtered page of the feed (size 1 to 50), the by-category tiles for the period and the preferences."
    )
    @GetMapping
    @OrgPermissionRequired
    public ConsultantNotificationsDTO.Response page(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String category,
        @RequestParam(required = false) String priority,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String period,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size
    ) {
        return service.page(me, status, category, priority, q, period, page, size);
    }

    @Operation(summary = "Mark read or unread", description = "One or several (up to 50) of the caller's own notifications. Repeating it changes nothing.")
    @PostMapping("/read")
    @OrgPermissionRequired
    public ConsultantNotificationsDTO.Changed read(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody(required = false) ConsultantNotificationsDTO.ReadRequest body
    ) {
        return service.markRead(me, body == null ? null : body.ids(), body == null ? null : body.read());
    }

    @Operation(summary = "Resolve", description = "Marks the notifications handled (and read). Repeating it changes nothing.")
    @PostMapping("/resolve")
    @OrgPermissionRequired
    public ConsultantNotificationsDTO.Changed resolve(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody(required = false) ConsultantNotificationsDTO.IdsRequest body
    ) {
        return service.resolve(me, body == null ? null : body.ids());
    }

    @Operation(summary = "Snooze", description = "Hides the notifications until a future time at most 14 days away. 409 NOTIFICATION_RESOLVED for a resolved one.")
    @PostMapping("/snooze")
    @OrgPermissionRequired
    public ConsultantNotificationsDTO.SnoozeResult snooze(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody(required = false) ConsultantNotificationsDTO.SnoozeRequest body
    ) {
        return service.snooze(me, body == null ? null : body.ids(), body == null ? null : body.until());
    }

    @Operation(summary = "Delete several", description = "Soft delete: the notifications leave the feed and their source events are not turned into new ones.")
    @PostMapping("/delete")
    @OrgPermissionRequired
    public ConsultantNotificationsDTO.Changed deleteMany(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody(required = false) ConsultantNotificationsDTO.IdsRequest body
    ) {
        return service.delete(me, body == null ? null : body.ids());
    }

    @Operation(summary = "Delete one", description = "Soft delete. A second delete is the generic 404.")
    @DeleteMapping("/{id}")
    @OrgPermissionRequired
    public ConsultantNotificationsDTO.Changed deleteOne(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long id) {
        return service.delete(me, List.of(id));
    }

    @Operation(summary = "Mark all as read", description = "Every unresolved, unread notification of the caller.")
    @PostMapping("/mark-all-read")
    @OrgPermissionRequired
    public ConsultantNotificationsDTO.Changed markAllRead(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.markAllRead(me);
    }

    @Operation(summary = "Mute non-critical", description = "Switches off job matches, applications, messages and reminders (interviews, approvals and offers stay on). Answers the previous settings so the page can undo it.")
    @PostMapping("/mute-non-critical")
    @OrgPermissionRequired
    public ConsultantNotificationsDTO.MuteResult mute(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.muteNonCritical(me);
    }

    @Operation(summary = "Save several preferences", description = "All or nothing. SMS cannot be switched on (422): there is no SMS channel.")
    @PutMapping("/preferences")
    @OrgPermissionRequired
    public ConsultantNotificationsDTO.PrefsResult setPreferences(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody(required = false) ConsultantNotificationsDTO.PrefsRequest body
    ) {
        return service.setPreferences(me, body == null ? null : body.items());
    }

    @Operation(summary = "Save one category's preference", description = "Partial: only the fields sent change. SMS cannot be switched on (422).")
    @PutMapping("/preferences/{category}")
    @OrgPermissionRequired
    public ConsultantNotificationsDTO.PrefsResult setPreference(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable String category,
        @RequestBody(required = false) ConsultantNotificationsDTO.PrefRequest body
    ) {
        ConsultantNotificationsDTO.PrefRequest b = body == null ? new ConsultantNotificationsDTO.PrefRequest(null, null, null, null) : body;
        return service.setPreference(me, category, b.enabled(), b.email(), b.inApp(), b.sms());
    }
}
