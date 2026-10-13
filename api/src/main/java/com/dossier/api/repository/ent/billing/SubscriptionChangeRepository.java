package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.SubscriptionChange;
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

/** Org-scoped access to {@code subscription_change}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface SubscriptionChangeRepository extends Repository<SubscriptionChange, Long> {
    <S extends SubscriptionChange> S save(S entity);
    <S extends SubscriptionChange> S saveAndFlush(S entity);
    void flush();
    <S extends SubscriptionChange> List<S> saveAll(Iterable<S> entities);
    <S extends SubscriptionChange> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<SubscriptionChange> findByOrgIdAndId(Long orgId, Long id);
    List<SubscriptionChange> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    List<SubscriptionChange> findTop10ByOrgIdOrderByOccurredAtDesc(Long orgId);
    Page<SubscriptionChange> findByOrgIdOrderByOccurredAtDesc(Long orgId, Pageable pageable);
}
