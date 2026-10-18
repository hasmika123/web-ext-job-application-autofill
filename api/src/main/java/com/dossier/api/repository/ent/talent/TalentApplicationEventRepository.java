package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code talent_application_event}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface TalentApplicationEventRepository extends Repository<TalentApplicationEvent, Long> {
    <S extends TalentApplicationEvent> S save(S entity);

    <S extends TalentApplicationEvent> S saveAndFlush(S entity);

    void flush();

    <S extends TalentApplicationEvent> List<S> saveAll(Iterable<S> entities);

    <S extends TalentApplicationEvent> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<TalentApplicationEvent> findByOrgIdAndId(Long orgId, Long id);

    List<TalentApplicationEvent> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<TalentApplicationEvent> findByOrgIdAndApplicationIdOrderByOccurredAtAsc(Long orgId, Long applicationId);

    List<TalentApplicationEvent> findTop20ByOrgIdOrderByOccurredAtDesc(Long orgId);

    long countByOrgIdAndEventTypeAndToStageAndOccurredAtBetween(Long orgId, String eventType, String toStage, Instant from, Instant to);

    // ---- History retention (X9.15): used ONLY by EnterpriseHistoryRetentionJob, in two steps so no statement reads the table it deletes from. ----

    /** Ids of rows of this organization older than {@code cutoff} that are NOT the newest row of their application (time, then id): what the retention window may delete. */
    @Query(
        "select e.id from TalentApplicationEvent e where e.orgId = :orgId and e.occurredAt < :cutoff and exists " +
        "(select 1 from TalentApplicationEvent n where n.orgId = e.orgId and n.applicationId = e.applicationId and (n.occurredAt > e.occurredAt or (n.occurredAt = e.occurredAt and n.id > e.id))) order by e.id"
    )
    List<Long> purgeableIds(@Param("orgId") Long orgId, @Param("cutoff") Instant cutoff, Pageable page);

    /** Deletes exactly these rows of this organization; the retention job only. */
    @Modifying
    @Query("delete from TalentApplicationEvent e where e.orgId = :orgId and e.id in :ids")
    int deleteByOrgIdAndIdIn(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

}
