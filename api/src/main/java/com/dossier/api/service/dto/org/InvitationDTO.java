package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.InviteStatus;
import java.time.Instant;
import java.util.List;

/**
 * One row of the Invitations page (design/enterprise-admin/invitations.png): who was invited, as what, where, by whom, and how it
 * stands. Never carries the token, its hash or the invite link.
 */
public record InvitationDTO(
    Long id,
    String email,
    String name,
    InviteStatus status,
    List<InvitationRoleRef> roles,
    InvitationGroupRef department,
    InvitationGroupRef team,
    InvitationPersonRef manager,
    InvitationPersonRef invitedBy,
    Instant invitedAt,
    Instant expiresAt,
    Instant acceptedAt,
    Instant endedAt,
    int resendCount,
    String message
) {
    public record InvitationRoleRef(Long id, String key, String name, boolean primary) {}

    public record InvitationGroupRef(Long id, String name) {}

    public record InvitationPersonRef(Long memberId, String name) {}

    /** One page of the list: {@code total} counts every match, not only this page. */
    public record InvitationPage(List<InvitationDTO> items, int page, int size, long total) {}

    /**
     * The four counters at the top of the page. {@code deltaLastMonth} is the number of invitations sent in the last 30 days with that
     * status now, minus the same for the 30 days before (the "+12 vs last month" chips); {@code total} counts every invitation.
     */
    public record InvitationCounts(List<InvitationStatusCount> counts, long total) {}

    public record InvitationStatusCount(InviteStatus status, long count, long deltaLastMonth) {}

    /** One line of "Recent invitation activity". {@code kind} is INVITED, ACCEPTED, REVOKED or EXPIRED. */
    public record InvitationActivity(String kind, Instant at, Long invitationId, String email, String name, InvitationPersonRef actor) {}

    /** The outcome of a bulk resend or revoke, one entry per requested id in the order sent: {@code status} OK or FAILED, {@code code} the refusal. */
    public record InvitationBulkResult(List<InvitationBulkItem> results) {}

    public record InvitationBulkItem(Long id, String status, String code) {}
}
