package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.TalentInterviewEvent;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to the TalentInterviewEvent rows: every method takes the organization id first. */
public interface TalentInterviewEventRepository extends Repository<TalentInterviewEvent, Long> {
    <S extends TalentInterviewEvent> S save(S entity);

    <S extends TalentInterviewEvent> S saveAndFlush(S entity);

    void flush();

    <S extends TalentInterviewEvent> List<S> saveAll(Iterable<S> entities);

    <S extends TalentInterviewEvent> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<TalentInterviewEvent> findByOrgIdAndId(Long orgId, Long id);

    long countByOrgId(Long orgId);

    List<TalentInterviewEvent> findByOrgIdAndInterviewIdOrderByOccurredAtAscIdAsc(Long orgId, Long interviewId);

    boolean existsByOrgIdAndInterviewId(Long orgId, Long interviewId);

    // ---- History retention (X9.15): used ONLY by EnterpriseHistoryRetentionJob, in two steps so no statement reads the table it deletes from. ----

    /** Ids of rows of this organization older than {@code cutoff} that are NOT the newest row of their interview (time, then id): what the retention window may delete. */
    @Query(
        "select e.id from TalentInterviewEvent e where e.orgId = :orgId and e.occurredAt < :cutoff and exists " +
        "(select 1 from TalentInterviewEvent n where n.orgId = e.orgId and n.interviewId = e.interviewId and (n.occurredAt > e.occurredAt or (n.occurredAt = e.occurredAt and n.id > e.id))) order by e.id"
    )
    List<Long> purgeableIds(@Param("orgId") Long orgId, @Param("cutoff") java.time.Instant cutoff, Pageable page);

    /** Deletes exactly these rows of this organization; the retention job only. */
    @Modifying
    @Query("delete from TalentInterviewEvent e where e.orgId = :orgId and e.id in :ids")
    int deleteByOrgIdAndIdIn(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);
}
