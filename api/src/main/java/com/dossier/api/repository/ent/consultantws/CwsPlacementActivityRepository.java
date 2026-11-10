package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPlacementActivity;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.Repository;

/** Org-scoped access to the CwsPlacementActivity table: every method takes the organization id first. */
public interface CwsPlacementActivityRepository extends Repository<CwsPlacementActivity, Long> {
    <S extends CwsPlacementActivity> S save(S entity);

    <S extends CwsPlacementActivity> S saveAndFlush(S entity);

    void flush();

    <S extends CwsPlacementActivity> List<S> saveAll(Iterable<S> entities);

    void delete(CwsPlacementActivity entity);

    List<CwsPlacementActivity> findByOrgIdAndPlacementIdOrderByOccurredAtDescIdDesc(Long orgId, Long placementId, Pageable page);

    long countByOrgIdAndPlacementId(Long orgId, Long placementId);
}
