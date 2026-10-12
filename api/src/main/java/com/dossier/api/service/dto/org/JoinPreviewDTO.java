package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgRole;
import java.time.Instant;
import java.util.List;

/**
 * What a join link shows before anyone signs in (onboarding-invites.md sections 3.1 and 4): the organization, who invited
 * them, the role, what the organization pays for, and the consent they will be asked for. Public data only; the link is
 * the credential. {@code source} is {@code EMAIL} (a personal invite) or {@code CODE} (a shared link). {@code open} is
 * false when the organization cannot take members right now (it has not been activated yet).
 */
public record JoinPreviewDTO(
    String source,
    String orgName,
    String orgSlug,
    OrgRole role,
    String inviterName,
    String groupName,
    List<String> pays,
    Instant expiresAt,
    boolean open,
    OrgConsentDTO consent
) {}
