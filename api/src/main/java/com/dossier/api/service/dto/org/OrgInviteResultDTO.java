package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgRole;
import java.time.Instant;
import java.util.List;

/**
 * What an invite call did: who was invited, which entries were refused (with a reason a person can read), and which
 * addresses already hold a seat (so nothing is sent twice). {@code rows} is the same outcome one-per-entry in the order sent, for the
 * bulk-invite result table. Nothing here is stored beyond the seats themselves, and nothing differs between an address that has a
 * Kiwiply account and one that has not (no account enumeration).
 */
public record OrgInviteResultDTO(Long batchId, List<Invited> invited, List<Invalid> invalid, List<String> alreadyMember, List<InviteRowResult> rows) {
    public OrgInviteResultDTO(Long batchId, List<Invited> invited, List<Invalid> invalid, List<String> alreadyMember) {
        this(batchId, invited, invalid, alreadyMember, List.of());
    }

    public OrgInviteResultDTO withRows(List<InviteRowResult> rows) {
        return new OrgInviteResultDTO(batchId, invited, invalid, alreadyMember, rows);
    }

    /** One seat created, awaiting its owner. The token is never returned: it exists only in the email. */
    public record Invited(Long memberId, String email, String name, OrgRole role, Instant expiresAt, List<Long> roleIds) {
        public Invited(Long memberId, String email, String name, OrgRole role, Instant expiresAt) {
            this(memberId, email, name, role, expiresAt, List.of());
        }
    }

    /** An entry that was not invited. {@code reason} is one of malformed, too_long, duplicate, sensitive_name. */
    public record Invalid(String entry, String reason) {}

    /** The outcome of one entry. {@code status} is INVITED, INVALID, DUPLICATE or ALREADY_MEMBER; {@code reason} explains INVALID/DUPLICATE. */
    public record InviteRowResult(String entry, String email, String status, String reason, Long memberId) {}
}
