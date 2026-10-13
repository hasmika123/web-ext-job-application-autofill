package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.TalentApplicationNote;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code talent_application_note}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface TalentApplicationNoteRepository extends JpaRepository<TalentApplicationNote, Long> {
    Optional<TalentApplicationNote> findByOrgIdAndId(Long orgId, Long id);

    List<TalentApplicationNote> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<TalentApplicationNote> findByOrgIdAndApplicationIdOrderByCreatedAtDesc(Long orgId, Long applicationId);

    long countByOrgIdAndApplicationId(Long orgId, Long applicationId);

}
