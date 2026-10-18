package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsTask;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/**
 * Extra org-and-consultant-scoped reads of {@code cws_task} for the Tasks page (the older {@link CwsTaskRepository} is left as it was).
 * Every method takes the organization id first and the consultant id, so a consultant only ever reaches their own rows.
 */
public interface CwsTaskAccessRepository extends Repository<CwsTask, Long> {
    <S extends CwsTask> S save(S entity);

    <S extends CwsTask> S saveAndFlush(S entity);

    void flush();

    <S extends CwsTask> List<S> saveAll(Iterable<S> entities);

    void delete(CwsTask entity);

    List<CwsTask> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    Optional<CwsTask> findByOrgIdAndConsultantIdAndId(Long orgId, Long consultantId, Long id);

    Optional<CwsTask> findByOrgIdAndId(Long orgId, Long id);
}
