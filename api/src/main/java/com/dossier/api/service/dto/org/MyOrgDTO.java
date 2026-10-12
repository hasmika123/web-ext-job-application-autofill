package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.ShareScope;
import java.time.Instant;
import java.util.List;

/**
 * One organization from the member's side (consent-data-sharing.md section 4, {@code GET /api/me/orgs}): who they are in it,
 * what they chose to share and, spelled out from the visibility matrix, what that lets the org see. {@code scope} is their
 * stored choice; {@code effectiveScope} is what the org can actually see right now (it is NONE while the seat is suspended
 * or the org is not live). {@code sees} is generated from {@code ShareField} so the words can never drift from the rules;
 * {@code neverSees} is the fixed list of what no scope ever shows.
 */
public record MyOrgDTO(
    Org org,
    Long memberId,
    OrgRole role,
    OrgMemberStatus status,
    ShareScope scope,
    ShareScope effectiveScope,
    String consentVersion,
    FullTo fullTo,
    Instant since,
    Instant scopeChangedAt,
    List<String> sees,
    List<String> neverSees,
    boolean canLeave,
    boolean canChangeScope
) {
    public record Org(Long id, String slug, String name, OrgStatus status) {}

    /** The one named person a FULL share goes to (a paired marketer or coach). */
    public record FullTo(Long memberId, String name) {}
}
