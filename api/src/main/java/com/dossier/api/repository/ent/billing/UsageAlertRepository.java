package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.UsageAlert;
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

/** Org-scoped access to {@code usage_alert}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface UsageAlertRepository extends Repository<UsageAlert, Long> {
    <S extends UsageAlert> S save(S entity);
    <S extends UsageAlert> S saveAndFlush(S entity);
    void flush();
    <S extends UsageAlert> List<S> saveAll(Iterable<S> entities);
    <S extends UsageAlert> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<UsageAlert> findByOrgIdAndId(Long orgId, Long id);
    List<UsageAlert> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    List<UsageAlert> findTop10ByOrgIdOrderByCreatedAtDesc(Long orgId);
    List<UsageAlert> findByOrgIdAndConsultantIdOrderByCreatedAtDesc(Long orgId, Long consultantId);
    long countByOrgIdAndAcknowledgedAtIsNull(Long orgId);
}
