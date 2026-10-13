package com.dossier.api.domain.enumeration;

/**
 * Lifecycle of an organization (tenant-model.md section 3). Until billing ships only {@code DRAFT},
 * {@code ACTIVE} and {@code CLOSED} are reachable.
 */
public enum OrgStatus {
    DRAFT,
    PENDING_SETUP_FEE,
    ACTIVE,
    PAST_DUE,
    SUSPENDED,
    CLOSED,
}
