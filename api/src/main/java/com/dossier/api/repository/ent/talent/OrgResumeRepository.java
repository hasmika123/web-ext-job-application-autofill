package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.OrgResume;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code org_resume}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface OrgResumeRepository extends Repository<OrgResume, Long> {
    <S extends OrgResume> S save(S entity);

    <S extends OrgResume> S saveAndFlush(S entity);

    void flush();

    <S extends OrgResume> List<S> saveAll(Iterable<S> entities);

    <S extends OrgResume> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<OrgResume> findByOrgIdAndId(Long orgId, Long id);

    List<OrgResume> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<OrgResume> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    long countByOrgIdAndApprovalStatus(Long orgId, String approvalStatus);

    /** True when the consultant has at least one resume with this approval status (the assignment gate asks for APPROVED). */
    boolean existsByOrgIdAndConsultantIdAndApprovalStatus(Long orgId, Long consultantId, String approvalStatus);

    long countByOrgIdAndPrimaryForOrgTrue(Long orgId);

    long countByOrgIdAndUpdatedAtGreaterThanEqual(Long orgId, Instant since);

    long countByOrgIdAndCreatedAtLessThan(Long orgId, Instant before);

}
