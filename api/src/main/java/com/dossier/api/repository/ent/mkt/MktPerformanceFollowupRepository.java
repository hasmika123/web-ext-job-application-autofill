package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktFollowup;
import java.time.Instant;
import java.util.Collection;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Performance board reads of {@code mkt_followup} (completion rate). Every method takes the organization id first; {@code ids} is never empty (sentinel list). */
public interface MktPerformanceFollowupRepository extends Repository<MktFollowup, Long> {

    /** Items that fell due in {@code [from, to)}, whatever their status. */
    @Query("select count(f) from MktFollowup f where f.orgId = :orgId and (:all = true or f.consultantId in :ids) and f.dueAt >= :from and f.dueAt < :to")
    long countDue(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to);

    /** Of those, the ones that are COMPLETED. */
    @Query("select count(f) from MktFollowup f where f.orgId = :orgId and (:all = true or f.consultantId in :ids) and f.status = 'COMPLETED' and f.dueAt >= :from and f.dueAt < :to")
    long countDueAndCompleted(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to);
}
