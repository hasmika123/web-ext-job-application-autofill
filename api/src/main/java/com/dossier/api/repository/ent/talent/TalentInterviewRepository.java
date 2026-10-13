package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.TalentInterview;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code talent_interview}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface TalentInterviewRepository extends JpaRepository<TalentInterview, Long> {
    Optional<TalentInterview> findByOrgIdAndId(Long orgId, Long id);

    List<TalentInterview> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<TalentInterview> findByOrgIdAndScheduledAtBetweenOrderByScheduledAtAsc(Long orgId, Instant from, Instant to);

    long countByOrgIdAndStatusAndScheduledAtBetween(Long orgId, String status, Instant from, Instant to);

    List<TalentInterview> findByOrgIdAndConsultantIdAndStatusAndScheduledAtAfterOrderByScheduledAtAsc(Long orgId, Long consultantId, String status, Instant after);

    long countByOrgIdAndScheduledAtBetween(Long orgId, Instant from, Instant to);

}
