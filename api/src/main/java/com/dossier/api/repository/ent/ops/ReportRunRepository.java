package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.ReportRun;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code report_run}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface ReportRunRepository extends Repository<ReportRun, Long> {
    <S extends ReportRun> S save(S entity);

    <S extends ReportRun> S saveAndFlush(S entity);

    void flush();

    <S extends ReportRun> List<S> saveAll(Iterable<S> entities);

    <S extends ReportRun> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<ReportRun> findByOrgIdAndId(Long orgId, Long id);

    List<ReportRun> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<ReportRun> findByOrgIdAndDefinitionIdOrderByStartedAtDesc(Long orgId, Long definitionId);

    Optional<ReportRun> findFirstByOrgIdAndDefinitionIdOrderByStartedAtDesc(Long orgId, Long definitionId);

    long countByOrgIdAndStatus(Long orgId, String status);
}
