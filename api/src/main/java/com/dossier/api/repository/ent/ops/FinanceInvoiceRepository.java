package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.FinanceInvoice;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code finance_invoice}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface FinanceInvoiceRepository extends Repository<FinanceInvoice, Long> {
    <S extends FinanceInvoice> S save(S entity);

    <S extends FinanceInvoice> S saveAndFlush(S entity);

    void flush();

    <S extends FinanceInvoice> List<S> saveAll(Iterable<S> entities);

    <S extends FinanceInvoice> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<FinanceInvoice> findByOrgIdAndId(Long orgId, Long id);

    List<FinanceInvoice> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    Optional<FinanceInvoice> findByOrgIdAndCode(Long orgId, String code);

    List<FinanceInvoice> findByOrgIdAndPlacementIdOrderByPeriodStartDesc(Long orgId, Long placementId);

    long countByOrgIdAndStatus(Long orgId, String status);

    @Query("select coalesce(sum(i.amountMinor), 0) from FinanceInvoice i where i.orgId = :orgId and i.status = :status")
    long sumAmountByStatus(@Param("orgId") Long orgId, @Param("status") String status);
}
