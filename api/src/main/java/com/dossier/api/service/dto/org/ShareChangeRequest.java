package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.ShareScope;

/**
 * Body of {@code PUT /api/me/orgs/{orgId}/share}: the scope the member chooses and the consent text version they saw.
 * {@code fullToMemberId} names the one person a FULL scope is shared with; it is required for FULL and refused otherwise.
 * (A pairing with a marketer does not exist yet, so FULL is refused until one does.)
 */
public record ShareChangeRequest(ShareScope scope, String consentVersion, Long fullToMemberId) {}
