package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.HrDocumentRequirement;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code hr_document_requirement}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface HrDocumentRequirementRepository extends Repository<HrDocumentRequirement, Long> {
    <S extends HrDocumentRequirement> S save(S entity);

    <S extends HrDocumentRequirement> S saveAndFlush(S entity);

    void flush();

    <S extends HrDocumentRequirement> List<S> saveAll(Iterable<S> entities);

    <S extends HrDocumentRequirement> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<HrDocumentRequirement> findByOrgIdAndId(Long orgId, Long id);

    List<HrDocumentRequirement> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<HrDocumentRequirement> findByOrgIdAndEmployeeId(Long orgId, Long employeeId);

    long countByOrgIdAndStatus(Long orgId, String status);
}
