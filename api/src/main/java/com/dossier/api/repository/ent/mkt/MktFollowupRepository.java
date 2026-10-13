package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktFollowup;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Org-scoped access to {@code mkt_followup}: every method takes the organization id first. The scoped queries take the caller's visible consultants as
 * {@code all} (ORG scope sees everyone) plus {@code ids} (never empty: callers pass a sentinel list), so a marketer only ever reads their own consultants' rows.
 */
public interface MktFollowupRepository extends JpaRepository<MktFollowup, Long> {

    Optional<MktFollowup> findByOrgIdAndId(Long orgId, Long id);

    long countByOrgId(Long orgId);

    /** Open items (not COMPLETED, not WAITING) due in {@code [from, to)}, soonest first: the Today and Upcoming buckets. */
    @Query("select f from MktFollowup f where f.orgId = :orgId and (:all = true or f.consultantId in :ids) and f.status not in ('COMPLETED','WAITING') and f.dueAt >= :from and f.dueAt < :to order by f.dueAt asc, f.id asc")
    List<MktFollowup> findOpenDueBetween(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to);

    /** Overdue (derived): not COMPLETED and due before {@code now}, oldest first. */
    @Query("select f from MktFollowup f where f.orgId = :orgId and (:all = true or f.consultantId in :ids) and f.status <> 'COMPLETED' and f.dueAt < :now order by f.dueAt asc, f.id asc")
    List<MktFollowup> findOverdue(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("now") Instant now);

    @Query("select f from MktFollowup f where f.orgId = :orgId and (:all = true or f.consultantId in :ids) and f.status = 'COMPLETED' and f.completedAt >= :from and f.completedAt < :to order by f.completedAt desc, f.id desc")
    List<MktFollowup> findCompletedBetween(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to);

    @Query("select f from MktFollowup f where f.orgId = :orgId and (:all = true or f.consultantId in :ids) and f.status = 'WAITING' order by f.dueAt asc, f.id asc")
    List<MktFollowup> findWaiting(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids);

    /** Every item due in {@code [from, to)} whatever its status: the daily buckets of the sparklines and the same-moment-last-week comparison. */
    @Query("select count(f) from MktFollowup f where f.orgId = :orgId and (:all = true or f.consultantId in :ids) and f.dueAt >= :from and f.dueAt < :to")
    long countDueBetween(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to);

    @Query("select count(f) from MktFollowup f where f.orgId = :orgId and (:all = true or f.consultantId in :ids) and f.status = 'COMPLETED' and f.completedAt >= :from and f.completedAt < :to")
    long countCompletedBetween(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to);

    /** Items that were overdue at {@code at}: due before it and not completed by then (completed later or never). */
    @Query("select count(f) from MktFollowup f where f.orgId = :orgId and (:all = true or f.consultantId in :ids) and f.createdAt <= :at and f.dueAt < :at and (f.completedAt is null or f.completedAt > :at)")
    long countOverdueAt(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("at") Instant at);

    @Query("select count(f) from MktFollowup f where f.orgId = :orgId and (:all = true or f.consultantId in :ids) and f.status = 'WAITING'")
    long countWaiting(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids);

    /** Items sent and waiting on a reply whose last change falls in {@code [from, to)} (the Insights window). */
    @Query("select count(f) from MktFollowup f where f.orgId = :orgId and (:all = true or f.consultantId in :ids) and f.status = 'WAITING' and f.updatedAt >= :from and f.updatedAt < :to")
    long countWaitingChangedBetween(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to);
}
