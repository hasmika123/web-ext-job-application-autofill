package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktInterviewEvent;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Activities feed read of {@code mkt_interview_event}, joined to its interview. Every method takes the organization id first. */
public interface MktActivityInterviewFeedRepository extends Repository<MktInterviewEvent, Long> {

    /** {id, kind, detail, consultantId, clientId, roundLabel, actorMemberId, occurredAt}, newest first, for the consultants in scope. */
    @Query("select e.id, e.kind, e.detail, i.consultantId, i.clientId, i.roundLabel, e.actorMemberId, e.occurredAt "
        + "from MktInterviewEvent e join TalentInterview i on i.orgId = e.orgId and i.id = e.interviewId "
        + "where e.orgId = :orgId and (:all = true or i.consultantId in :ids) and e.occurredAt >= :from and e.occurredAt < :to order by e.occurredAt desc, e.id desc")
    List<Object[]> feed(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to, Pageable page);
}
