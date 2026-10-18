package com.dossier.api.repository.ent.consultant;

import java.time.Instant;
import java.time.LocalDate;

/**
 * One assigned opportunity as the consultant sees it: the {@code mkt_opportunity} overlay, the {@code requirement_match} that assigned it and
 * the job, in one row. Deliberately carries NO rate, NO client contact, NO other consultant and NO {@code owner_member_id} (doc 60 section 4): what
 * is not selected here can not leak from a mapper later. {@code assignedByMemberId} is the marketer who assigned the pair.
 */
public record ConOpportunityRow(
    Long opportunityId,
    Long matchId,
    Long consultantId,
    Long jobId,
    String state,
    String marketerNote,
    String priority,
    LocalDate dueOn,
    String infoRequest,
    String infoAnswer,
    Instant appliedAt,
    long version,
    Instant assignedAt,
    Long assignedByMemberId,
    String title,
    String employer,
    String location,
    String workMode,
    String employmentLabel,
    String payLabel,
    String jobUrl,
    String atsPlatform,
    String externalJobId,
    LocalDate postedOn,
    String jobStatus,
    /** The job's STORED detail level; the page shows the lower of this and the organization's cap ({@code JobDetailMapper}). */
    String detailLevel
) {}
