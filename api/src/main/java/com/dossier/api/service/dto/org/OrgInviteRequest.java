package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgRole;
import java.util.List;

/**
 * Body of {@code POST /api/orgs/{orgId}/members/invite} (onboarding-invites.md section 3.2): up to the admin-configured
 * number of addresses (default 200), one role for all of them, and optionally the group and the support owner they start
 * in. Each entry is an address or {@code Name <address>}. A missing {@code role} takes the org's default role setting.
 */
public record OrgInviteRequest(List<String> emails, OrgRole role, Long groupId, Long supportOwnerMemberId) {}
