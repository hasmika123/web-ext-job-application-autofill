package com.dossier.api.repository.ent.mkt;

import java.time.Instant;

/** One opportunity as the Opportunities page reads it: a requirement_match joined to its job, client, consultant and (optional) marketing state. Pure data. */
public record MktOpportunityRow(
    Long matchId,
    Long consultantId,
    String consultantName,
    Long requirementId,
    String jobTitle,
    String location,
    String workMode,
    String requirementStatus,
    Long clientId,
    String clientName,
    Integer score,
    String reason,
    String matchStatus,
    Instant assignedAt,
    Instant createdAt,
    Long oppId,
    String interest,
    Long ownerMemberId,
    Instant nextActionAt,
    Instant lastResponseAt,
    Instant interestRequestedAt,
    Instant oppUpdatedAt,
    Long assignedMarketerId,
    /** The marketing state (ASSIGNED, VIEWED, INTERESTED, NEEDS_INFO, DECLINED, APPLIED, CLOSED); null while there is no overlay row yet. */
    String oppState
) {
    /** Without the state (tests and callers that do not need it). */
    public MktOpportunityRow(
        Long matchId, Long consultantId, String consultantName, Long requirementId, String jobTitle, String location, String workMode, String requirementStatus, Long clientId, String clientName,
        Integer score, String reason, String matchStatus, Instant assignedAt, Instant createdAt, Long oppId, String interest, Long ownerMemberId, Instant nextActionAt, Instant lastResponseAt,
        Instant interestRequestedAt, Instant oppUpdatedAt, Long assignedMarketerId
    ) {
        this(matchId, consultantId, consultantName, requirementId, jobTitle, location, workMode, requirementStatus, clientId, clientName, score, reason, matchStatus, assignedAt, createdAt, oppId, interest,
            ownerMemberId, nextActionAt, lastResponseAt, interestRequestedAt, oppUpdatedAt, assignedMarketerId, null);
    }
}
