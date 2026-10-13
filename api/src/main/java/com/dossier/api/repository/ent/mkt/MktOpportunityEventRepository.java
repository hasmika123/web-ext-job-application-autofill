package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code mkt_opportunity_event}: every method takes the organization id first. */
public interface MktOpportunityEventRepository extends JpaRepository<MktOpportunityEvent, Long> {

    String FEED =
        "select new com.dossier.api.repository.ent.mkt.MktEventRow(e.id, m.id, m.consultantId, p.displayName, e.kind, e.text, r.title, c.name, e.actorMemberId, e.occurredAt) "
            + "from MktOpportunityEvent e "
            + "join MktOpportunity o on o.orgId = e.orgId and o.id = e.opportunityId "
            + "join RequirementMatch m on m.orgId = o.orgId and m.id = o.matchId "
            + "join ClientRequirement r on r.orgId = m.orgId and r.id = m.requirementId "
            + "join ClientAccount c on c.orgId = r.orgId and c.id = r.clientId "
            + "join ConsultantProfile p on p.orgId = m.orgId and p.id = m.consultantId "
            + "where e.orgId = :orgId";

    long countByOrgId(Long orgId);

    List<MktOpportunityEvent> findByOrgIdAndOpportunityIdOrderByOccurredAtDesc(Long orgId, Long opportunityId);

    /** Newest events of the whole organization (an ORG-scope caller). */
    @Query(FEED + " order by e.occurredAt desc, e.id desc")
    List<MktEventRow> recent(@Param("orgId") Long orgId, Pageable page);

    /** Newest events about the given consultants only (the caller's scope; never an empty collection). */
    @Query(FEED + " and m.consultantId in :consultantIds order by e.occurredAt desc, e.id desc")
    List<MktEventRow> recentForConsultants(@Param("orgId") Long orgId, @Param("consultantIds") Collection<Long> consultantIds, Pageable page);

    /** The events of one opportunity, as feed rows. */
    @Query(FEED + " and m.id = :matchId order by e.occurredAt desc, e.id desc")
    List<MktEventRow> forMatch(@Param("orgId") Long orgId, @Param("matchId") Long matchId, Pageable page);
}
