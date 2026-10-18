package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.FinanceTimesheet;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code finance_timesheet}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface FinanceTimesheetRepository extends Repository<FinanceTimesheet, Long> {
    <S extends FinanceTimesheet> S save(S entity);

    <S extends FinanceTimesheet> S saveAndFlush(S entity);

    void flush();

    <S extends FinanceTimesheet> List<S> saveAll(Iterable<S> entities);

    <S extends FinanceTimesheet> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<FinanceTimesheet> findByOrgIdAndId(Long orgId, Long id);

    List<FinanceTimesheet> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    Optional<FinanceTimesheet> findByOrgIdAndPlacementIdAndPeriodStart(Long orgId, Long placementId, LocalDate periodStart);

    List<FinanceTimesheet> findByOrgIdAndPlacementIdOrderByPeriodStartDesc(Long orgId, Long placementId);

    long countByOrgIdAndStatus(Long orgId, String status);

    long countByOrgIdAndPeriodStart(Long orgId, LocalDate periodStart);

    Page<FinanceTimesheet> findByOrgIdAndStatusOrderBySubmittedAtDesc(Long orgId, String status, Pageable pageable);

    /** Pending at an instant: submitted by then and not decided by then ("Timesheets Pending" now and at T-7). */
    @Query("select count(t) from FinanceTimesheet t where t.orgId = :orgId and t.submittedAt <= :at and (t.decidedAt is null or t.decidedAt > :at)")
    long countPendingAt(@Param("orgId") Long orgId, @Param("at") Instant at);

    @Query("select coalesce(sum(t.hours), 0) from FinanceTimesheet t where t.orgId = :orgId and t.periodStart = :periodStart")
    BigDecimal sumHours(@Param("orgId") Long orgId, @Param("periodStart") LocalDate periodStart);
}
