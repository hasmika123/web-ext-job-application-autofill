package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsTaskDetail;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_task_detail}: every method takes the organization id first. */
public interface CwsTaskDetailRepository extends JpaRepository<CwsTaskDetail, Long> {
    List<CwsTaskDetail> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    Optional<CwsTaskDetail> findByOrgIdAndTaskId(Long orgId, Long taskId);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
