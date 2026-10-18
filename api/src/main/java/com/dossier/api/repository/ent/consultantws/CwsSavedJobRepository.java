package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsSavedJob;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_saved_job}: every method takes the organization id first. */
public interface CwsSavedJobRepository extends Repository<CwsSavedJob, Long> {
    <S extends CwsSavedJob> S save(S entity);

    <S extends CwsSavedJob> S saveAndFlush(S entity);

    void flush();

    <S extends CwsSavedJob> List<S> saveAll(Iterable<S> entities);

    void delete(CwsSavedJob entity);

    List<CwsSavedJob> findByOrgIdAndConsultantIdOrderByCreatedAtDesc(Long orgId, Long consultantId);

    Optional<CwsSavedJob> findByOrgIdAndConsultantIdAndRequirementId(Long orgId, Long consultantId, Long requirementId);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
