package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsTask;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_task}: every method takes the organization id first. */
public interface CwsTaskRepository extends JpaRepository<CwsTask, Long> {
    Optional<CwsTask> findByOrgIdAndId(Long orgId, Long id);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);

    List<CwsTask> findByOrgIdAndConsultantIdAndStatusNotOrderByDueOnAsc(Long orgId, Long consultantId, String status);
}
