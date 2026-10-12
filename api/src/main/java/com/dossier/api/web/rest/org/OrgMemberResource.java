package com.dossier.api.web.rest.org;

import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.org.OrgInviteRequest;
import com.dossier.api.service.dto.org.OrgInviteResultDTO;
import com.dossier.api.service.org.OrgInviteService;
import com.dossier.api.service.org.OrgMembership;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The people of an organization (tenant-model.md section 5): inviting by email and sending an invite again (O2.2); the
 * consent-scoped member list and member reads arrive with O5.1. Every handler is checked by {@code @OrgPermissionRequired}
 * before its body runs; a caller who may not is told 404, like for an org that does not exist.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/members")
@Tag(name = "org-members", description = "Seats of an organization: invites, and the consent-scoped list.")
public class OrgMemberResource {

    private final OrgInviteService inviteService;
    private final DemoGuard demoGuard;

    public OrgMemberResource(OrgInviteService inviteService, DemoGuard demoGuard) {
        this.inviteService = inviteService;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "Invite people by email",
        description = "Up to the configured number of addresses per call. Returns who was invited, which entries were refused and which addresses already hold a seat. 409 SEAT_STATE while the org is not active (admins only before then), 422 ORG_LIMIT_REACHED over a configured cap."
    )
    @PostMapping("/invite")
    @OrgPermissionRequired(OrgPermission.MEMBERS_INVITE)
    public OrgInviteResultDTO invite(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody OrgInviteRequest request) {
        demoGuard.assertNotDemo();
        return inviteService.invite(me, request);
    }

    @Operation(summary = "Send an invite again", description = "Rotates the one-time link (the old one stops working) and emails the new one. Limited per invite per week.")
    @PostMapping("/{memberId}/resend")
    @OrgPermissionRequired(OrgPermission.MEMBERS_INVITE)
    public OrgInviteResultDTO.Invited resend(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long memberId) {
        demoGuard.assertNotDemo();
        return inviteService.resend(me, memberId);
    }
}
