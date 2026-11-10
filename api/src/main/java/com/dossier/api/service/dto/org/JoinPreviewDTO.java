package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgRole;
import java.time.Instant;
import java.util.List;

/**
 * What a join link shows before anyone signs in (onboarding-invites.md sections 3.1 and 4): the organization, who invited
 * them, the role, what the organization pays for, and the consent they will be asked for. Public data only; the link is
 * the credential. {@code source} is {@code EMAIL} (a personal invite) or {@code CODE} (a shared link). {@code open} is
 * false when the organization cannot take members right now (it has not been activated yet). {@code createsAccount} is true for a
 * SEPARATE organization (decision O4): accepting creates the person's enterprise account of that organization and asks for a new password.
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
    OrgConsentDTO consent,
    List<String> roles,
    String department,
    String team,
    String message,
    String invitedEmailMasked,
    boolean emailMatchRequired,
    boolean createsAccount
) {
    /** The shape of a shared-code preview: no personal invite, so no roles list, placement, note or address. */
    public JoinPreviewDTO(String source, String orgName, String orgSlug, OrgRole role, String inviterName, String groupName, List<String> pays, Instant expiresAt, boolean open, OrgConsentDTO consent) {
        this(source, orgName, orgSlug, role, inviterName, groupName, pays, expiresAt, open, consent, List.of(), null, null, null, null, false, false);
    }
}
