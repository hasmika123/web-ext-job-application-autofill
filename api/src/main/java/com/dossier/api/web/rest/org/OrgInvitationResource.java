package com.dossier.api.web.rest.org;

import com.dossier.api.domain.enumeration.InviteStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.org.InvitationDTO;
import com.dossier.api.service.dto.org.OrgInviteRequest;
import com.dossier.api.service.dto.org.OrgInviteResultDTO;
import com.dossier.api.service.org.OrgInvitationService;
import com.dossier.api.service.org.OrgInviteService;
import com.dossier.api.service.org.OrgMembership;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Invitations page (X1.15; design/enterprise-admin/invitations.png): the list with filters and paging, the status counters with
 * last-month change, the recent-activity feed, inviting one or many people, re-sending, revoking, and the bulk forms of both. The
 * public side (preview by token, accept) is {@link JoinResource}. Every handler needs {@code members.invite}; a caller without it, or an
 * organization that is not theirs, is told 404. The invite link and token are never in any response.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/invitations")
@Tag(name = "org-invitations", description = "Invitations of an organization: list, counts, activity, invite, resend, revoke.")
public class OrgInvitationResource {

    private final OrgInvitationService invitations;
    private final OrgInviteService inviteService;
    private final DemoGuard demoGuard;

    public OrgInvitationResource(OrgInvitationService invitations, OrgInviteService inviteService, DemoGuard demoGuard) {
        this.invitations = invitations;
        this.inviteService = inviteService;
        this.demoGuard = demoGuard;
    }

    /** Body of the bulk actions: the invitation ids, at most 100. */
    public record IdsRequest(List<Long> ids) {}

    @Operation(
        summary = "List invitations",
        description = "Newest first. Filters: status (PENDING, ACCEPTED, EXPIRED, REVOKED), roleId, departmentGroupId, an invited-on range (from inclusive, to exclusive, ISO instants) and q (email or name contains). " +
        "A caller whose invite right is limited to members sees only the invitations they sent."
    )
    @GetMapping
    @OrgPermissionRequired(OrgPermission.MEMBERS_INVITE)
    public InvitationDTO.InvitationPage list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) InviteStatus status,
        @RequestParam(required = false) Long roleId,
        @RequestParam(required = false) Long departmentGroupId,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
        @RequestParam(required = false) String q,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "25") int size,
        @RequestParam(defaultValue = "invitedAt,desc") String sort
    ) {
        return invitations.list(me, status, roleId, departmentGroupId, from, to, q, page, size, !sort.toLowerCase().endsWith(",asc"));
    }

    @Operation(summary = "Invitation counters", description = "Pending, accepted, expired and revoked, each with the change against the month before (invitations sent in the last 30 days minus the 30 days before).")
    @GetMapping("/counts")
    @OrgPermissionRequired(OrgPermission.MEMBERS_INVITE)
    public InvitationDTO.InvitationCounts counts(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return invitations.counts(me);
    }

    @Operation(summary = "Recent invitation activity", description = "The latest invited, accepted, revoked and expired events, newest first.")
    @GetMapping("/activity")
    @OrgPermissionRequired(OrgPermission.MEMBERS_INVITE)
    public List<InvitationDTO.InvitationActivity> activity(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestParam(defaultValue = "10") int limit) {
        return invitations.activity(me, limit);
    }

    @Operation(
        summary = "Invite one or many people",
        description = "One address with an optional fullName, or a pasted list (up to the configured batch size). Same roles and placement for all. " +
        "Returns one row per entry (INVITED, INVALID, DUPLICATE, ALREADY_MEMBER); the link is only ever emailed. 422 ROLE_CEILING when a role gives more access than the caller holds."
    )
    @PostMapping
    @OrgPermissionRequired(OrgPermission.MEMBERS_INVITE)
    public OrgInviteResultDTO invite(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody OrgInviteRequest request) {
        demoGuard.assertNotDemo();
        return inviteService.invite(me, request);
    }

    @Operation(summary = "Send an invitation again", description = "Rotates the one-time link (the old one stops working), extends the expiry, and revives an expired invitation. Limited per invitation per week.")
    @PostMapping("/{invitationId}/resend")
    @OrgPermissionRequired(OrgPermission.MEMBERS_INVITE)
    public OrgInviteResultDTO.Invited resend(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long invitationId) {
        demoGuard.assertNotDemo();
        return inviteService.resend(me, invitationId);
    }

    @Operation(summary = "Revoke a pending invitation", description = "The link stops working at once and the address can be invited again. 404 for an invitation that is not pending.")
    @PostMapping("/{invitationId}/revoke")
    @OrgPermissionRequired(OrgPermission.MEMBERS_INVITE)
    public ResponseEntity<Void> revoke(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long invitationId) {
        demoGuard.assertNotDemo();
        inviteService.revoke(me, invitationId);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Resend several invitations", description = "At most 100 ids. One result per id: an invitation that cannot be re-sent fails alone with its code.")
    @PostMapping("/bulk/resend")
    @OrgPermissionRequired(OrgPermission.MEMBERS_INVITE)
    public InvitationDTO.InvitationBulkResult bulkResend(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody IdsRequest request) {
        demoGuard.assertNotDemo();
        return invitations.bulkResend(me, request == null ? null : request.ids());
    }

    @Operation(summary = "Revoke several invitations", description = "At most 100 ids. One result per id.")
    @PostMapping("/bulk/revoke")
    @OrgPermissionRequired(OrgPermission.MEMBERS_INVITE)
    public InvitationDTO.InvitationBulkResult bulkRevoke(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody IdsRequest request) {
        demoGuard.assertNotDemo();
        return invitations.bulkRevoke(me, request == null ? null : request.ids());
    }
}
