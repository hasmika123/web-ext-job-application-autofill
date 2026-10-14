package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPlacementDetail;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to the CwsPlacementDetail table: every method takes the organization id first. */
public interface CwsPlacementDetailRepository extends JpaRepository<CwsPlacementDetail, Long> {
    Optional<CwsPlacementDetail> findByOrgIdAndPlacementId(Long orgId, Long placementId);

    long countByOrgIdAndPlacementId(Long orgId, Long placementId);
}
