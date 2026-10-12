package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgGroupKind;

/** Body of group create (name required) and patch (every field optional). {@code sortOrder} is 0..9999. */
public record OrgGroupRequest(String name, OrgGroupKind kind, Integer sortOrder) {}
