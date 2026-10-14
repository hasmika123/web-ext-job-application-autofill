package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktSubmissionEvent;
import java.util.Collection;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code mkt_submission_event}: every method takes the organization id first. */
public interface MktSubmissionEventRepository extends Repository<MktSubmissionEvent, Long> {
    long countByOrgId(Long orgId);

    List<MktSubmissionEvent> findByOrgIdAndSubmissionIdInOrderByOccurredAtAsc(Long orgId, Collection<Long> submissionIds);

    List<MktSubmissionEvent> findByOrgIdAndSubmissionIdOrderByOccurredAtAsc(Long orgId, Long submissionId);

    <S extends MktSubmissionEvent> S save(S entity);
}
