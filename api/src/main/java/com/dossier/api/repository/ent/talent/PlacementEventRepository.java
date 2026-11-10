package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.PlacementEvent;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to the PlacementEvent rows: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface PlacementEventRepository extends Repository<PlacementEvent, Long> {
    <S extends PlacementEvent> S save(S entity);

    <S extends PlacementEvent> S saveAndFlush(S entity);

    void flush();

    <S extends PlacementEvent> List<S> saveAll(Iterable<S> entities);

    Optional<PlacementEvent> findByOrgIdAndId(Long orgId, Long id);

    List<PlacementEvent> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<PlacementEvent> findByOrgIdAndPlacementIdOrderByOccurredAtDescIdDesc(Long orgId, Long placementId);

    Optional<PlacementEvent> findFirstByOrgIdAndPlacementIdOrderByOccurredAtDescIdDesc(Long orgId, Long placementId);
}
