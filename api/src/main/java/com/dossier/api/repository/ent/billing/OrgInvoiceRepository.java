package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.OrgInvoice;
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

/** Org-scoped access to {@code org_invoice}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface OrgInvoiceRepository extends Repository<OrgInvoice, Long> {
    <S extends OrgInvoice> S save(S entity);
    <S extends OrgInvoice> S saveAndFlush(S entity);
    void flush();
    <S extends OrgInvoice> List<S> saveAll(Iterable<S> entities);
    <S extends OrgInvoice> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<OrgInvoice> findByOrgIdAndId(Long orgId, Long id);
    List<OrgInvoice> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    Optional<OrgInvoice> findByOrgIdAndInvoiceNumber(Long orgId, String invoiceNumber);
    Page<OrgInvoice> findByOrgIdOrderByIssueDateDescIdDesc(Long orgId, Pageable pageable);
    Page<OrgInvoice> findByOrgIdAndStatusOrderByIssueDateDescIdDesc(Long orgId, String status, Pageable pageable);
    List<OrgInvoice> findByOrgIdAndKindAndPeriodStartBetweenOrderByPeriodStartAsc(Long orgId, String kind, LocalDate from, LocalDate to);
    List<OrgInvoice> findByOrgIdAndStatus(Long orgId, String status);
    long countByOrgIdAndStatus(Long orgId, String status);
    Optional<OrgInvoice> findFirstByOrgIdAndInvoiceNumberStartingWithOrderByInvoiceNumberDesc(Long orgId, String prefix);
    /** Overdue = OPEN with a due date before today (the UI status). */
    @Query("select i from OrgInvoice i where i.orgId = :orgId and i.status = 'OPEN' and i.dueDate < :today order by i.dueDate asc")
    List<OrgInvoice> findOverdue(@Param("orgId") Long orgId, @Param("today") LocalDate today);
    @Query("select count(i) from OrgInvoice i where i.orgId = :orgId and i.status = 'OPEN' and i.dueDate < :today")
    long countOverdue(@Param("orgId") Long orgId, @Param("today") LocalDate today);
    /** Outstanding = unpaid balance of OPEN invoices. */
    @Query("select coalesce(sum(i.amountMinor - i.amountPaidMinor), 0) from OrgInvoice i where i.orgId = :orgId and i.status = 'OPEN'")
    long sumOutstanding(@Param("orgId") Long orgId);
    @Query("select coalesce(sum(i.amountMinor - i.amountPaidMinor), 0) from OrgInvoice i where i.orgId = :orgId and i.status = 'OPEN' and i.issueDate < :before")
    long sumOutstandingIssuedBefore(@Param("orgId") Long orgId, @Param("before") LocalDate before);
    /** Total billed = invoices issued in [from, to]. */
    @Query("select coalesce(sum(i.amountMinor), 0) from OrgInvoice i where i.orgId = :orgId and i.status <> 'VOID' and i.issueDate between :from and :to")
    long sumIssuedBetween(@Param("orgId") Long orgId, @Param("from") LocalDate from, @Param("to") LocalDate to);
}
