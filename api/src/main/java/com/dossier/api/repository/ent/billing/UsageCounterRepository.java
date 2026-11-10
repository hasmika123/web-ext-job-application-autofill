package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.UsageCounter;
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

/** Org-scoped access to {@code usage_counter}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface UsageCounterRepository extends Repository<UsageCounter, Long> {
    <S extends UsageCounter> S save(S entity);
    <S extends UsageCounter> S saveAndFlush(S entity);
    void flush();
    <S extends UsageCounter> List<S> saveAll(Iterable<S> entities);
    <S extends UsageCounter> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<UsageCounter> findByOrgIdAndId(Long orgId, Long id);
    List<UsageCounter> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    Optional<UsageCounter> findByOrgIdAndConsultantIdAndFeatureKeyAndPeriodKey(Long orgId, Long consultantId, String featureKey, String periodKey);
    List<UsageCounter> findByOrgIdAndPeriodKey(Long orgId, String periodKey);
    Page<UsageCounter> findByOrgIdAndPeriodKey(Long orgId, String periodKey, Pageable pageable);
    List<UsageCounter> findByOrgIdAndConsultantIdAndPeriodKey(Long orgId, Long consultantId, String periodKey);
    List<UsageCounter> findByOrgIdAndFeatureKeyAndPeriodKey(Long orgId, String featureKey, String periodKey);
    List<UsageCounter> findByOrgIdAndConsultantIdOrderByPeriodKeyAsc(Long orgId, Long consultantId);
    @Query("select coalesce(sum(c.used), 0) from UsageCounter c where c.orgId = :orgId and c.periodKey = :periodKey")
    long sumUsed(@Param("orgId") Long orgId, @Param("periodKey") String periodKey);
    @Query("select coalesce(sum(c.allowance), 0) from UsageCounter c where c.orgId = :orgId and c.periodKey = :periodKey")
    long sumAllowance(@Param("orgId") Long orgId, @Param("periodKey") String periodKey);
    /** Usage of AI features (feature_definition.usage_type = AI_FEATURE) in a period: the "AI Usage This Month" tile. */
    @Query("select coalesce(sum(c.used), 0) from UsageCounter c, FeatureDefinition f where c.orgId = :orgId and c.periodKey = :periodKey and c.featureKey = f.featureKey and f.usageType = 'AI_FEATURE'")
    long sumUsedAi(@Param("orgId") Long orgId, @Param("periodKey") String periodKey);
    /** Per feature: {featureKey, used, allowance, consultants} in a period (the By Feature / most used feature view). */
    @Query("select c.featureKey, coalesce(sum(c.used), 0), coalesce(sum(c.allowance), 0), count(c) from UsageCounter c where c.orgId = :orgId and c.periodKey = :periodKey group by c.featureKey")
    List<Object[]> byFeature(@Param("orgId") Long orgId, @Param("periodKey") String periodKey);
    /** Per period for the trend chart: {periodKey, used}. */
    @Query("select c.periodKey, coalesce(sum(c.used), 0) from UsageCounter c where c.orgId = :orgId and c.periodKey between :fromKey and :toKey group by c.periodKey order by c.periodKey asc")
    List<Object[]> trend(@Param("orgId") Long orgId, @Param("fromKey") String fromKey, @Param("toKey") String toKey);
    /** Distinct features with usage rows in a period: "Total Active Features". */
    @Query("select count(distinct c.featureKey) from UsageCounter c where c.orgId = :orgId and c.periodKey = :periodKey")
    long countFeatures(@Param("orgId") Long orgId, @Param("periodKey") String periodKey);
    @Query("select c from UsageCounter c where c.orgId = :orgId and c.periodKey = :periodKey and c.allowance > 0 and c.used * 100 >= c.allowance * :pct")
    List<UsageCounter> findAtOrAbovePct(@Param("orgId") Long orgId, @Param("periodKey") String periodKey, @Param("pct") long pct);
}
