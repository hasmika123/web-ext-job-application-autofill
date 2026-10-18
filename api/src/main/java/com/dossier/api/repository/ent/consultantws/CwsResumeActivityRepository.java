package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsResumeActivity;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_resume_activity}: every method takes the organization id first. */
public interface CwsResumeActivityRepository extends Repository<CwsResumeActivity, Long> {
    <S extends CwsResumeActivity> S save(S entity);

    <S extends CwsResumeActivity> S saveAndFlush(S entity);

    void flush();

    <S extends CwsResumeActivity> List<S> saveAll(Iterable<S> entities);

    void delete(CwsResumeActivity entity);

    List<CwsResumeActivity> findByOrgIdAndConsultantIdOrderByOccurredAtDesc(Long orgId, Long consultantId);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
