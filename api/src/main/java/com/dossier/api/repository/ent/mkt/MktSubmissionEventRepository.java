package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktSubmissionEvent;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code mkt_submission_event}: every method takes the organization id first. */
public interface MktSubmissionEventRepository extends Repository<MktSubmissionEvent, Long> {
    long countByOrgId(Long orgId);

    List<MktSubmissionEvent> findByOrgIdAndSubmissionIdInOrderByOccurredAtAsc(Long orgId, Collection<Long> submissionIds);

    List<MktSubmissionEvent> findByOrgIdAndSubmissionIdOrderByOccurredAtAsc(Long orgId, Long submissionId);

    <S extends MktSubmissionEvent> S save(S entity);

    // ---- History retention (X9.15): used ONLY by EnterpriseHistoryRetentionJob, in two steps so no statement reads the table it deletes from. ----

    /** Ids of rows of this organization older than {@code cutoff} that are NOT the newest row of their submission (time, then id): what the retention window may delete. */
    @Query(
        "select e.id from MktSubmissionEvent e where e.orgId = :orgId and e.occurredAt < :cutoff and exists " +
        "(select 1 from MktSubmissionEvent n where n.orgId = e.orgId and n.submissionId = e.submissionId and (n.occurredAt > e.occurredAt or (n.occurredAt = e.occurredAt and n.id > e.id))) order by e.id"
    )
    List<Long> purgeableIds(@Param("orgId") Long orgId, @Param("cutoff") java.time.Instant cutoff, Pageable page);

    /** Deletes exactly these rows of this organization; the retention job only. */
    @Modifying
    @Query("delete from MktSubmissionEvent e where e.orgId = :orgId and e.id in :ids")
    int deleteByOrgIdAndIdIn(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);
}
