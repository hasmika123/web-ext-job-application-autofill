package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsTaskDetail;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_task_detail}: every method takes the organization id first. */
public interface CwsTaskDetailRepository extends Repository<CwsTaskDetail, Long> {
    <S extends CwsTaskDetail> S save(S entity);

    <S extends CwsTaskDetail> S saveAndFlush(S entity);

    void flush();

    <S extends CwsTaskDetail> List<S> saveAll(Iterable<S> entities);

    void delete(CwsTaskDetail entity);

    List<CwsTaskDetail> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    Optional<CwsTaskDetail> findByOrgIdAndTaskId(Long orgId, Long taskId);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
