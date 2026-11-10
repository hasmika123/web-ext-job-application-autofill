package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.JobDataEvent;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * The job data ledger (docs/enterprise-v2/61 section 3): APPEND-ONLY. {@code save} and reads, nothing else: no delete, no update, no
 * {@code JpaRepository} to inherit one from, and no flush/saveAll (a test keeps it so, like the consent history). Every read names the organization
 * first.
 */
public interface JobDataEventRepository extends Repository<JobDataEvent, Long> {

    <S extends JobDataEvent> S save(S event);

    /** The ledger of one job, newest first. */
    Page<JobDataEvent> findByOrgIdAndRequirementIdOrderByOccurredAtDescIdDesc(Long orgId, Long requirementId, Pageable pageable);

    /** The ledger of one job, oldest first (the audit page shows the timeline in order). */
    List<JobDataEvent> findByOrgIdAndRequirementIdOrderByOccurredAtAscIdAsc(Long orgId, Long requirementId);

    /** Every event of the organization in a time window, newest first. */
    @Query("select e from JobDataEvent e where e.orgId = :orgId and e.occurredAt >= :from and e.occurredAt < :to order by e.occurredAt desc, e.id desc")
    Page<JobDataEvent> findByOrgIdAndWindow(@Param("orgId") Long orgId, @Param("from") Instant from, @Param("to") Instant to, Pageable pageable);

    /** The events of several jobs, oldest first (one query for a page of jobs). */
    @Query("select e from JobDataEvent e where e.orgId = :orgId and e.requirementId in :requirementIds order by e.occurredAt asc, e.id asc")
    List<JobDataEvent> findByOrgIdAndRequirementIds(@Param("orgId") Long orgId, @Param("requirementIds") Collection<Long> requirementIds);

    /** The jobs that have an event in the window, as job ids, newest activity first (the audit page lists jobs, then their events). */
    @Query(
        value = "select e.requirementId from JobDataEvent e where e.orgId = :orgId and e.occurredAt >= :from and e.occurredAt < :to group by e.requirementId order by max(e.occurredAt) desc, e.requirementId desc",
        countQuery = "select count(distinct e.requirementId) from JobDataEvent e where e.orgId = :orgId and e.occurredAt >= :from and e.occurredAt < :to"
    )
    Page<Long> findJobIdsWithEvents(@Param("orgId") Long orgId, @Param("from") Instant from, @Param("to") Instant to, Pageable pageable);

    long countByOrgIdAndRequirementId(Long orgId, Long requirementId);

    long countByOrgIdAndRequirementIdAndEventType(Long orgId, Long requirementId, String eventType);
}
