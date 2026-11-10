package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktFollowupEvent;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Activities feed read of {@code mkt_followup_event}, joined to its follow-up. Every method takes the organization id first. */
public interface MktActivityFollowupFeedRepository extends Repository<MktFollowupEvent, Long> {

    /** {id, kind, note, consultantId, clientAccountId, followupTitle, counterpartLabel, followupStatus, byMemberId, occurredAt}, newest first, for the consultants in scope. */
    @Query("select e.id, e.kind, e.note, f.consultantId, f.clientAccountId, f.title, f.counterpartLabel, f.status, e.byMemberId, e.occurredAt "
        + "from MktFollowupEvent e join MktFollowup f on f.orgId = e.orgId and f.id = e.followupId "
        + "where e.orgId = :orgId and (:all = true or f.consultantId in :ids) and e.occurredAt >= :from and e.occurredAt < :to order by e.occurredAt desc, e.id desc")
    List<Object[]> feed(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to, Pageable page);
}
