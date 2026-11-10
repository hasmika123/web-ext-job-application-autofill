package com.dossier.api.domain.enumeration;

import java.util.EnumSet;
import java.util.Set;

/**
 * What an {@code org_assignment} row says about the assignee's relationship to a consultant
 * (docs/enterprise-v2/17-consultant-assignments.md section 1, ADR-008).
 */
public enum AssignmentKind {
    /** The marketer accountable for the consultant's marketing. Acts for the consultant; ASSIGNED scope. */
    PRIMARY,
    /** Covers when the PRIMARY is out; same powers. */
    BACKUP,
    /** A marketing manager: approves and escalates, never acts for the consultant. */
    MANAGER,
    /** Temporary cover with an explicit end date. Acts for the consultant until it ends. */
    DELEGATE;

    /** The kinds that put a consultant in the assignee's ASSIGNED scope and let the assignee act for them. */
    public static final Set<AssignmentKind> ACTING = Set.copyOf(EnumSet.of(PRIMARY, BACKUP, DELEGATE));
}
