package com.dossier.api.domain.enumeration;

import com.dossier.api.domain.org.OrgMember;
import java.time.Instant;

/**
 * Where an invitation stands, as the Invitations page counts it (15-employees-and-teams.md section 2). Not stored: derived from the
 * seat it created, so the page and the expiry job can never disagree.
 *
 * <ul>
 *   <li>{@link #PENDING}: the seat is INVITED and the link has not run out.</li>
 *   <li>{@link #EXPIRED}: the link ran out (INVITED past its expiry, before the job has swept it, or swept to REMOVED/EXPIRED).</li>
 *   <li>{@link #REVOKED}: an admin withdrew it (REMOVED with reason REVOKED, never joined).</li>
 *   <li>{@link #ACCEPTED}: the person joined (a join time exists, whatever happened to the seat since).</li>
 * </ul>
 */
public enum InviteStatus {
    PENDING,
    ACCEPTED,
    EXPIRED,
    REVOKED;

    public static final String REASON_EXPIRED = "EXPIRED";
    public static final String REASON_REVOKED = "REVOKED";

    /** The status of an invitation seat (a row with an invite address). */
    public static InviteStatus of(OrgMember seat, Instant now) {
        if (seat.getJoinedAt() != null) return ACCEPTED;
        if (seat.getStatus() == OrgMemberStatus.INVITED) {
            return seat.getInviteExpiresAt() != null && seat.getInviteExpiresAt().isBefore(now) ? EXPIRED : PENDING;
        }
        return REASON_EXPIRED.equals(seat.getInviteEndedReason()) ? EXPIRED : REVOKED;
    }
}
