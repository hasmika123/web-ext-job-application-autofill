package com.dossier.api.service.dto.org;

import java.time.Instant;
import java.util.List;

/**
 * {@code GET /api/orgs/{orgId}/overview}: the numbers behind the org dashboard (O2.7), live and consent-scoped. Seat counts
 * are about seats (every scope); everything under {@code applications} is computed ONLY over members who share at least a
 * SUMMARY with the org, so it is counts and stages, never an employer name, a role title or a document. A support owner sees
 * the numbers of their own members only.
 *
 * @param seats        live seats by state
 * @param groups       departments, cohorts and teams
 * @param applications progress of the members who share (see above)
 * @param recent       the org's own audit trail, newest first, for roles that may read it ({@code audit.view})
 */
public record OrgOverviewDTO(Seats seats, long groups, Applications applications, List<Recent> recent) {

    /**
     * @param total   ACTIVE + INVITED + SUSPENDED seats
     * @param sharing ACTIVE members who share a SUMMARY or more (the denominator of every "of N sharing")
     */
    public record Seats(long total, long active, long invited, long sharing) {}

    /**
     * @param submitted30d       applications that became APPLIED in the last 30 days (by their applied date)
     * @param interviewing       applications currently at INTERVIEW
     * @param offers             applications currently at OFFER
     * @param placedMembers      members who declared an accepted offer
     * @param upcomingInterviews interviews in the future
     * @param pipeline           applications by stage, in pipeline order, zeros included
     */
    public record Applications(long submitted30d, long interviewing, long offers, long placedMembers, long upcomingInterviews, List<Stage> pipeline) {}

    public record Stage(String stage, long count) {}

    /** {@code action} is an {@code OrgAuditService} key; the web words it. Who did it is never sent, only whether it was the caller. */
    public record Recent(Long id, Instant at, String action, String targetType, boolean mine) {}
}
