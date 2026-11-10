package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.OrgContractPrice;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code org_contract_price}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface OrgContractPriceRepository extends Repository<OrgContractPrice, Long> {
    <S extends OrgContractPrice> S save(S entity);
    <S extends OrgContractPrice> S saveAndFlush(S entity);
    void flush();
    <S extends OrgContractPrice> List<S> saveAll(Iterable<S> entities);
    <S extends OrgContractPrice> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<OrgContractPrice> findByOrgIdAndId(Long orgId, Long id);
    List<OrgContractPrice> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    List<OrgContractPrice> findByOrgIdAndContractId(Long orgId, Long contractId);
    Optional<OrgContractPrice> findByOrgIdAndContractIdAndProductIdAndVersionTo(Long orgId, Long contractId, Long productId, Integer versionTo);
}
