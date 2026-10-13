package com.dossier.api.repository.ent.mkt;

import java.time.Instant;

/** One activity-feed line joined to its opportunity's consultant, job and client. Pure data. */
public record MktEventRow(Long id, Long matchId, Long consultantId, String consultantName, String kind, String text, String jobTitle, String clientName, Long actorMemberId, Instant occurredAt) {}
