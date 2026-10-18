package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.UsageEvent;
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

/** Org-scoped access to {@code usage_event}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface UsageEventRepository extends Repository<UsageEvent, Long> {
    <S extends UsageEvent> S save(S entity);
    <S extends UsageEvent> S saveAndFlush(S entity);
    void flush();
    <S extends UsageEvent> List<S> saveAll(Iterable<S> entities);
    <S extends UsageEvent> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<UsageEvent> findByOrgIdAndId(Long orgId, Long id);
    List<UsageEvent> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    List<UsageEvent> findByOrgIdAndConsultantIdAndPeriodKeyOrderByOccurredAtDesc(Long orgId, Long consultantId, String periodKey);
    long countByOrgIdAndPeriodKey(Long orgId, String periodKey);
    @Query("select coalesce(sum(e.quantity), 0) from UsageEvent e where e.orgId = :orgId and e.periodKey = :periodKey and e.status = 'COMMITTED'")
    long sumQuantity(@Param("orgId") Long orgId, @Param("periodKey") String periodKey);
    @Query("select coalesce(sum(e.quantity), 0) from UsageEvent e where e.orgId = :orgId and e.consultantId = :consultantId and e.featureKey = :featureKey and e.periodKey = :periodKey and e.status = 'COMMITTED'")
    long sumQuantity(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("featureKey") String featureKey, @Param("periodKey") String periodKey);
    @Query("select e.featureKey, coalesce(sum(e.quantity), 0) from UsageEvent e where e.orgId = :orgId and e.consultantId = :consultantId and e.periodKey = :periodKey and e.status = 'COMMITTED' group by e.featureKey")
    List<Object[]> sumByFeature(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("periodKey") String periodKey);
    @Query("select e.occurredAt, e.featureKey, e.quantity from UsageEvent e where e.orgId = :orgId and e.consultantId = :consultantId order by e.occurredAt desc")
    List<Object[]> history(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId, Pageable pageable);
}
