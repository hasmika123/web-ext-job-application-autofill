package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPlacementChecklist;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to the CwsPlacementChecklist table: every method takes the organization id first. */
public interface CwsPlacementChecklistRepository extends JpaRepository<CwsPlacementChecklist, Long> {
    List<CwsPlacementChecklist> findByOrgIdAndPlacementIdOrderBySortNoAscIdAsc(Long orgId, Long placementId);

    Optional<CwsPlacementChecklist> findByOrgIdAndId(Long orgId, Long id);

    long countByOrgIdAndPlacementId(Long orgId, Long placementId);
}
