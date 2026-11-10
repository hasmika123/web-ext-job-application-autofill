package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.ClientNote;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code client_note}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface ClientNoteRepository extends Repository<ClientNote, Long> {
    <S extends ClientNote> S save(S entity);

    <S extends ClientNote> S saveAndFlush(S entity);

    <S extends ClientNote> List<S> saveAll(Iterable<S> entities);

    Optional<ClientNote> findByOrgIdAndId(Long orgId, Long id);

    List<ClientNote> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<ClientNote> findByOrgIdAndClientIdOrderByCreatedAtDescIdDesc(Long orgId, Long clientId);

    long countByOrgIdAndClientId(Long orgId, Long clientId);
}
