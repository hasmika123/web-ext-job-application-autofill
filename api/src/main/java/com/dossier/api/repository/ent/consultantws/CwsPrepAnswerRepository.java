package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPrepAnswer;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_prep_answer}: every method takes the organization id first. */
public interface CwsPrepAnswerRepository extends JpaRepository<CwsPrepAnswer, Long> {
    List<CwsPrepAnswer> findByOrgIdAndSessionIdOrderByPositionAsc(Long orgId, Long sessionId);

    List<CwsPrepAnswer> findByOrgIdAndSessionIdIn(Long orgId, Collection<Long> sessionIds);
}
