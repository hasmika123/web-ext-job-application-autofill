package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.RequirementMatch;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code requirement_match}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface RequirementMatchRepository extends Repository<RequirementMatch, Long> {
    <S extends RequirementMatch> S save(S entity);

    <S extends RequirementMatch> S saveAndFlush(S entity);

    Optional<RequirementMatch> findByOrgIdAndId(Long orgId, Long id);

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
