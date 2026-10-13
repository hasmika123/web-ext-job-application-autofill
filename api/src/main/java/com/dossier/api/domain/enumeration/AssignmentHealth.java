package com.dossier.api.domain.enumeration;

/** Whether an assignment still grants anything (17-consultant-assignments.md section 2): only {@code OK} rows count. */
public enum AssignmentHealth {
    OK,
    /** The assignee's role no longer includes the permission the assignment needs. Flagged, never auto-ended. */
    ROLE_LOST,
    ASSIGNEE_SUSPENDED,
}
