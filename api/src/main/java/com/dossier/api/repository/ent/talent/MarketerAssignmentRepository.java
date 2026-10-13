package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.MarketerAssignment;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code marketer_assignment}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface MarketerAssignmentRepository extends JpaRepository<MarketerAssignment, Long> {
    Optional<MarketerAssignment> findByOrgIdAndId(Long orgId, Long id);

    List<MarketerAssignment> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    Optional<MarketerAssignment> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    List<MarketerAssignment> findByOrgIdAndMarketerMemberId(Long orgId, Long marketerMemberId);

    long countByOrgIdAndMarketerMemberId(Long orgId, Long marketerMemberId);

    long countByOrgIdAndAssignedAtLessThan(Long orgId, Instant before);

}
