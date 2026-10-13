package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.RequirementMatch;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/**
 * The Job Discovery page's own org-scoped view of {@code requirement_match} (the shared talent repository is not edited). Every method
 * names the organization first. The caller filters rows by the consultants its {@code MktScope.View} may see.
 */
public interface MktJobMatchRepository extends Repository<RequirementMatch, Long> {
    RequirementMatch save(RequirementMatch match);

    List<RequirementMatch> findByOrgIdAndStatus(Long orgId, String status);

    List<RequirementMatch> findByOrgIdAndScoreGreaterThanEqual(Long orgId, Integer minScore);

    List<RequirementMatch> findByOrgIdAndRequirementIdOrderByScoreDesc(Long orgId, Long requirementId);

    Optional<RequirementMatch> findByOrgIdAndRequirementIdAndConsultantId(Long orgId, Long requirementId, Long consultantId);
}
