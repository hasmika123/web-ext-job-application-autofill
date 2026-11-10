package com.dossier.api.service.ent.mkt.approvals;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * A manager approval as the Approvals page and the marketer's own list show it: metadata and short notes only. {@code payload} is a safe subset of the held
 * action's arguments (ids, flags, the stated duplicate reason): never resume content, never a rate.
 */
public record ApprovalRequestDTO(
    Long id,
    String kind,
    String subjectType,
    Long subjectId,
    Person consultant,
    Person requestedBy,
    Instant requestedAt,
    String title,
    String note,
    String status,
    Person decidedBy,
    Instant decidedAt,
    String decisionNote,
    Instant expiresAt,
    Map<String, Object> payload
) {
    /** A person as a name to show; {@code id} is the seat id for a member and the profile id for a consultant. */
    public record Person(Long id, String name) {}

    /** A page of requests with the total (the header also carries X-Total-Count). */
    public record Page(List<ApprovalRequestDTO> items, int page, int size, long total, boolean hasMore) {}

    /** The body of a decision: {@code note} is optional for an approval and required (1 to 300 characters) for a rejection. */
    public record DecisionRequest(String note) {}

    /** The body of a marketer's request. */
    public record OpenRequest(String kind, String subjectType, Long subjectId, Long consultantId, String title, String note, Map<String, Object> payload) {}
}
