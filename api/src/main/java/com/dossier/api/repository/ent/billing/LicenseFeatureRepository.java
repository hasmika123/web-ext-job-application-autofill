package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.LicenseFeature;
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

/** Org-scoped access to {@code license_feature}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface LicenseFeatureRepository extends Repository<LicenseFeature, Long> {
    <S extends LicenseFeature> S save(S entity);
    <S extends LicenseFeature> S saveAndFlush(S entity);
    void flush();
    <S extends LicenseFeature> List<S> saveAll(Iterable<S> entities);
    <S extends LicenseFeature> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<LicenseFeature> findByOrgIdAndId(Long orgId, Long id);
    List<LicenseFeature> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    List<LicenseFeature> findByOrgIdAndLicenseIdOrderByIdAsc(Long orgId, Long licenseId);
    List<LicenseFeature> findByOrgIdAndLicenseIdIn(Long orgId, Collection<Long> licenseIds);
    long countByOrgIdAndLive(Long orgId, Boolean live);
    List<LicenseFeature> findByOrgIdAndLive(Long orgId, Boolean live);
    /** Add-on features enabled = live feature rows on live (not ENDED) licenses. */
    @Query("select count(f) from LicenseFeature f, ConsultantLicense l where f.orgId = :orgId and l.orgId = :orgId and f.licenseId = l.id and f.live = true and l.status <> 'ENDED'")
    long countEnabled(@Param("orgId") Long orgId);
    @Query("select count(f) from LicenseFeature f, ConsultantLicense l where f.orgId = :orgId and l.orgId = :orgId and f.licenseId = l.id and f.startsAt <= :t and (f.endsAt is null or f.endsAt > :t) and l.startsAt <= :t and (l.endsAt is null or l.endsAt > :t)")
    long countEnabledAt(@Param("orgId") Long orgId, @Param("t") Instant t);
    /** Monthly add-on total of the features on licenses in the given statuses. */
    @Query("select coalesce(sum(f.unitAmountMinor * f.quantity), 0) from LicenseFeature f, ConsultantLicense l where f.orgId = :orgId and l.orgId = :orgId and f.licenseId = l.id and f.live = true and l.status in :statuses")
    long sumAmount(@Param("orgId") Long orgId, @Param("statuses") Collection<String> statuses);
    /** Per feature: {featureKey, productId, count, sum} on licenses in the statuses. */
    @Query("select f.featureKey, f.productId, count(f), coalesce(sum(f.unitAmountMinor * f.quantity), 0) from LicenseFeature f, ConsultantLicense l where f.orgId = :orgId and l.orgId = :orgId and f.licenseId = l.id and f.live = true and l.status in :statuses group by f.featureKey, f.productId")
    List<Object[]> featureBreakdown(@Param("orgId") Long orgId, @Param("statuses") Collection<String> statuses);
    @Query("select f from LicenseFeature f, ConsultantLicense l where f.orgId = :orgId and l.orgId = :orgId and f.licenseId = l.id and f.startsAt < :to and (f.endsAt is null or f.endsAt >= :from) and l.startsAt < :to and (l.endsAt is null or l.endsAt >= :from) and (l.suspendedAt is null or l.suspendedAt >= :to)")
    List<LicenseFeature> findBillableDuring(@Param("orgId") Long orgId, @Param("from") Instant from, @Param("to") Instant to);
}
