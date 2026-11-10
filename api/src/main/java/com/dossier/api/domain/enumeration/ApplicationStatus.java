package com.dossier.api.domain.enumeration;

/**
 * The ApplicationStatus enumeration. Stored as a varchar, so a value is added here and nowhere else.
 * The pipeline runs {@code DRAFT -> SAVED -> APPLIED -> IN_REVIEW -> INTERVIEW -> OFFER}; REJECTED and
 * WITHDRAWN are terminal for mail (only the user moves an application out of them). "Ghosted" is not a
 * status: it is derived from the age of the last event, never stored.
 */
public enum ApplicationStatus {
    DRAFT, // fill started; submission not yet confirmed by the extension
    SAVED,
    APPLIED,
    IN_REVIEW, // the employer acknowledged it is reviewing the application (inbox or the user)
    INTERVIEW,
    OFFER,
    REJECTED,
    WITHDRAWN, // the user pulled out
}
