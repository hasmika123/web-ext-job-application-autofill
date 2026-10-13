package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsMatchView;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_match_view}: every method takes the organization id first. */
public interface CwsMatchViewRepository extends JpaRepository<CwsMatchView, Long> {
    List<CwsMatchView> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    Optional<CwsMatchView> findByOrgIdAndConsultantIdAndRequirementId(Long orgId, Long consultantId, Long requirementId);
}
