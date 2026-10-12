package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.ShareScope;

/**
 * Body of {@code POST /api/join/{token}/accept} and {@code POST /api/join/code/{code}}: what the person chose on the
 * consent screen and the version of the text they saw. Only NONE and SUMMARY are accepted here; FULL is offered later,
 * and only for one named person.
 */
public record JoinAcceptRequest(ShareScope shareScope, String consentVersion) {}
