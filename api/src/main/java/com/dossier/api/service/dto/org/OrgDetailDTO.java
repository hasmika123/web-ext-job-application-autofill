package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import java.util.List;

/**
 * {@code GET /api/orgs/{orgId}}: the org, who the caller is in it, and what the caller may do. The web gates its UI on
 * {@code me.permissions}; the server never trusts that list (every handler checks again).
 *
 * @param memberCount ACTIVE seats of every role
 */
public record OrgDetailDTO(OrgDTO org, Me me, long memberCount, OrgStatus status) {
    public record Me(Long memberId, OrgRole role, List<String> permissions) {}
}
