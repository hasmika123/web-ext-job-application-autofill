package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPrepAnswer;
import java.util.Collection;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_prep_answer}: every method takes the organization id first. */
public interface CwsPrepAnswerRepository extends Repository<CwsPrepAnswer, Long> {
    <S extends CwsPrepAnswer> S save(S entity);

    <S extends CwsPrepAnswer> S saveAndFlush(S entity);

    void flush();

    <S extends CwsPrepAnswer> List<S> saveAll(Iterable<S> entities);

    void delete(CwsPrepAnswer entity);

    List<CwsPrepAnswer> findByOrgIdAndSessionIdOrderByPositionAsc(Long orgId, Long sessionId);

    List<CwsPrepAnswer> findByOrgIdAndSessionIdIn(Long orgId, Collection<Long> sessionIds);

    long countByOrgId(Long orgId);
}
