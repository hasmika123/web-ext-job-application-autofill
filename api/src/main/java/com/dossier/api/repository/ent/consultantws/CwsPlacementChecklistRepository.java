package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPlacementChecklist;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to the CwsPlacementChecklist table: every method takes the organization id first. */
public interface CwsPlacementChecklistRepository extends Repository<CwsPlacementChecklist, Long> {
    <S extends CwsPlacementChecklist> S save(S entity);

    <S extends CwsPlacementChecklist> S saveAndFlush(S entity);

    void flush();

    <S extends CwsPlacementChecklist> List<S> saveAll(Iterable<S> entities);

    void delete(CwsPlacementChecklist entity);

    List<CwsPlacementChecklist> findByOrgIdAndPlacementIdOrderBySortNoAscIdAsc(Long orgId, Long placementId);

    Optional<CwsPlacementChecklist> findByOrgIdAndId(Long orgId, Long id);

    long countByOrgIdAndPlacementId(Long orgId, Long placementId);
}
