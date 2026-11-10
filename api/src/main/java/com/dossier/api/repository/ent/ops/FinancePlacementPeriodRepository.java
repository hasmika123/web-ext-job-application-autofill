package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.FinancePlacementPeriod;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code finance_placement_period}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface FinancePlacementPeriodRepository extends Repository<FinancePlacementPeriod, Long> {
    <S extends FinancePlacementPeriod> S save(S entity);

    <S extends FinancePlacementPeriod> S saveAndFlush(S entity);

    void flush();

    <S extends FinancePlacementPeriod> List<S> saveAll(Iterable<S> entities);

    <S extends FinancePlacementPeriod> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<FinancePlacementPeriod> findByOrgIdAndId(Long orgId, Long id);

    List<FinancePlacementPeriod> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    Optional<FinancePlacementPeriod> findByOrgIdAndPlacementIdAndPeriodStart(Long orgId, Long placementId, LocalDate periodStart);

    List<FinancePlacementPeriod> findByOrgIdAndPlacementIdOrderByPeriodStartAsc(Long orgId, Long placementId);

    List<FinancePlacementPeriod> findByOrgIdAndPeriodStart(Long orgId, LocalDate periodStart);

    long countByOrgIdAndPeriodStart(Long orgId, LocalDate periodStart);

    long countByOrgIdAndPeriodStartAndInvoiceStatus(Long orgId, LocalDate periodStart, String invoiceStatus);

    @Query("select coalesce(sum(p.revenueMinor), 0) from FinancePlacementPeriod p where p.orgId = :orgId and p.periodStart = :periodStart")
    long sumRevenue(@Param("orgId") Long orgId, @Param("periodStart") LocalDate periodStart);

    @Query("select coalesce(sum(p.payoutMinor), 0) from FinancePlacementPeriod p where p.orgId = :orgId and p.periodStart = :periodStart")
    long sumPayout(@Param("orgId") Long orgId, @Param("periodStart") LocalDate periodStart);

    /** The monthly series: {@code [period_start, revenue_minor, payout_minor, hours]} per month from {@code from} to {@code to}, oldest first (Finance Monthly Trend, Reports Revenue Trend). */
    @Query("select p.periodStart, sum(p.revenueMinor), sum(p.payoutMinor), sum(p.hours) from FinancePlacementPeriod p where p.orgId = :orgId and p.periodStart between :from and :to group by p.periodStart order by p.periodStart")
    List<Object[]> monthlySeries(@Param("orgId") Long orgId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** The Placement Finance table: every filter optional ({@code null} = no filter, {@code q} empty = all, lower case); {@code q} matches the consultant's name or title or the client's name. */
    @Query(value = "select p from FinancePlacementPeriod p, ConsultantProfile c, ClientAccount a where p.orgId = :orgId and c.orgId = :orgId and a.orgId = :orgId and c.id = p.consultantId and a.id = p.clientId "
        + "and p.periodStart = :periodStart and (:invoiceStatus is null or p.invoiceStatus = :invoiceStatus) and (:clientId is null or p.clientId = :clientId) and (:consultantId is null or p.consultantId = :consultantId) "
        + "and (:q = '' or lower(c.displayName) like concat('%', :q, '%') or lower(a.name) like concat('%', :q, '%') or lower(c.jobTitle) like concat('%', :q, '%'))",
        countQuery = "select count(p) from FinancePlacementPeriod p, ConsultantProfile c, ClientAccount a where p.orgId = :orgId and c.orgId = :orgId and a.orgId = :orgId and c.id = p.consultantId and a.id = p.clientId "
        + "and p.periodStart = :periodStart and (:invoiceStatus is null or p.invoiceStatus = :invoiceStatus) and (:clientId is null or p.clientId = :clientId) and (:consultantId is null or p.consultantId = :consultantId) "
        + "and (:q = '' or lower(c.displayName) like concat('%', :q, '%') or lower(a.name) like concat('%', :q, '%') or lower(c.jobTitle) like concat('%', :q, '%'))")
    Page<FinancePlacementPeriod> search(@Param("orgId") Long orgId, @Param("periodStart") LocalDate periodStart, @Param("invoiceStatus") String invoiceStatus, @Param("clientId") Long clientId,
        @Param("consultantId") Long consultantId, @Param("q") String q, Pageable pageable);
}
