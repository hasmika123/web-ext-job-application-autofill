package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.OrgSubscriptionItem;
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

/** Org-scoped access to {@code org_subscription_item}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface OrgSubscriptionItemRepository extends Repository<OrgSubscriptionItem, Long> {
    <S extends OrgSubscriptionItem> S save(S entity);
    <S extends OrgSubscriptionItem> S saveAndFlush(S entity);
    void flush();
    <S extends OrgSubscriptionItem> List<S> saveAll(Iterable<S> entities);
    <S extends OrgSubscriptionItem> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<OrgSubscriptionItem> findByOrgIdAndId(Long orgId, Long id);
    List<OrgSubscriptionItem> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    List<OrgSubscriptionItem> findByOrgIdAndSubscriptionIdOrderBySortOrderAsc(Long orgId, Long subscriptionId);
    @Query("select coalesce(sum(i.unitAmountMinor * i.quantity), 0) from OrgSubscriptionItem i where i.orgId = :orgId and i.subscriptionId = :subscriptionId")
    long sumMonthlyMinor(@Param("orgId") Long orgId, @Param("subscriptionId") Long subscriptionId);
}
