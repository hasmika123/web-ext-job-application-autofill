package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.TalentInterview;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code talent_interview}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface TalentInterviewRepository extends Repository<TalentInterview, Long> {
    <S extends TalentInterview> S save(S entity);

    <S extends TalentInterview> S saveAndFlush(S entity);

    void flush();

    <S extends TalentInterview> List<S> saveAll(Iterable<S> entities);

    <S extends TalentInterview> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<TalentInterview> findByOrgIdAndId(Long orgId, Long id);

    List<TalentInterview> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<TalentInterview> findByOrgIdAndScheduledAtBetweenOrderByScheduledAtAsc(Long orgId, Instant from, Instant to);

    long countByOrgIdAndStatusAndScheduledAtBetween(Long orgId, String status, Instant from, Instant to);

    List<TalentInterview> findByOrgIdAndConsultantIdAndStatusAndScheduledAtAfterOrderByScheduledAtAsc(Long orgId, Long consultantId, String status, Instant after);

    List<TalentInterview> findByOrgIdAndApplicationIdOrderByScheduledAtAscIdAsc(Long orgId, Long applicationId);

    long countByOrgIdAndScheduledAtBetween(Long orgId, Instant from, Instant to);

}
