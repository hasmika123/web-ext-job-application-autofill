package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.FeatureCredit;
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

/** Org-scoped access to {@code feature_credit}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface FeatureCreditRepository extends Repository<FeatureCredit, Long> {
    <S extends FeatureCredit> S save(S entity);
    <S extends FeatureCredit> S saveAndFlush(S entity);
    void flush();
    <S extends FeatureCredit> List<S> saveAll(Iterable<S> entities);
    <S extends FeatureCredit> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<FeatureCredit> findByOrgIdAndId(Long orgId, Long id);
    List<FeatureCredit> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    List<FeatureCredit> findByOrgIdAndPeriodKeyOrderByCreatedAtDesc(Long orgId, String periodKey);
    List<FeatureCredit> findByOrgIdAndConsultantIdAndPeriodKey(Long orgId, Long consultantId, String periodKey);
    @Query("select coalesce(sum(c.quantity), 0) from FeatureCredit c where c.orgId = :orgId and c.consultantId = :consultantId and c.featureKey = :featureKey and c.periodKey = :periodKey")
    long sumQuantity(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("featureKey") String featureKey, @Param("periodKey") String periodKey);
}
