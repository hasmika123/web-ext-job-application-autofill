package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.talent.TalentInterview;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * The consultant workspace's own read queries over {@code talent_interview} (the shared talent repository stays untouched). Every method takes
 * the organization id first, and the consultant's own id wherever it reads a row on their behalf.
 */
public interface CwsInterviewRepository extends JpaRepository<TalentInterview, Long> {
    List<TalentInterview> findByOrgIdAndConsultantIdOrderByScheduledAtAsc(Long orgId, Long consultantId);

    Optional<TalentInterview> findByOrgIdAndIdAndConsultantId(Long orgId, Long id, Long consultantId);
}
