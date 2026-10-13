package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktSubmissionEvent;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code mkt_submission_event}: every method takes the organization id first. */
public interface MktSubmissionEventRepository extends JpaRepository<MktSubmissionEvent, Long> {
    long countByOrgId(Long orgId);

    List<MktSubmissionEvent> findByOrgIdAndSubmissionIdInOrderByOccurredAtAsc(Long orgId, Collection<Long> submissionIds);

    List<MktSubmissionEvent> findByOrgIdAndSubmissionIdOrderByOccurredAtAsc(Long orgId, Long submissionId);
}
