package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgRole;
import java.time.Instant;
import java.util.List;

/**
 * What an invite call did: who was invited, which entries were refused (with a reason a person can read), and which
 * addresses already hold a seat (so nothing is sent twice). Nothing here is stored beyond the seats themselves.
 */
public record OrgInviteResultDTO(Long batchId, List<Invited> invited, List<Invalid> invalid, List<String> alreadyMember) {
    /** One seat created, awaiting its owner. The token is never returned: it exists only in the email. */
    public record Invited(Long memberId, String email, String name, OrgRole role, Instant expiresAt) {}

    /** An entry that was not invited. {@code reason} is one of malformed, too_long, duplicate, sensitive_name. */
    public record Invalid(String entry, String reason) {}
}
