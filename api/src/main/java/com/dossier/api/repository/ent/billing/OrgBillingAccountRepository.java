package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.OrgBillingAccount;
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

/** Org-scoped access to {@code org_billing_account}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface OrgBillingAccountRepository extends Repository<OrgBillingAccount, Long> {
    <S extends OrgBillingAccount> S save(S entity);
    <S extends OrgBillingAccount> S saveAndFlush(S entity);
    void flush();
    <S extends OrgBillingAccount> List<S> saveAll(Iterable<S> entities);
    <S extends OrgBillingAccount> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<OrgBillingAccount> findByOrgIdAndId(Long orgId, Long id);
    List<OrgBillingAccount> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    Optional<OrgBillingAccount> findFirstByOrgId(Long orgId);
}
