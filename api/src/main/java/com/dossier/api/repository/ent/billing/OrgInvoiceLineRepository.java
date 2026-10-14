package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.OrgInvoiceLine;
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

/** Org-scoped access to {@code org_invoice_line}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface OrgInvoiceLineRepository extends Repository<OrgInvoiceLine, Long> {
    <S extends OrgInvoiceLine> S save(S entity);
    <S extends OrgInvoiceLine> S saveAndFlush(S entity);
    void flush();
    <S extends OrgInvoiceLine> List<S> saveAll(Iterable<S> entities);
    <S extends OrgInvoiceLine> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<OrgInvoiceLine> findByOrgIdAndId(Long orgId, Long id);
    List<OrgInvoiceLine> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    List<OrgInvoiceLine> findByOrgIdAndInvoiceIdOrderBySortOrderAsc(Long orgId, Long invoiceId);
    List<OrgInvoiceLine> findByOrgIdAndInvoiceIdIn(Long orgId, Collection<Long> invoiceIds);
    @Query("select coalesce(sum(l.amountMinor), 0) from OrgInvoiceLine l where l.orgId = :orgId and l.invoiceId = :invoiceId")
    long sumAmount(@Param("orgId") Long orgId, @Param("invoiceId") Long invoiceId);
    /** Recurring part of an invoice: everything except CREDIT / ADJUSTMENT lines (the monthly recurring spend series). */
    @Query("select coalesce(sum(l.amountMinor), 0) from OrgInvoiceLine l where l.orgId = :orgId and l.invoiceId = :invoiceId and l.lineKind in ('BASE_LICENSE', 'FEATURE', 'ORG_ADDON')")
    long sumRecurring(@Param("orgId") Long orgId, @Param("invoiceId") Long invoiceId);
}
