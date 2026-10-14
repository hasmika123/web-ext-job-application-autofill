package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.RequirementSkill;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code requirement_skill}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface RequirementSkillRepository extends Repository<RequirementSkill, Long> {
    <S extends RequirementSkill> S save(S entity);

    <S extends RequirementSkill> S saveAndFlush(S entity);

    void flush();

    <S extends RequirementSkill> List<S> saveAll(Iterable<S> entities);

    <S extends RequirementSkill> List<S> saveAllAndFlush(Iterable<S> entities);

    void delete(RequirementSkill entity);

    void deleteAll(Iterable<? extends RequirementSkill> entities);

    Optional<RequirementSkill> findByOrgIdAndId(Long orgId, Long id);

    List<RequirementSkill> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<RequirementSkill> findByOrgIdAndRequirementIdIn(Long orgId, Collection<Long> requirementIds);

}
