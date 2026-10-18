package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPrepSession;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_prep_session}: every method takes the organization id first. */
public interface CwsPrepSessionRepository extends Repository<CwsPrepSession, Long> {
    <S extends CwsPrepSession> S save(S entity);

    <S extends CwsPrepSession> S saveAndFlush(S entity);

    void flush();

    <S extends CwsPrepSession> List<S> saveAll(Iterable<S> entities);

    void delete(CwsPrepSession entity);

    List<CwsPrepSession> findByOrgIdAndConsultantIdOrderByOccurredAtDesc(Long orgId, Long consultantId);

    Optional<CwsPrepSession> findByOrgIdAndId(Long orgId, Long id);

    long countByOrgId(Long orgId);
}
