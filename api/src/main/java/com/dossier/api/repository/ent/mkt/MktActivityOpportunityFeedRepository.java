package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Activities feed read of {@code mkt_opportunity_event}, joined to its match, job and client. Every method takes the organization id first. */
public interface MktActivityOpportunityFeedRepository extends Repository<MktOpportunityEvent, Long> {

    /** {id, kind, text, consultantId, clientId, jobTitle, actorMemberId, occurredAt}, newest first, for the consultants in scope. */
    @Query("select e.id, e.kind, e.text, m.consultantId, r.clientId, r.title, e.actorMemberId, e.occurredAt "
        + "from MktOpportunityEvent e join MktOpportunity o on o.orgId = e.orgId and o.id = e.opportunityId "
        + "join RequirementMatch m on m.orgId = o.orgId and m.id = o.matchId "
        + "join ClientRequirement r on r.orgId = m.orgId and r.id = m.requirementId "
        + "where e.orgId = :orgId and (:all = true or m.consultantId in :ids) and e.occurredAt >= :from and e.occurredAt < :to order by e.occurredAt desc, e.id desc")
    List<Object[]> feed(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to, Pageable page);
}
