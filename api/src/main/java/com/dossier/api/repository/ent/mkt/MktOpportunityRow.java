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
    Long assignedMarketerId
) {}
