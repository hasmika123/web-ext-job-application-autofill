package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.OrgResumeExperience;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code org_resume_experience}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface OrgResumeExperienceRepository extends Repository<OrgResumeExperience, Long> {
    <S extends OrgResumeExperience> S save(S entity);

    <S extends OrgResumeExperience> S saveAndFlush(S entity);

    void flush();

    <S extends OrgResumeExperience> List<S> saveAll(Iterable<S> entities);

    <S extends OrgResumeExperience> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<OrgResumeExperience> findByOrgIdAndId(Long orgId, Long id);

    List<OrgResumeExperience> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<OrgResumeExperience> findByOrgIdAndResumeIdOrderBySortOrderAsc(Long orgId, Long resumeId);

}
