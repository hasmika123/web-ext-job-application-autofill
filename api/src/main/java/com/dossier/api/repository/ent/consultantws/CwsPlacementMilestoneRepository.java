package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPlacementMilestone;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to the CwsPlacementMilestone table: every method takes the organization id first. */
public interface CwsPlacementMilestoneRepository extends Repository<CwsPlacementMilestone, Long> {
    <S extends CwsPlacementMilestone> S save(S entity);

    <S extends CwsPlacementMilestone> S saveAndFlush(S entity);

    void flush();

    <S extends CwsPlacementMilestone> List<S> saveAll(Iterable<S> entities);

    void delete(CwsPlacementMilestone entity);

    List<CwsPlacementMilestone> findByOrgIdAndPlacementIdOrderByOnDateAscIdAsc(Long orgId, Long placementId);
}
