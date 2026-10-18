package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.MarketerAssignment;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code marketer_assignment}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface MarketerAssignmentRepository extends Repository<MarketerAssignment, Long> {
    <S extends MarketerAssignment> S save(S entity);

    <S extends MarketerAssignment> S saveAndFlush(S entity);

    void flush();

    <S extends MarketerAssignment> List<S> saveAll(Iterable<S> entities);

    <S extends MarketerAssignment> List<S> saveAllAndFlush(Iterable<S> entities);

    void delete(MarketerAssignment entity);

    void deleteAll(Iterable<? extends MarketerAssignment> entities);

    Optional<MarketerAssignment> findByOrgIdAndId(Long orgId, Long id);

    List<MarketerAssignment> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    Optional<MarketerAssignment> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    List<MarketerAssignment> findByOrgIdAndMarketerMemberId(Long orgId, Long marketerMemberId);

    List<MarketerAssignment> findByOrgIdAndBackupMemberId(Long orgId, Long backupMemberId);

    long countByOrgIdAndMarketerMemberId(Long orgId, Long marketerMemberId);

    long countByOrgIdAndAssignedAtLessThan(Long orgId, Instant before);

}
