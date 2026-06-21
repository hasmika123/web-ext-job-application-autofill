package com.dossier.api.domain.enumeration;

/**
 * The ApplicationStatus enumeration.
 */
public enum ApplicationStatus {
    DRAFT, // fill started; submission not yet confirmed by the extension
    SAVED,
    APPLIED,
    INTERVIEW,
    OFFER,
    REJECTED,
}
