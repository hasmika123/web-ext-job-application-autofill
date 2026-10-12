package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.ShareScope;
import java.util.List;

/** The person is in: the seat, the organization, the role and what they chose to share (the "You're in" screen). */
public record JoinResultDTO(Long orgId, String orgSlug, String orgName, Long memberId, OrgRole role, ShareScope shareScope, List<String> pays) {}
