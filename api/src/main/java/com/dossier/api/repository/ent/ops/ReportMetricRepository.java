package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.ReportMetric;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code report_metric}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface ReportMetricRepository extends Repository<ReportMetric, Long> {
    <S extends ReportMetric> S save(S entity);

    <S extends ReportMetric> S saveAndFlush(S entity);

    void flush();

    <S extends ReportMetric> List<S> saveAll(Iterable<S> entities);

    <S extends ReportMetric> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<ReportMetric> findByOrgIdAndId(Long orgId, Long id);

    List<ReportMetric> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<ReportMetric> findByOrgIdAndDefinitionIdOrderBySortOrderAsc(Long orgId, Long definitionId);
}
