package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsInterviewDetail;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_interview_detail}: every method takes the organization id first. */
public interface CwsInterviewDetailRepository extends Repository<CwsInterviewDetail, Long> {
    <S extends CwsInterviewDetail> S save(S entity);

    <S extends CwsInterviewDetail> S saveAndFlush(S entity);

    void flush();

    <S extends CwsInterviewDetail> List<S> saveAll(Iterable<S> entities);

    void delete(CwsInterviewDetail entity);

    List<CwsInterviewDetail> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    Optional<CwsInterviewDetail> findByOrgIdAndInterviewId(Long orgId, Long interviewId);
}
