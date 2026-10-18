package com.dossier.api.repository.ent.consultant;

import com.dossier.api.domain.ent.talent.TalentInterview;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/**
 * The org-side copy ({@code talent_interview}) of an interview the consultant's own inbox created, as the consultant Interviews page reads it. Every
 * method takes the organization first.
 */
public interface ConInterviewProjectionRepository extends Repository<TalentInterview, Long> {

    <S extends TalentInterview> S save(S entity);

    /** The row that follows this personal interview in this organization; at most one is ever written. */
    Optional<TalentInterview> findFirstByOrgIdAndPersonalInterviewId(Long orgId, Long personalInterviewId);
}
