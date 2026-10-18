package com.dossier.api.repository.ent.mgmt;

import com.dossier.api.domain.ent.mkt.MktActivity;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Read-only counts and rows behind the Marketing Manager's Home and Team pages (MM-06). Every query names the organization first and takes the team's consultants
 * (or marketers) as ids; {@code all} means an organization-wide caller (the id list is then ignored; pass a placeholder, never an empty list). Counts and dates only,
 * plus the activity feed lines the marketers wrote themselves: nothing here reads resume content, a rate or a contact.
 */
public interface MgmtTeamRepository extends Repository<MktOpportunity, Long> {

    /** Assigned opportunities in these states for the team's consultants. */
    @Query(
        "select count(o) from MktOpportunity o join RequirementMatch m on m.orgId = o.orgId and m.id = o.matchId "
            + "where o.orgId = :orgId and o.state in :states and m.status = 'ASSIGNED' and (:all = true or m.consultantId in :ids)"
    )
    long countOpen(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("states") Collection<String> states);

    /** Timeline lines of these kinds in {@code [from, to)} about the team's consultants (assigned, interested, ...). */
    @Query(
        "select count(e) from MktOpportunityEvent e join MktOpportunity o on o.orgId = e.orgId and o.id = e.opportunityId "
            + "join RequirementMatch m on m.orgId = o.orgId and m.id = o.matchId "
            + "where e.orgId = :orgId and e.kind in :kinds and e.occurredAt >= :from and e.occurredAt < :to and (:all = true or m.consultantId in :ids)"
    )
    long countOpportunityEvents(
        @Param("orgId") Long orgId,
        @Param("all") boolean all,
        @Param("ids") Collection<Long> ids,
        @Param("kinds") Collection<String> kinds,
        @Param("from") Instant from,
        @Param("to") Instant to
    );

    /** Packages recorded as submitted by the consultant in {@code [from, to)} (their date of record), not archived. */
    @Query(
        "select count(s) from MktSubmission s where s.orgId = :orgId and s.submittedOn >= :from and s.submittedOn < :to and s.archivedAt is null and (:all = true or s.consultantId in :ids)"
    )
    long countSubmitted(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** Interviews scheduled in {@code [from, to)}, cancelled ones left out. */
    @Query(
        "select count(i) from TalentInterview i where i.orgId = :orgId and i.scheduledAt >= :from and i.scheduledAt < :to and i.status <> 'CANCELLED' and (:all = true or i.consultantId in :ids)"
    )
    long countInterviews(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to);

    /** The latest activity lines about the team's consultants. */
    @Query("select a from MktActivity a where a.orgId = :orgId and (:all = true or a.consultantId in :ids) order by a.occurredAt desc, a.id desc")
    List<MktActivity> latestActivity(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, Pageable page);

    // ---- the Team page ---------------------------------------------------------------------------------------------------------

    /** {@code [requesterMemberId, count]} of PENDING approval requests of these marketers. */
    @Query(
        "select r.requestedByMemberId, count(r) from MktApprovalRequest r where r.orgId = :orgId and r.status = 'PENDING' and r.requestedByMemberId in :ids group by r.requestedByMemberId"
    )
    List<Object[]> pendingApprovalsByRequester(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    /** {@code [marketerMemberId, count]} of live (OPEN or ACKNOWLEDGED) escalations of these marketers. */
    @Query(
        "select e.marketerMemberId, count(e) from MktEscalation e where e.orgId = :orgId and e.status in ('OPEN', 'ACKNOWLEDGED') and e.marketerMemberId in :ids group by e.marketerMemberId"
    )
    List<Object[]> openEscalationsByMarketer(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    /** {@code [actorMemberId, latest occurredAt]} of the activity lines these marketers wrote. */
    @Query("select a.actorMemberId, max(a.occurredAt) from MktActivity a where a.orgId = :orgId and a.actorMemberId in :ids group by a.actorMemberId")
    List<Object[]> lastActivityByActor(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    /** When these consultants were assigned or reassigned (timeline lines since {@code from}). */
    @Query(
        "select e.occurredAt from MktOpportunityEvent e join MktOpportunity o on o.orgId = e.orgId and o.id = e.opportunityId "
            + "join RequirementMatch m on m.orgId = o.orgId and m.id = o.matchId "
            + "where e.orgId = :orgId and e.kind in ('ASSIGNED', 'REASSIGNED') and e.occurredAt >= :from and m.consultantId in :ids"
    )
    List<Instant> assignedAt(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids, @Param("from") Instant from);

    /** The dates these consultants' packages were recorded as submitted since {@code from}. */
    @Query("select s.submittedOn from MktSubmission s where s.orgId = :orgId and s.consultantId in :ids and s.submittedOn >= :from and s.archivedAt is null")
    List<LocalDate> submittedOn(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids, @Param("from") LocalDate from);

    /** When these consultants' interviews are or were scheduled, since {@code from}, cancelled ones left out. */
    @Query("select i.scheduledAt from TalentInterview i where i.orgId = :orgId and i.consultantId in :ids and i.scheduledAt >= :from and i.status <> 'CANCELLED'")
    List<Instant> interviewsAt(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids, @Param("from") Instant from);
}
