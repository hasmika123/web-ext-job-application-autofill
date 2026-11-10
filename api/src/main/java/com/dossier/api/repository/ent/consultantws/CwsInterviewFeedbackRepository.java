package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsInterviewFeedback;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_interview_feedback}: every method takes the organization id first. */
public interface CwsInterviewFeedbackRepository extends Repository<CwsInterviewFeedback, Long> {
    <S extends CwsInterviewFeedback> S save(S entity);

    <S extends CwsInterviewFeedback> S saveAndFlush(S entity);

    void flush();

    <S extends CwsInterviewFeedback> List<S> saveAll(Iterable<S> entities);

    void delete(CwsInterviewFeedback entity);

    List<CwsInterviewFeedback> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    Optional<CwsInterviewFeedback> findByOrgIdAndInterviewId(Long orgId, Long interviewId);
}
