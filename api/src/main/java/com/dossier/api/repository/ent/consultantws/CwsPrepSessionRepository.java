package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPrepSession;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_prep_session}: every method takes the organization id first. */
public interface CwsPrepSessionRepository extends JpaRepository<CwsPrepSession, Long> {
    List<CwsPrepSession> findByOrgIdAndConsultantIdOrderByOccurredAtDesc(Long orgId, Long consultantId);

    Optional<CwsPrepSession> findByOrgIdAndId(Long orgId, Long id);
}
