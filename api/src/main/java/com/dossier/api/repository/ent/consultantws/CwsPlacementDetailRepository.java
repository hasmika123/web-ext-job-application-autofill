package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPlacementDetail;
import java.util.Optional;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to the CwsPlacementDetail table: every method takes the organization id first. */
public interface CwsPlacementDetailRepository extends Repository<CwsPlacementDetail, Long> {
    <S extends CwsPlacementDetail> S save(S entity);

    <S extends CwsPlacementDetail> S saveAndFlush(S entity);

    void flush();

    <S extends CwsPlacementDetail> List<S> saveAll(Iterable<S> entities);

    void delete(CwsPlacementDetail entity);

    Optional<CwsPlacementDetail> findByOrgIdAndPlacementId(Long orgId, Long placementId);

    long countByOrgIdAndPlacementId(Long orgId, Long placementId);
}
