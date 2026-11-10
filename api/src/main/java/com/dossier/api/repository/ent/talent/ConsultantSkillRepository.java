package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.ConsultantSkill;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code consultant_skill}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface ConsultantSkillRepository extends Repository<ConsultantSkill, Long> {
    <S extends ConsultantSkill> S save(S entity);

    <S extends ConsultantSkill> S saveAndFlush(S entity);

    void delete(ConsultantSkill entity);

    void flush();

    <S extends ConsultantSkill> List<S> saveAll(Iterable<S> entities);

    <S extends ConsultantSkill> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<ConsultantSkill> findByOrgIdAndId(Long orgId, Long id);

    List<ConsultantSkill> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<ConsultantSkill> findByOrgIdAndConsultantIdOrderBySortOrderAsc(Long orgId, Long consultantId);

    List<ConsultantSkill> findByOrgIdAndConsultantIdIn(Long orgId, Collection<Long> consultantIds);

}
