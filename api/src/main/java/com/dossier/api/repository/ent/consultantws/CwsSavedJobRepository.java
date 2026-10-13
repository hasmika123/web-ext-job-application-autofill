package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsSavedJob;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_saved_job}: every method takes the organization id first. */
public interface CwsSavedJobRepository extends JpaRepository<CwsSavedJob, Long> {
    List<CwsSavedJob> findByOrgIdAndConsultantIdOrderByCreatedAtDesc(Long orgId, Long consultantId);

    Optional<CwsSavedJob> findByOrgIdAndConsultantIdAndRequirementId(Long orgId, Long consultantId, Long requirementId);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
