package com.dossier.api.service.ent.mkt.escalations;

import java.time.Instant;
import java.util.List;

/**
 * An escalation as the Escalations page and the Home page show it: metadata and short notes only (a title built from names and a job title, a detail line, the
 * resolution text). People appear by display name; nothing here is resume content, a rate or a contact.
 */
public record EscalationDTO(
    Long id,
    String kind,
    String severity,
    String subjectType,
    Long subjectId,
    Person consultant,
    Person marketer,
    String title,
    String detail,
    String ruleKey,
    Person raisedBy,
    Instant raisedAt,
    String status,
    Person assignee,
    Instant snoozedUntil,
    Person resolvedBy,
    Instant resolvedAt,
    String resolution,
    long ageHours,
    List<Event> events
) {
    /** A person as a name to show; {@code id} is the seat id for a member and the profile id for a consultant. */
    public record Person(Long id, String name) {}

    /** One line of the trail (RAISED, ACKNOWLEDGED, ASSIGNED, SNOOZED, COMMENTED, RESOLVED, DISMISSED, REOPENED); {@code actor} is null for the system. */
    public record Event(Long id, String kind, Person actor, String note, Instant at) {}

    public record Page(List<EscalationDTO> items, int page, int size, long total, boolean hasMore) {}

    /** The badge and the Home tile: live escalations of the team. {@code open} = OPEN + ACKNOWLEDGED, split by severity; {@code snoozed} is counted apart. */
    public record Counts(long open, long high, long medium, long low, long snoozed) {}

    // ---- request bodies ----
    public record AssignRequest(Long memberId) {}

    public record SnoozeRequest(Instant until) {}

    public record ResolveRequest(String resolution) {}

    public record NoteRequest(String note) {}

    /** A marketer's manual raise. {@code kind} is MANUAL (the only one a person raises); {@code subjectId} is the suggested opportunity's id for MKT_OPPORTUNITY, the profile for CONSULTANT. */
    public record RaiseRequest(String kind, String severity, String subjectType, Long subjectId, String title, String detail) {}
}
