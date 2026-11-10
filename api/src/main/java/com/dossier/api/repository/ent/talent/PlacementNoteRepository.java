package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.PlacementNote;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to the PlacementNote rows: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface PlacementNoteRepository extends Repository<PlacementNote, Long> {
    <S extends PlacementNote> S save(S entity);

    <S extends PlacementNote> S saveAndFlush(S entity);

    void flush();

    <S extends PlacementNote> List<S> saveAll(Iterable<S> entities);

    Optional<PlacementNote> findByOrgIdAndId(Long orgId, Long id);

    List<PlacementNote> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<PlacementNote> findByOrgIdAndPlacementIdOrderByCreatedAtDescIdDesc(Long orgId, Long placementId);

    long countByOrgIdAndPlacementId(Long orgId, Long placementId);
}
