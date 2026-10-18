package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.TalentInterviewInterviewer;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to the TalentInterviewInterviewer rows: every method takes the organization id first. */
public interface TalentInterviewInterviewerRepository extends Repository<TalentInterviewInterviewer, Long> {
    <S extends TalentInterviewInterviewer> S save(S entity);

    <S extends TalentInterviewInterviewer> S saveAndFlush(S entity);

    void flush();

    <S extends TalentInterviewInterviewer> List<S> saveAll(Iterable<S> entities);

    <S extends TalentInterviewInterviewer> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<TalentInterviewInterviewer> findByOrgIdAndId(Long orgId, Long id);

    long countByOrgId(Long orgId);

    List<TalentInterviewInterviewer> findByOrgIdAndInterviewIdOrderBySortOrderAsc(Long orgId, Long interviewId);

    List<TalentInterviewInterviewer> findByOrgIdAndInterviewIdInOrderBySortOrderAsc(Long orgId, Collection<Long> interviewIds);

    void deleteByOrgIdAndInterviewId(Long orgId, Long interviewId);
}
