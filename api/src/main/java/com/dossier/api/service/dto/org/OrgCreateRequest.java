package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgType;

/**
 * Body of {@code POST /api/orgs}: the one call that makes a DRAFT org with the caller as OWNER. {@code slug} is
 * optional (derived from the name); {@code sizeBand} and {@code country} are optional sales / tax data.
 */
public record OrgCreateRequest(String name, OrgType type, String slug, String sizeBand, String country) {}
