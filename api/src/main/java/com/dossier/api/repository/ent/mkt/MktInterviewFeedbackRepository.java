package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktInterviewFeedback;
import java.util.Collection;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code mkt_interview_feedback}; every method takes the organization id first. */
public interface MktInterviewFeedbackRepository extends Repository<MktInterviewFeedback, Long> {
    List<MktInterviewFeedback> findByOrgIdAndInterviewIdIn(Long orgId, Collection<Long> interviewIds);

    List<MktInterviewFeedback> findByOrgIdAndInterviewIdOrderByCreatedAtDesc(Long orgId, Long interviewId);

    long countByOrgId(Long orgId);

    <S extends MktInterviewFeedback> S save(S entity);
}
