package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsTask;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_task}: every method takes the organization id first. */
public interface CwsTaskRepository extends Repository<CwsTask, Long> {
    <S extends CwsTask> S save(S entity);

    <S extends CwsTask> S saveAndFlush(S entity);

    void flush();

    <S extends CwsTask> List<S> saveAll(Iterable<S> entities);

    void delete(CwsTask entity);

    Optional<CwsTask> findByOrgIdAndId(Long orgId, Long id);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);

    List<CwsTask> findByOrgIdAndConsultantIdAndStatusNotOrderByDueOnAsc(Long orgId, Long consultantId, String status);
}
