package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code mkt_opportunity} and the joined read model of the Opportunities page: every method takes the organization id first. */
public interface MktOpportunityRepository extends Repository<MktOpportunity, Long> {

    String ROW =
        "select new com.dossier.api.repository.ent.mkt.MktOpportunityRow("
            + "m.id, m.consultantId, p.displayName, m.requirementId, r.title, r.location, r.workMode, r.status, r.clientId, c.name, "
            + "m.score, m.reason, m.status, m.assignedAt, m.createdAt, "
            + "o.id, o.interest, o.ownerMemberId, o.nextActionAt, o.lastResponseAt, o.interestRequestedAt, o.updatedAt, a.marketerMemberId) "
            + "from RequirementMatch m "
            + "join ClientRequirement r on r.orgId = m.orgId and r.id = m.requirementId "
            + "join ClientAccount c on c.orgId = r.orgId and c.id = r.clientId "
            + "join ConsultantProfile p on p.orgId = m.orgId and p.id = m.consultantId "
            + "left join MktOpportunity o on o.orgId = m.orgId and o.matchId = m.id "
            + "left join MarketerAssignment a on a.orgId = m.orgId and a.consultantId = m.consultantId "
            + "where m.orgId = :orgId and m.status in ('ASSIGNED', 'SUGGESTED')";

    Optional<MktOpportunity> findByOrgIdAndId(Long orgId, Long id);

    /** {@code SELECT ... FOR UPDATE}: the latest committed row, attached to this persistence context (see {@code RequirementMatchRepository.lockByOrgIdAndId}). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from MktOpportunity o where o.orgId = :orgId and o.id = :id")
    Optional<MktOpportunity> lockByOrgIdAndId(@Param("orgId") Long orgId, @Param("id") Long id);

    Optional<MktOpportunity> findByOrgIdAndMatchId(Long orgId, Long matchId);

    List<MktOpportunity> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    /** Every ASSIGNED / SUGGESTED opportunity of the organization (the service narrows it to the caller's consultants). */
    @Query(ROW)
    List<MktOpportunityRow> findRows(@Param("orgId") Long orgId);

    @Query(ROW + " and m.id = :matchId")
    Optional<MktOpportunityRow> findRow(@Param("orgId") Long orgId, @Param("matchId") Long matchId);

    @Query("select new com.dossier.api.repository.ent.mkt.MktResumeFact(r.consultantId, r.approvalStatus, r.primaryForOrg, r.updatedAt) from OrgResume r where r.orgId = :orgId")
    List<MktResumeFact> findResumeFacts(@Param("orgId") Long orgId);

    /** The match of a consultant and a job, whatever its status (the add-opportunity duplicate guard). */
    @Query("select m from RequirementMatch m where m.orgId = :orgId and m.requirementId = :requirementId and m.consultantId = :consultantId")
    Optional<RequirementMatch> findMatchByPair(@Param("orgId") Long orgId, @Param("requirementId") Long requirementId, @Param("consultantId") Long consultantId);

    /** Locked ({@code FOR UPDATE}) opportunities of one job in the given states: the close-on-job-close cascade changes them. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
        "select o from MktOpportunity o join RequirementMatch m on m.orgId = o.orgId and m.id = o.matchId "
            + "where o.orgId = :orgId and m.requirementId = :requirementId and o.state in :states order by o.id"
    )
    List<MktOpportunity> lockByRequirementAndStates(
        @Param("orgId") Long orgId,
        @Param("requirementId") Long requirementId,
        @Param("states") java.util.Collection<String> states
    );

    <S extends MktOpportunity> S save(S entity);
}
