package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.TalentInterviewEvent;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

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
}
