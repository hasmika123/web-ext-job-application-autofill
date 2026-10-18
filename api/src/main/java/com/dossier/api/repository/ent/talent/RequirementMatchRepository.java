package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.RequirementMatch;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code requirement_match}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface RequirementMatchRepository extends Repository<RequirementMatch, Long> {
    <S extends RequirementMatch> S save(S entity);

    <S extends RequirementMatch> S saveAndFlush(S entity);

    void flush();

    <S extends RequirementMatch> List<S> saveAll(Iterable<S> entities);

    <S extends RequirementMatch> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<RequirementMatch> findByOrgIdAndId(Long orgId, Long id);

    /** The pair's match, whatever its status (the unique key {@code uk_requirement_match_pair}). */
    Optional<RequirementMatch> findByOrgIdAndRequirementIdAndConsultantId(Long orgId, Long requirementId, Long consultantId);

    /**
     * {@code SELECT ... FOR UPDATE}: reads the latest committed row even when this transaction's snapshot predates it (a row another request
     * just inserted), and attaches it to this persistence context. Used by the find-or-create retry in {@code OpportunityAssignmentService}.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from RequirementMatch m where m.orgId = :orgId and m.id = :id")
    Optional<RequirementMatch> lockByOrgIdAndId(@Param("orgId") Long orgId, @Param("id") Long id);

    List<RequirementMatch> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<RequirementMatch> findByOrgIdAndRequirementIdOrderByScoreDesc(Long orgId, Long requirementId);

    List<RequirementMatch> findByOrgIdAndConsultantIdOrderByScoreDesc(Long orgId, Long consultantId);

    long countByOrgIdAndStatus(Long orgId, String status);

    long countByOrgIdAndRequirementId(Long orgId, Long requirementId);

    long countByOrgIdAndStatusAndAssignedAtLessThan(Long orgId, String status, Instant before);

    @Query("select count(distinct m.requirementId) from RequirementMatch m where m.orgId = :orgId and m.score >= :minScore")
    long countRequirementsWithScoreAtLeast(@Param("orgId") Long orgId, @Param("minScore") int minScore);

}
