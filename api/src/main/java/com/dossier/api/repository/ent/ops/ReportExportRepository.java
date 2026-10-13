package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.ReportExport;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code report_export}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface ReportExportRepository extends Repository<ReportExport, Long> {
    <S extends ReportExport> S save(S entity);

    <S extends ReportExport> S saveAndFlush(S entity);

    void flush();

    <S extends ReportExport> List<S> saveAll(Iterable<S> entities);

    <S extends ReportExport> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<ReportExport> findByOrgIdAndId(Long orgId, Long id);

    List<ReportExport> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    Page<ReportExport> findByOrgIdOrderByRequestedAtDesc(Long orgId, Pageable pageable);

    List<ReportExport> findByOrgIdAndDefinitionIdOrderByRequestedAtDesc(Long orgId, Long definitionId);

    long countByOrgIdAndStatus(Long orgId, String status);
}
