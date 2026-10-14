package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPlacementMilestone;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to the CwsPlacementMilestone table: every method takes the organization id first. */
public interface CwsPlacementMilestoneRepository extends JpaRepository<CwsPlacementMilestone, Long> {
    List<CwsPlacementMilestone> findByOrgIdAndPlacementIdOrderByOnDateAscIdAsc(Long orgId, Long placementId);
}
