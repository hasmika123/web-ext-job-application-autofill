package com.dossier.api.repository.ent.consultant;

import com.dossier.api.domain.ent.talent.TalentApplication;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/**
 * The org-side projection ({@code talent_application}) of a consultant's own application, as the linker and the consultant endpoints need it.
 * Kept apart from the talent repositories so the marketer side stays untouched; every method takes the organization first.
 */
public interface ConProjectionRepository extends Repository<TalentApplication, Long> {

    <S extends TalentApplication> S save(S entity);

    Optional<TalentApplication> findByOrgIdAndId(Long orgId, Long id);

    /** The projection row of one (job, consultant) pair: the database allows at most one. */
    Optional<TalentApplication> findByOrgIdAndRequirementIdAndConsultantId(Long orgId, Long requirementId, Long consultantId);

    /** The rows fed by this personal application (SYSTEM-owned: only the consultant's own record moves them). */
    List<TalentApplication> findByOrgIdAndPersonalApplicationId(Long orgId, Long personalApplicationId);
}
