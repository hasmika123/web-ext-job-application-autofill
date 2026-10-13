package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.ShareScope;
import java.util.List;

/** The person is in: the seat, the organization, the role and what they chose to share (the "You're in" screen). */
public record JoinResultDTO(
    Long orgId,
    String orgSlug,
    String orgName,
    Long memberId,
    OrgRole role,
    ShareScope shareScope,
    List<String> pays,
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) com.dossier.api.service.TokenIssuer.TokenPair session
) {
    /** The same result with a fresh tenant-bound token pair (accepting on an organization host, X1.8): the person had no seat when they signed in, so the pair they hold carries no tid. */
    public JoinResultDTO withSession(com.dossier.api.service.TokenIssuer.TokenPair pair) {
        return new JoinResultDTO(orgId, orgSlug, orgName, memberId, role, shareScope, pays, pair);
    }
}
