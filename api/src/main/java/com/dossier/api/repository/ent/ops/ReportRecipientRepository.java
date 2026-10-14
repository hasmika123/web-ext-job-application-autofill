package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.ReportRecipient;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code report_recipient}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface ReportRecipientRepository extends Repository<ReportRecipient, Long> {
    <S extends ReportRecipient> S save(S entity);

    <S extends ReportRecipient> S saveAndFlush(S entity);

    void flush();

    <S extends ReportRecipient> List<S> saveAll(Iterable<S> entities);

    <S extends ReportRecipient> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<ReportRecipient> findByOrgIdAndId(Long orgId, Long id);

    List<ReportRecipient> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<ReportRecipient> findByOrgIdAndDefinitionId(Long orgId, Long definitionId);
}
