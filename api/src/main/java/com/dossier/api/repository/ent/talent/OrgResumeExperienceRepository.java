package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.OrgResumeExperience;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code org_resume_experience}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface OrgResumeExperienceRepository extends JpaRepository<OrgResumeExperience, Long> {
    Optional<OrgResumeExperience> findByOrgIdAndId(Long orgId, Long id);

    List<OrgResumeExperience> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<OrgResumeExperience> findByOrgIdAndResumeIdOrderBySortOrderAsc(Long orgId, Long resumeId);

}
