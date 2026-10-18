package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsJobSource;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_job_source}: every method takes the organization id first. */
public interface CwsJobSourceRepository extends Repository<CwsJobSource, Long> {
    <S extends CwsJobSource> S save(S entity);

    <S extends CwsJobSource> S saveAndFlush(S entity);

    void flush();

    <S extends CwsJobSource> List<S> saveAll(Iterable<S> entities);

    void delete(CwsJobSource entity);

    Optional<CwsJobSource> findByOrgIdAndRequirementId(Long orgId, Long requirementId);

    List<CwsJobSource> findByOrgIdAndRequirementIdIn(Long orgId, Collection<Long> requirementIds);

    long countByOrgId(Long orgId);
}
