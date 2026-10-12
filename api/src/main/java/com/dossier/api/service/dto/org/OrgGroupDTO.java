package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgGroupKind;

/** A department, cohort or team; {@code memberCount} counts INVITED, ACTIVE and SUSPENDED seats in it. */
public record OrgGroupDTO(Long id, String name, OrgGroupKind kind, int sortOrder, long memberCount) {}
