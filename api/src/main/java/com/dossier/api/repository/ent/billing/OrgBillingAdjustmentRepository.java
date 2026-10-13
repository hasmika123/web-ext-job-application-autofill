package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.OrgBillingAdjustment;
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

/** Org-scoped access to {@code org_billing_adjustment}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface OrgBillingAdjustmentRepository extends Repository<OrgBillingAdjustment, Long> {
    <S extends OrgBillingAdjustment> S save(S entity);
    <S extends OrgBillingAdjustment> S saveAndFlush(S entity);
    void flush();
    <S extends OrgBillingAdjustment> List<S> saveAll(Iterable<S> entities);
    <S extends OrgBillingAdjustment> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<OrgBillingAdjustment> findByOrgIdAndId(Long orgId, Long id);
    List<OrgBillingAdjustment> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    List<OrgBillingAdjustment> findByOrgIdAndStatusOrderByCreatedAtDesc(Long orgId, String status);
    List<OrgBillingAdjustment> findByOrgIdOrderByCreatedAtDesc(Long orgId);
    @Query("select coalesce(sum(a.amountMinor), 0) from OrgBillingAdjustment a where a.orgId = :orgId and a.status = :status")
    long sumAmountByStatus(@Param("orgId") Long orgId, @Param("status") String status);
}
