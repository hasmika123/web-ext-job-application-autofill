package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.talent.RequirementMatch;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * The read model of the assignment guards (Sprint 2 / B1): what a consultant already holds (live assignments, applications, submissions) and how many
 * consultants hold a posting. Read only; every method names the organization first, so another organization's rows can never count.
 */
public interface PipelineGuardRepository extends Repository<RequirementMatch, Long> {

    /** One thing a consultant already holds, with the identity facts of its job. {@code source} is ASSIGNED, APPLICATION or SUBMISSION. */
    record Prior(
        String source,
        Long requirementId,
        String title,
        String location,
        Long clientId,
        String clientName,
        String urlKey,
        String atsPlatform,
        String externalJobId,
        Instant at
    ) {}

    String PRIOR_FIELDS = "r.id, r.title, r.location, r.clientId, c.name, r.urlKey, r.atsPlatform, r.externalJobId, ";

    /** Live assignments: ASSIGNED matches whose opportunity is not closed or declined (an assignment without an overlay row is live). */
    @Query(
        "select new com.dossier.api.repository.ent.PipelineGuardRepository$Prior('ASSIGNED', " + PRIOR_FIELDS + "coalesce(m.assignedAt, m.createdAt)) "
            + "from RequirementMatch m join ClientRequirement r on r.orgId = m.orgId and r.id = m.requirementId "
            + "join ClientAccount c on c.orgId = r.orgId and c.id = r.clientId "
            + "left join MktOpportunity o on o.orgId = m.orgId and o.matchId = m.id "
            + "where m.orgId = :orgId and m.consultantId = :consultantId and m.status = 'ASSIGNED' and (o.id is null or o.state not in ('CLOSED', 'DECLINED'))"
    )
    List<Prior> liveAssignments(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId);

    /** Applications on the consultant's pipeline, except the ones closed as withdrawn or unanswered. */
    @Query(
        "select new com.dossier.api.repository.ent.PipelineGuardRepository$Prior('APPLICATION', " + PRIOR_FIELDS + "a.createdAt) "
            + "from TalentApplication a join ClientRequirement r on r.orgId = a.orgId and r.id = a.requirementId "
            + "join ClientAccount c on c.orgId = r.orgId and c.id = r.clientId "
            + "where a.orgId = :orgId and a.consultantId = :consultantId and not (a.stage = 'CLOSED' and a.closedReason in ('WITHDRAWN', 'NO_RESPONSE'))"
    )
    List<Prior> applications(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId);

    /** Submission records that are not archived and were not rejected. */
    @Query(
        "select new com.dossier.api.repository.ent.PipelineGuardRepository$Prior('SUBMISSION', " + PRIOR_FIELDS + "s.createdAt) "
            + "from MktSubmission s join ClientRequirement r on r.orgId = s.orgId and r.id = s.requirementId "
            + "join ClientAccount c on c.orgId = r.orgId and c.id = r.clientId "
            + "where s.orgId = :orgId and s.consultantId = :consultantId and s.archivedAt is null and s.status <> 'REJECTED'"
    )
    List<Prior> submissions(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId);

    /** The requirements that are the same posting as this one (same stored link key): the posting captured twice under different rows. */
    @Query("select r.id from ClientRequirement r where r.orgId = :orgId and r.urlKeyHash = :urlKeyHash")
    List<Long> requirementIdsWithUrlKeyHash(@Param("orgId") Long orgId, @Param("urlKeyHash") String urlKeyHash);

    /** How many OTHER consultants hold one of these requirements right now (live assignment). */
    @Query(
        "select count(distinct m.consultantId) from RequirementMatch m left join MktOpportunity o on o.orgId = m.orgId and o.matchId = m.id "
            + "where m.orgId = :orgId and m.requirementId in :requirementIds and m.consultantId <> :consultantId and m.status = 'ASSIGNED' "
            + "and (o.id is null or o.state not in ('CLOSED', 'DECLINED'))"
    )
    long countOtherConsultantsHolding(@Param("orgId") Long orgId, @Param("requirementIds") Collection<Long> requirementIds, @Param("consultantId") Long consultantId);

    /** The consultant's open opportunities: ASSIGNED matches whose overlay is still open (or missing). */
    @Query(
        "select count(m) from RequirementMatch m left join MktOpportunity o on o.orgId = m.orgId and o.matchId = m.id "
            + "where m.orgId = :orgId and m.consultantId = :consultantId and m.status = 'ASSIGNED' "
            + "and (o.id is null or o.state in ('ASSIGNED', 'VIEWED', 'INTERESTED', 'NEEDS_INFO'))"
    )
    long countOpenMatches(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId);
}
