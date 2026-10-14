package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktTask;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Org-scoped access to {@code mkt_task}: every method takes the organization id first. The scoped queries take the caller's reach as {@code wide} (ORG scope
 * sees every task) plus {@code ids} (their visible consultants, never empty: callers pass a sentinel) and {@code me}: a narrower caller only reads the tasks
 * they OWN, and only those about a consultant they may see (or about none).
 */
public interface MktTaskRepository extends Repository<MktTask, Long> {

    Optional<MktTask> findByOrgIdAndId(Long orgId, Long id);

    long countByOrgId(Long orgId);

    List<MktTask> findByOrgId(Long orgId);

    /** Open tasks plus the ones completed since {@code since}: everything the board's tabs, KPIs and sparklines read, soonest due first. */
    @Query("select t from MktTask t where t.orgId = :orgId and (:wide = true or (t.ownerMemberId = :me and (t.consultantId is null or t.consultantId in :ids))) and (t.status <> 'COMPLETED' or t.completedAt >= :since) order by t.dueAt asc, t.id asc")
    List<MktTask> findVisibleOpenOrCompletedSince(
        @Param("orgId") Long orgId, @Param("wide") boolean wide, @Param("ids") Collection<Long> ids, @Param("me") Long me, @Param("since") Instant since
    );

    /** Every visible task (any status) due in {@code [from, to)}: the Calendar's month. */
    @Query("select t from MktTask t where t.orgId = :orgId and (:wide = true or (t.ownerMemberId = :me and (t.consultantId is null or t.consultantId in :ids))) and t.dueAt >= :from and t.dueAt < :to order by t.dueAt asc, t.id asc")
    List<MktTask> findVisibleDueBetween(
        @Param("orgId") Long orgId, @Param("wide") boolean wide, @Param("ids") Collection<Long> ids, @Param("me") Long me, @Param("from") Instant from, @Param("to") Instant to
    );

    <S extends MktTask> S save(S entity);

    void deleteByOrgIdAndId(Long orgId, Long id);
}
