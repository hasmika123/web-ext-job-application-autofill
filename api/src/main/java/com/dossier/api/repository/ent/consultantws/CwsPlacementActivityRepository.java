package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPlacementActivity;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to the CwsPlacementActivity table: every method takes the organization id first. */
public interface CwsPlacementActivityRepository extends JpaRepository<CwsPlacementActivity, Long> {
    List<CwsPlacementActivity> findByOrgIdAndPlacementIdOrderByOccurredAtDescIdDesc(Long orgId, Long placementId, Pageable page);

    long countByOrgIdAndPlacementId(Long orgId, Long placementId);
}
