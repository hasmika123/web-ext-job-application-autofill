package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;

/** One row of {@code GET /api/orgs/mine}: an organization the caller is an ACTIVE member of (drives the org switcher). */
public record OrgMineDTO(Long orgId, String slug, String name, OrgRole role, OrgStatus status, long memberCount) {}
