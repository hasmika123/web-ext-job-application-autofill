package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.RequirementSkill;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code requirement_skill}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface RequirementSkillRepository extends JpaRepository<RequirementSkill, Long> {
    Optional<RequirementSkill> findByOrgIdAndId(Long orgId, Long id);

    List<RequirementSkill> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<RequirementSkill> findByOrgIdAndRequirementIdIn(Long orgId, Collection<Long> requirementIds);

}
