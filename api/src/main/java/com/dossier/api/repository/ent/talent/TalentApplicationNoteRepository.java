package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.TalentApplicationNote;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code talent_application_note}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface TalentApplicationNoteRepository extends Repository<TalentApplicationNote, Long> {
    <S extends TalentApplicationNote> S save(S entity);

    <S extends TalentApplicationNote> S saveAndFlush(S entity);

    void flush();

    <S extends TalentApplicationNote> List<S> saveAll(Iterable<S> entities);

    <S extends TalentApplicationNote> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<TalentApplicationNote> findByOrgIdAndId(Long orgId, Long id);

    List<TalentApplicationNote> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<TalentApplicationNote> findByOrgIdAndApplicationIdOrderByCreatedAtDesc(Long orgId, Long applicationId);

    long countByOrgIdAndApplicationId(Long orgId, Long applicationId);

}
