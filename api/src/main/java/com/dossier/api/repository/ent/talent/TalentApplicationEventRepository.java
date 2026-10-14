package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code talent_application_event}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface TalentApplicationEventRepository extends Repository<TalentApplicationEvent, Long> {
    <S extends TalentApplicationEvent> S save(S entity);

    <S extends TalentApplicationEvent> S saveAndFlush(S entity);

    Optional<TalentApplicationEvent> findByOrgIdAndId(Long orgId, Long id);

    List<TalentApplicationEvent> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<TalentApplicationEvent> findByOrgIdAndApplicationIdOrderByOccurredAtAsc(Long orgId, Long applicationId);

    List<TalentApplicationEvent> findTop20ByOrgIdOrderByOccurredAtDesc(Long orgId);

    long countByOrgIdAndEventTypeAndToStageAndOccurredAtBetween(Long orgId, String eventType, String toStage, Instant from, Instant to);

}
