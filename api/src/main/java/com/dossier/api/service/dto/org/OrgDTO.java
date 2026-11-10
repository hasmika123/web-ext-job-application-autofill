package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.OrgType;
import java.time.Instant;

/**
 * An organization as an org member sees it. {@code billingEmail} is filled only for a caller who holds
 * {@code billing.view}, and {@code settings} only for one who holds {@code org.settings.manage}; for everyone else
 * both are null (a plain MEMBER never sees them). No Stripe id, no S3 key, no creator id ever leaves the server.
 */
public record OrgDTO(
    Long id,
    String slug,
    String name,
    OrgType type,
    OrgStatus status,
    String website,
    String sizeBand,
    String country,
    String timezone,
    String billingEmail,
    OrgSettings settings,
    Instant createdAt,
    Instant closedAt
) {}
