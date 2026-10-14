package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.FinancePayment;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code finance_payment}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface FinancePaymentRepository extends Repository<FinancePayment, Long> {
    <S extends FinancePayment> S save(S entity);

    <S extends FinancePayment> S saveAndFlush(S entity);

    void flush();

    <S extends FinancePayment> List<S> saveAll(Iterable<S> entities);

    <S extends FinancePayment> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<FinancePayment> findByOrgIdAndId(Long orgId, Long id);

    List<FinancePayment> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<FinancePayment> findByOrgIdAndPlacementIdOrderByPeriodStartDesc(Long orgId, Long placementId);

    Page<FinancePayment> findByOrgIdAndDirectionOrderByCreatedAtDesc(Long orgId, String direction, Pageable pageable);

    long countByOrgIdAndDirectionAndStatus(Long orgId, String direction, String status);

    /** Open payouts: OUT payments still PENDING ("Open Payouts" tile). */
    @Query("select coalesce(sum(p.amountMinor), 0) from FinancePayment p where p.orgId = :orgId and p.direction = 'OUT' and p.status = 'PENDING'")
    long sumOpenPayouts(@Param("orgId") Long orgId);

    /** Open payouts at an instant: created by then and not paid by then (the T-30 side of the tile's delta). */
    @Query("select coalesce(sum(p.amountMinor), 0) from FinancePayment p where p.orgId = :orgId and p.direction = 'OUT' and p.createdAt <= :at and (p.paidOn is null or p.paidOn > :on)")
    long sumOpenPayoutsAt(@Param("orgId") Long orgId, @Param("at") Instant at, @Param("on") LocalDate on);

    @Query("select coalesce(sum(p.amountMinor), 0) from FinancePayment p where p.orgId = :orgId and p.direction = 'IN' and p.status = 'PAID' and p.placementId = :placementId and p.periodStart = :periodStart")
    long sumReceived(@Param("orgId") Long orgId, @Param("placementId") Long placementId, @Param("periodStart") LocalDate periodStart);

    @Query("select coalesce(sum(p.amountMinor), 0) from FinancePayment p where p.orgId = :orgId and p.direction = 'OUT' and p.status = 'PENDING' and p.placementId = :placementId and p.periodStart = :periodStart")
    long sumPendingPayout(@Param("orgId") Long orgId, @Param("placementId") Long placementId, @Param("periodStart") LocalDate periodStart);
}
