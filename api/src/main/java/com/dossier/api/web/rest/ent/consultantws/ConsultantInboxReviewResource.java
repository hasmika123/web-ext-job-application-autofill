package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantInboxService;
import com.dossier.api.service.inbox.InboxReviewService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Consultant workspace, inbox safety (see {@code InboxReviewResource}): what the consultant's own inbox held, accept, dismiss, undo and the rejection
 * switch. Same shapes as the personal routes. Every route answers the signed-in consultant about their own mailbox and is the generic 404 for anyone
 * else; the organization never sees mail text. The bodies carry ids and a boolean only - no free text.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ConsultantInboxReviewResource {

    public record AcceptRequest(Long applicationId) {}

    public record SettingsRequest(boolean applyRejectionsAutomatically) {}

    private final ConsultantInboxService service;

    public ConsultantInboxReviewResource(ConsultantInboxService service) {
        this.service = service;
    }

    @Operation(summary = "What the inbox held for the consultant's review")
    @GetMapping("/inbox/review")
    @OrgPermissionRequired
    public InboxReviewService.ReviewList review(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.review(me);
    }

    @Operation(summary = "Apply a held change")
    @PostMapping("/inbox/review/{holdId}/accept")
    @OrgPermissionRequired
    public InboxReviewService.Applied accept(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long holdId,
        @RequestBody(required = false) AcceptRequest body
    ) {
        return service.acceptHold(me, holdId, body == null ? null : body.applicationId());
    }

    @Operation(summary = "Dismiss a held change; the same email never asks again")
    @PostMapping("/inbox/review/{holdId}/dismiss")
    @OrgPermissionRequired
    public ResponseEntity<Void> dismiss(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long holdId) {
        service.dismissHold(me, holdId);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Undo a status change the inbox made", description = "409 UNDO_EXPIRED after the undo window.")
    @PostMapping("/applications/{applicationId}/inbox-undo/{eventId}")
    @OrgPermissionRequired
    public InboxReviewService.Applied undo(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long applicationId,
        @PathVariable Long eventId
    ) {
        return service.undoChange(me, applicationId, eventId);
    }

    @Operation(summary = "The inbox safety settings")
    @GetMapping("/inbox/settings")
    @OrgPermissionRequired
    public InboxReviewService.Settings settings(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.reviewSettings(me);
    }

    @Operation(summary = "Apply rejections automatically, on or off")
    @PutMapping("/inbox/settings")
    @OrgPermissionRequired
    public InboxReviewService.Settings setSettings(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody SettingsRequest body
    ) {
        return service.setReviewSettings(me, body.applyRejectionsAutomatically());
    }
}
