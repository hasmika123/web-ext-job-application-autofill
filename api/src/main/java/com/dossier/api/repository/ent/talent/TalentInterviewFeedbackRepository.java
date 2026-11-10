package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.TalentInterviewFeedback;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to the TalentInterviewFeedback rows: every method takes the organization id first. */
public interface TalentInterviewFeedbackRepository extends Repository<TalentInterviewFeedback, Long> {
    <S extends TalentInterviewFeedback> S save(S entity);

    <S extends TalentInterviewFeedback> S saveAndFlush(S entity);

    void flush();

    <S extends TalentInterviewFeedback> List<S> saveAll(Iterable<S> entities);

    <S extends TalentInterviewFeedback> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<TalentInterviewFeedback> findByOrgIdAndId(Long orgId, Long id);

    long countByOrgId(Long orgId);

    List<TalentInterviewFeedback> findByOrgIdAndInterviewIdOrderByCreatedAtDescIdDesc(Long orgId, Long interviewId);
}
