package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.PlacementExtension;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to the PlacementExtension rows: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface PlacementExtensionRepository extends Repository<PlacementExtension, Long> {
    <S extends PlacementExtension> S save(S entity);

    <S extends PlacementExtension> S saveAndFlush(S entity);

    void flush();

    <S extends PlacementExtension> List<S> saveAll(Iterable<S> entities);

    Optional<PlacementExtension> findByOrgIdAndId(Long orgId, Long id);

    List<PlacementExtension> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<PlacementExtension> findByOrgIdAndPlacementIdOrderByCreatedAtDescIdDesc(Long orgId, Long placementId);

    long countByOrgIdAndStatus(Long orgId, String status);
}
