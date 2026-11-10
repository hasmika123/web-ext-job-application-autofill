package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
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

/** Org-scoped access to {@code consultant_license}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface ConsultantLicenseRepository extends Repository<ConsultantLicense, Long> {
    <S extends ConsultantLicense> S save(S entity);
    <S extends ConsultantLicense> S saveAndFlush(S entity);
    void flush();
    <S extends ConsultantLicense> List<S> saveAll(Iterable<S> entities);
    <S extends ConsultantLicense> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<ConsultantLicense> findByOrgIdAndId(Long orgId, Long id);
    List<ConsultantLicense> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    List<ConsultantLicense> findByOrgIdAndConsultantIdOrderByStartsAtDesc(Long orgId, Long consultantId);
    /** The licenses of one organization member, newest first (story K7.1: the entitlement resolver's organization reader). */
    List<ConsultantLicense> findByOrgIdAndMemberIdOrderByStartsAtDesc(Long orgId, Long memberId);
    Optional<ConsultantLicense> findFirstByOrgIdAndConsultantIdAndStatusNot(Long orgId, Long consultantId, String status);
    long countByOrgIdAndStatus(Long orgId, String status);
    long countByOrgIdAndStatusAndEndsAtBetween(Long orgId, String status, Instant from, Instant to);
    long countByOrgIdAndStartsAtGreaterThanEqual(Long orgId, Instant since);
    List<ConsultantLicense> findByOrgIdAndStatusIn(Long orgId, Collection<String> statuses);
    Page<ConsultantLicense> findByOrgIdAndStatusIn(Long orgId, Collection<String> statuses, Pageable pageable);
    Page<ConsultantLicense> findByOrgIdAndStatus(Long orgId, String status, Pageable pageable);
    Page<ConsultantLicense> findByOrgIdAndStatusNot(Long orgId, String status, Pageable pageable);
    /** Live = not ENDED (the "licensed consultants" tile). */
    @Query("select count(l) from ConsultantLicense l where l.orgId = :orgId and l.status <> 'ENDED'")
    long countLive(@Param("orgId") Long orgId);
    /** Live at an instant (vs-last-month deltas): started on or before t and not ended by t. */
    @Query("select count(l) from ConsultantLicense l where l.orgId = :orgId and l.startsAt <= :t and (l.endsAt is null or l.endsAt > :t)")
    long countLiveAt(@Param("orgId") Long orgId, @Param("t") Instant t);
    @Query("select count(l) from ConsultantLicense l where l.orgId = :orgId and l.status in :statuses and l.startsAt <= :t and (l.endsAt is null or l.endsAt > :t)")
    long countLiveAtWithStatus(@Param("orgId") Long orgId, @Param("statuses") Collection<String> statuses, @Param("t") Instant t);
    /** Monthly base price of the licenses in the given statuses (billable = ACTIVE, CANCEL_AT_PERIOD_END, PENDING). */
    @Query("select coalesce(sum(l.baseAmountMinor), 0) from ConsultantLicense l where l.orgId = :orgId and l.status in :statuses")
    long sumBaseAmount(@Param("orgId") Long orgId, @Param("statuses") Collection<String> statuses);
    /** Per base product: {productId, count, sum of base_amount_minor} for the statuses. */
    @Query("select l.baseProductId, count(l), coalesce(sum(l.baseAmountMinor), 0) from ConsultantLicense l where l.orgId = :orgId and l.status in :statuses group by l.baseProductId")
    List<Object[]> baseBreakdown(@Param("orgId") Long orgId, @Param("statuses") Collection<String> statuses);
    /** Licenses that existed (billable) during [from, to): started before to, not ended before from, not suspended by to. Used to compose a period invoice. */
    @Query("select l from ConsultantLicense l where l.orgId = :orgId and l.startsAt < :to and (l.endsAt is null or l.endsAt >= :from) and (l.suspendedAt is null or l.suspendedAt >= :to)")
    List<ConsultantLicense> findBillableDuring(@Param("orgId") Long orgId, @Param("from") Instant from, @Param("to") Instant to);
    @Query("select l from ConsultantLicense l where l.orgId = :orgId and l.status = 'CANCEL_AT_PERIOD_END' and l.endsAt >= :from and l.endsAt < :to order by l.endsAt asc")
    List<ConsultantLicense> findExpiring(@Param("orgId") Long orgId, @Param("from") Instant from, @Param("to") Instant to);
}
