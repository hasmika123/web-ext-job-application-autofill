package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPlacementMeeting;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to the CwsPlacementMeeting table: every method takes the organization id first. */
public interface CwsPlacementMeetingRepository extends JpaRepository<CwsPlacementMeeting, Long> {
    List<CwsPlacementMeeting> findByOrgIdAndPlacementIdAndStartsAtGreaterThanEqualOrderByStartsAtAscIdAsc(Long orgId, Long placementId, Instant from);
}
