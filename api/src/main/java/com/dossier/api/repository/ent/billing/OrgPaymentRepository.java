package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.OrgPayment;
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

/** Org-scoped access to {@code org_payment}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface OrgPaymentRepository extends Repository<OrgPayment, Long> {
    <S extends OrgPayment> S save(S entity);
    <S extends OrgPayment> S saveAndFlush(S entity);
    void flush();
    <S extends OrgPayment> List<S> saveAll(Iterable<S> entities);
    <S extends OrgPayment> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<OrgPayment> findByOrgIdAndId(Long orgId, Long id);
    List<OrgPayment> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    List<OrgPayment> findByOrgIdAndInvoiceIdOrderByOccurredAtAsc(Long orgId, Long invoiceId);
    Page<OrgPayment> findByOrgIdOrderByOccurredAtDesc(Long orgId, Pageable pageable);
    long countByOrgIdAndStatusAndOccurredAtBetween(Long orgId, String status, Instant from, Instant to);
    @Query("select coalesce(sum(p.amountMinor), 0) from OrgPayment p where p.orgId = :orgId and p.status = 'SUCCEEDED' and p.occurredAt >= :from and p.occurredAt < :to")
    long sumSucceededBetween(@Param("orgId") Long orgId, @Param("from") Instant from, @Param("to") Instant to);
    @Query("select count(p) from OrgPayment p where p.orgId = :orgId and p.status in ('SUCCEEDED', 'FAILED') and p.occurredAt >= :from and p.occurredAt < :to")
    long countAttemptsBetween(@Param("orgId") Long orgId, @Param("from") Instant from, @Param("to") Instant to);
}
