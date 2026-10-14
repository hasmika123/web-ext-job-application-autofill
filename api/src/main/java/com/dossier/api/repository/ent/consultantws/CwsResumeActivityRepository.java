package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsResumeActivity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_resume_activity}: every method takes the organization id first. */
public interface CwsResumeActivityRepository extends JpaRepository<CwsResumeActivity, Long> {
    List<CwsResumeActivity> findByOrgIdAndConsultantIdOrderByOccurredAtDesc(Long orgId, Long consultantId);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
