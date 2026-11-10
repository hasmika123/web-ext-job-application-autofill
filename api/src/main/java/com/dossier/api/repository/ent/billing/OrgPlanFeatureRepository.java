package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.OrgPlanFeature;
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

/** Org-scoped access to {@code org_plan_feature}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface OrgPlanFeatureRepository extends Repository<OrgPlanFeature, Long> {
    <S extends OrgPlanFeature> S save(S entity);
    <S extends OrgPlanFeature> S saveAndFlush(S entity);
    void flush();
    <S extends OrgPlanFeature> List<S> saveAll(Iterable<S> entities);
    <S extends OrgPlanFeature> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<OrgPlanFeature> findByOrgIdAndId(Long orgId, Long id);
    List<OrgPlanFeature> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    List<OrgPlanFeature> findByOrgIdAndSubscriptionIdOrderBySortOrderAsc(Long orgId, Long subscriptionId);
}
