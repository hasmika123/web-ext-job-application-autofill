package com.dossier.api.repository.ent.mgmt;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * The read-only facts the escalation rules look at (MM-04). Every query names the organization first, returns plain rows and writes nothing; the names are
 * display names and job titles only (metadata), never a rate, a contact or resume content.
 */
public interface MgmtRulesRepository extends Repository<MktOpportunity, Long> {

    /**
     * Assigned opportunities in these states with the time of their latest timeline line (their creation when they have none):
     * {@code [opportunityId, consultantId, ownerMemberId, lastActivityAt, createdAt, jobTitle, consultantName]}.
     */
    @Query(
        "select o.id, m.consultantId, o.ownerMemberId, max(e.occurredAt), o.createdAt, r.title, p.displayName "
            + "from MktOpportunity o join RequirementMatch m on m.orgId = o.orgId and m.id = o.matchId "
            + "join ClientRequirement r on r.orgId = m.orgId and r.id = m.requirementId "
            + "join ConsultantProfile p on p.orgId = m.orgId and p.id = m.consultantId "
            + "left join MktOpportunityEvent e on e.orgId = o.orgId and e.opportunityId = o.id "
            + "where o.orgId = :orgId and o.state in :states and m.status = 'ASSIGNED' "
            + "group by o.id, m.consultantId, o.ownerMemberId, o.createdAt, r.title, p.displayName"
    )
    List<Object[]> openOpportunityActivity(@Param("orgId") Long orgId, @Param("states") Collection<String> states);

    /**
     * Opportunities where the consultant asked a question that has no answer yet, with when they asked (the latest INFO_REQUESTED line; the row's last change when it
     * has none): {@code [opportunityId, consultantId, ownerMemberId, askedAt, updatedAt, jobTitle, consultantName]}.
     */
    @Query(
        "select o.id, m.consultantId, o.ownerMemberId, max(e.occurredAt), o.updatedAt, r.title, p.displayName "
            + "from MktOpportunity o join RequirementMatch m on m.orgId = o.orgId and m.id = o.matchId "
            + "join ClientRequirement r on r.orgId = m.orgId and r.id = m.requirementId "
            + "join ConsultantProfile p on p.orgId = m.orgId and p.id = m.consultantId "
            + "left join MktOpportunityEvent e on e.orgId = o.orgId and e.opportunityId = o.id and e.kind = 'INFO_REQUESTED' "
            + "where o.orgId = :orgId and o.state = 'NEEDS_INFO' and o.infoRequest is not null and o.infoRequest <> '' and (o.infoAnswer is null or o.infoAnswer = '') "
            + "group by o.id, m.consultantId, o.ownerMemberId, o.updatedAt, r.title, p.displayName"
    )
    List<Object[]> unansweredQuestions(@Param("orgId") Long orgId);
}
