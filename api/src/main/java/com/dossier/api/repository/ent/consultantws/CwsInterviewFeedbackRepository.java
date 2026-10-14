package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsInterviewFeedback;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_interview_feedback}: every method takes the organization id first. */
public interface CwsInterviewFeedbackRepository extends JpaRepository<CwsInterviewFeedback, Long> {
    List<CwsInterviewFeedback> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    Optional<CwsInterviewFeedback> findByOrgIdAndInterviewId(Long orgId, Long interviewId);
}
