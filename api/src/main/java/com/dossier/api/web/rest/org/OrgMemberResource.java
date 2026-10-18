package com.dossier.api.web.rest.org;

import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.org.OrgAccountDTOs;
import com.dossier.api.service.dto.org.OrgInviteRequest;
import com.dossier.api.service.dto.org.OrgInviteResultDTO;
import com.dossier.api.service.org.OrgAccountService;
import com.dossier.api.service.org.OrgInviteService;
import com.dossier.api.service.org.OrgMembership;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
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
    private final OrgAccountService accountService;

    public OrgMemberResource(OrgInviteService inviteService, DemoGuard demoGuard, OrgAccountService accountService) {
        this.accountService = accountService;
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

    @Operation(
        summary = "Create an account for a person now, with a temporary password",
        description = "Same roles, team and manager as an invitation, validated the same way (role ceiling). A new address gets an ACTIVE account that must change the temporary password at first sign-in (mode ACCOUNT_CREATED); in a legacy shared-accounts organization an address that already has a Kiwiply account keeps its own password and receives a normal invitation (mode INVITED); in an organization with separate enterprise accounts (decision O4) a new enterprise account is always created, whatever other accounts that address has. The password is hashed on arrival and never returned again."
    )
    @PostMapping("/account")
    @OrgPermissionRequired(OrgPermission.MEMBERS_INVITE)
    public OrgAccountDTOs.CreateResult createAccount(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody OrgAccountDTOs.CreateRequest request) {
        demoGuard.assertNotDemo();
        return accountService.create(me, request);
    }

    @Operation(summary = "A generated temporary password for the form to show", description = "Nothing is stored; the admin may overwrite it.")
    @GetMapping("/temp-password")
    @OrgPermissionRequired(OrgPermission.MEMBERS_INVITE)
    public org.springframework.http.ResponseEntity<OrgAccountDTOs.Suggestion> tempPassword(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return org.springframework.http.ResponseEntity.ok().header("Cache-Control", "no-store").body(accountService.suggest());
    }

    @Operation(summary = "Reset a temporary password", description = "Only for a member who has not yet chosen their own (409 PASSWORD_ALREADY_SET otherwise). The new password is in this response only.")
    @PostMapping("/{memberId}/reset-password")
    @OrgPermissionRequired(OrgPermission.MEMBERS_INVITE)
    public org.springframework.http.ResponseEntity<OrgAccountDTOs.ResetResult> resetPassword(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long memberId,
        @RequestBody OrgAccountDTOs.ResetRequest request
    ) {
        demoGuard.assertNotDemo();
        return org.springframework.http.ResponseEntity.ok().header("Cache-Control", "no-store").body(accountService.reset(me, memberId, request == null ? null : request.reason()));
    }
}
