package com.dossier.api.repository.ent.pipeline;

import com.dossier.api.domain.ent.pipeline.JobOpportunity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code job_opportunity}; every read names the organization first. */
public interface JobOpportunityRepository extends Repository<JobOpportunity, Long> {
    <S extends JobOpportunity> S save(S entity);

    <S extends JobOpportunity> S saveAndFlush(S entity);

    void flush();

    @Query("select o from JobOpportunity o where o.orgId = :orgId and o.id = :id")
    Optional<JobOpportunity> findByOrgIdAndId(@Param("orgId") Long orgId, @Param("id") Long id);

    List<JobOpportunity> findByOrgIdOrderByUpdatedAtDesc(Long orgId);

    List<JobOpportunity> findByOrgIdAndStatusOrderByUpdatedAtDesc(Long orgId, String status);

    @Query("select count(o) from JobOpportunity o where o.orgId = :orgId")
    long countByOrgId(@Param("orgId") Long orgId);

    @Query("select o from JobOpportunity o where o.orgId = :orgId and o.postingLiveKey = :postingId")
    Optional<JobOpportunity> findByOrgIdAndPostingId(@Param("orgId") Long orgId, @Param("postingId") Long postingId);

    @Query("select o from JobOpportunity o where o.orgId = :orgId and o.requirementLiveKey = :requirementId")
    Optional<JobOpportunity> findByOrgIdAndRequirementId(@Param("orgId") Long orgId, @Param("requirementId") Long requirementId);

    @Query("select o from JobOpportunity o where o.orgId = :orgId and o.dedupeLiveKey = :dedupeKey")
    Optional<JobOpportunity> findByOrgIdAndDedupeKey(@Param("orgId") Long orgId, @Param("dedupeKey") String dedupeKey);
}
