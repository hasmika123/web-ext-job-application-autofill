package com.dossier.api.domain.enumeration;

/** Triage lifecycle for a bug report (Phase 9.A5), set by admins. */
public enum BugStatus {
    NEW,
    TRIAGED,
    IN_PROGRESS,
    RESOLVED,
    WONTFIX,
}
