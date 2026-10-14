package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktResumeEvent;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Activities feed read of {@code mkt_resume_event}. Every method takes the organization id first. */
public interface MktActivityResumeFeedRepository extends Repository<MktResumeEvent, Long> {

    /** {id, kind, versionNo, detail, consultantId, actorMemberId, occurredAt} in {@code [from, to)}, newest first, for the consultants in scope. */
    @Query("select e.id, e.kind, e.versionNo, e.detail, e.consultantId, e.actorMemberId, e.occurredAt from MktResumeEvent e "
        + "where e.orgId = :orgId and (:all = true or e.consultantId in :ids) and e.occurredAt >= :from and e.occurredAt < :to order by e.occurredAt desc, e.id desc")
    List<Object[]> feed(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to, Pageable page);
}
