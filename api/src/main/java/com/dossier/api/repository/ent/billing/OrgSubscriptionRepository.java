package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.OrgSubscription;
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

/** Org-scoped access to {@code org_subscription}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface OrgSubscriptionRepository extends Repository<OrgSubscription, Long> {
    <S extends OrgSubscription> S save(S entity);
    <S extends OrgSubscription> S saveAndFlush(S entity);
    void flush();
    <S extends OrgSubscription> List<S> saveAll(Iterable<S> entities);
    <S extends OrgSubscription> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<OrgSubscription> findByOrgIdAndId(Long orgId, Long id);
    List<OrgSubscription> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    Optional<OrgSubscription> findFirstByOrgIdOrderByIdDesc(Long orgId);
    Optional<OrgSubscription> findFirstByOrgIdAndStatusIn(Long orgId, Collection<String> statuses);
}
