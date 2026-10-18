package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktActivity;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Org-scoped access to {@code mkt_activity} (the manual "Log Activity" rows). Every method takes the organization id first; the scoped queries take the
 * caller's visible consultants as {@code all} (ORG scope) plus {@code ids} (never empty: callers pass a sentinel list).
 */
public interface MktActivityRepository extends Repository<MktActivity, Long> {

    Optional<MktActivity> findByOrgIdAndId(Long orgId, Long id);

    long countByOrgId(Long orgId);

    /** Manual rows occurring in {@code [from, to)}, newest first. */
    @Query("select a from MktActivity a where a.orgId = :orgId and (:all = true or a.consultantId in :ids) and a.occurredAt >= :from and a.occurredAt < :to order by a.occurredAt desc, a.id desc")
    List<MktActivity> findBetween(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to, Pageable page);

    /** Planned manual rows (status SCHEDULED) in {@code [from, to)}, soonest first: the Upcoming card. */
    @Query("select a from MktActivity a where a.orgId = :orgId and (:all = true or a.consultantId in :ids) and a.status = 'SCHEDULED' and a.occurredAt >= :from and a.occurredAt < :to order by a.occurredAt asc, a.id asc")
    List<MktActivity> findPlanned(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to, Pageable page);

    <S extends MktActivity> S save(S entity);
}
