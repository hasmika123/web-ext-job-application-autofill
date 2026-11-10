package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.ShareScope;

/**
 * Body of {@code POST /api/join/{token}/accept} and {@code POST /api/join/code/{code}}: what the person chose on the
 * consent screen and the version of the text they saw. Only NONE and SUMMARY are accepted here; FULL is offered later,
 * and only for one named person. {@code password} is read only for an invitation to a SEPARATE organization (decision O4): the person
 * has no session yet and chooses the password of their new enterprise account while accepting; it is hashed, never logged or echoed.
 */
public record JoinAcceptRequest(ShareScope shareScope, String consentVersion, String password) {
    /** The signed-in shape (legacy SHARED organizations): no password, the person already has an account. */
    public JoinAcceptRequest(ShareScope shareScope, String consentVersion) {
        this(shareScope, consentVersion, null);
    }
}
