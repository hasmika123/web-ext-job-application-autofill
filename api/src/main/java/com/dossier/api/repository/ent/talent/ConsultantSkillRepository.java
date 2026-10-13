package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.ConsultantSkill;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code consultant_skill}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface ConsultantSkillRepository extends JpaRepository<ConsultantSkill, Long> {
    Optional<ConsultantSkill> findByOrgIdAndId(Long orgId, Long id);

    List<ConsultantSkill> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<ConsultantSkill> findByOrgIdAndConsultantIdOrderBySortOrderAsc(Long orgId, Long consultantId);

    List<ConsultantSkill> findByOrgIdAndConsultantIdIn(Long orgId, Collection<Long> consultantIds);

}
