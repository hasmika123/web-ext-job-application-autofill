package com.dossier.api.repository.ent.mgmt;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Read-only rows behind the Marketing Manager's Pipeline board (MM-08). Every query names the organization first and takes the team's consultants as ids;
 * {@code all} means an organization-wide caller (the id list is then ignored; pass a placeholder, never an empty list). Names of consultants, jobs and clients and
 * dates only: nothing here reads a note, a rate, a contact or resume content.
 */
public interface MgmtPipelineRepository extends Repository<MktOpportunity, Long> {

    /**
     * Every opportunity of the team's consultants with the time of its latest timeline line:
     * {@code [matchId, consultantId, consultantName, requirementId, jobTitle, clientId, clientName, state, priority, ownerMemberId, createdAt, updatedAt, lastEventAt]}.
     * The id of an opportunity is its requirement_match id.
     */
    @Query(
        "select m.id, m.consultantId, p.displayName, m.requirementId, r.title, r.clientId, cl.name, o.state, o.priority, o.ownerMemberId, o.createdAt, o.updatedAt, max(e.occurredAt) "
            + "from MktOpportunity o join RequirementMatch m on m.orgId = o.orgId and m.id = o.matchId "
            + "join ClientRequirement r on r.orgId = m.orgId and r.id = m.requirementId "
            + "join ConsultantProfile p on p.orgId = m.orgId and p.id = m.consultantId "
            + "left join ClientAccount cl on cl.orgId = r.orgId and cl.id = r.clientId "
            + "left join MktOpportunityEvent e on e.orgId = o.orgId and e.opportunityId = o.id "
            + "where o.orgId = :orgId and (:all = true or m.consultantId in :ids) "
            + "group by m.id, m.consultantId, p.displayName, m.requirementId, r.title, r.clientId, cl.name, o.state, o.priority, o.ownerMemberId, o.createdAt, o.updatedAt"
    )
    List<Object[]> cards(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids);

    /** Applications of the team's consultants that have reached an interview or an offer: {@code [consultantId, requirementId, stage]}. */
    @Query(
        "select a.consultantId, a.requirementId, a.stage from TalentApplication a where a.orgId = :orgId and (:all = true or a.consultantId in :ids) "
            + "and a.requirementId is not null and a.stage in ('INTERVIEWING', 'OFFER')"
    )
    List<Object[]> advancedApplications(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids);

    /** Applications of the team's consultants recorded as reaching an offer in {@code [from, to)}. */
    @Query(
        "select count(e) from TalentApplicationEvent e where e.orgId = :orgId and e.eventType in ('CREATED', 'STAGE_CHANGE') and e.toStage = 'OFFER' "
            + "and e.occurredAt >= :from and e.occurredAt < :to "
            + "and (:all = true or e.applicationId in (select a.id from TalentApplication a where a.orgId = :orgId and a.consultantId in :ids))"
    )
    long countOffers(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to);
}
