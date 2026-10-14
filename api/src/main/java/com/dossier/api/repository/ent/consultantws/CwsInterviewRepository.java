package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.talent.TalentInterview;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/**
 * The consultant workspace's own read queries over {@code talent_interview} (the shared talent repository stays untouched). Every method takes
 * the organization id first, and the consultant's own id wherever it reads a row on their behalf.
 */
public interface CwsInterviewRepository extends Repository<TalentInterview, Long> {
    <S extends TalentInterview> S save(S entity);

    <S extends TalentInterview> S saveAndFlush(S entity);

    void flush();

    <S extends TalentInterview> List<S> saveAll(Iterable<S> entities);

    void delete(TalentInterview entity);

    List<TalentInterview> findByOrgIdAndConsultantIdOrderByScheduledAtAsc(Long orgId, Long consultantId);

    Optional<TalentInterview> findByOrgIdAndIdAndConsultantId(Long orgId, Long id, Long consultantId);
}
