package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsInterviewDetail;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_interview_detail}: every method takes the organization id first. */
public interface CwsInterviewDetailRepository extends JpaRepository<CwsInterviewDetail, Long> {
    List<CwsInterviewDetail> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    Optional<CwsInterviewDetail> findByOrgIdAndInterviewId(Long orgId, Long interviewId);
}
