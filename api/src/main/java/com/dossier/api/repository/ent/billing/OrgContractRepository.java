package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.OrgContract;
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

/** Org-scoped access to {@code org_contract}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface OrgContractRepository extends Repository<OrgContract, Long> {
    <S extends OrgContract> S save(S entity);
    <S extends OrgContract> S saveAndFlush(S entity);
    void flush();
    <S extends OrgContract> List<S> saveAll(Iterable<S> entities);
    <S extends OrgContract> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<OrgContract> findByOrgIdAndId(Long orgId, Long id);
    List<OrgContract> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    Optional<OrgContract> findFirstByOrgIdAndStatus(Long orgId, String status);
    List<OrgContract> findByOrgIdAndStatus(Long orgId, String status);
}
