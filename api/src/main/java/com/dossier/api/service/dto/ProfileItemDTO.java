package com.dossier.api.service.dto;

import com.dossier.api.domain.enumeration.ProfileSection;
import com.dossier.api.domain.enumeration.Provenance;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;

/**
 * A Common Profile item as the web sees it (Resume Builder DESIGN v1 6.1): {@code data} is the item
 * object (the resume-document item of that kind, minus the item's own id and hidden flag).
 */
public record ProfileItemDTO(
    Long id,
    ProfileSection section,
    int position,
    JsonNode data,
    Provenance provenance,
    Long sourceResumeId,
    boolean hidden,
    Instant updatedAt
) {}
