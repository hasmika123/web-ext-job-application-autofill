package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.FinancePlacementTerms;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code finance_placement_terms}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface FinancePlacementTermsRepository extends Repository<FinancePlacementTerms, Long> {
    <S extends FinancePlacementTerms> S save(S entity);

    <S extends FinancePlacementTerms> S saveAndFlush(S entity);

    void flush();

    <S extends FinancePlacementTerms> List<S> saveAll(Iterable<S> entities);

    <S extends FinancePlacementTerms> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<FinancePlacementTerms> findByOrgIdAndId(Long orgId, Long id);

    List<FinancePlacementTerms> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    Optional<FinancePlacementTerms> findByOrgIdAndPlacementId(Long orgId, Long placementId);
}
