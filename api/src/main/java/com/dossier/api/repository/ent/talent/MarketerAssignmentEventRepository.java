package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.MarketerAssignmentEvent;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code marketer_assignment_event}: append and read only. Every method takes the organization id first. */
public interface MarketerAssignmentEventRepository extends Repository<MarketerAssignmentEvent, Long> {
    <S extends MarketerAssignmentEvent> S save(S entity);

    <S extends MarketerAssignmentEvent> S saveAndFlush(S entity);

    /** Newest first. */
    List<MarketerAssignmentEvent> findByOrgIdAndConsultantIdOrderByOccurredAtDescIdDesc(Long orgId, Long consultantId);

    long countByOrgId(Long orgId);
}
