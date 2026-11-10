package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPlacementMeeting;
import java.time.Instant;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to the CwsPlacementMeeting table: every method takes the organization id first. */
public interface CwsPlacementMeetingRepository extends Repository<CwsPlacementMeeting, Long> {
    <S extends CwsPlacementMeeting> S save(S entity);

    <S extends CwsPlacementMeeting> S saveAndFlush(S entity);

    void flush();

    <S extends CwsPlacementMeeting> List<S> saveAll(Iterable<S> entities);

    void delete(CwsPlacementMeeting entity);

    List<CwsPlacementMeeting> findByOrgIdAndPlacementIdAndStartsAtGreaterThanEqualOrderByStartsAtAscIdAsc(Long orgId, Long placementId, Instant from);
}
