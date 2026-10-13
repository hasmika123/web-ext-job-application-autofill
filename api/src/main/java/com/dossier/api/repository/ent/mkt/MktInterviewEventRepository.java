package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktInterviewEvent;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code mkt_interview_event}; every method takes the organization id first. */
public interface MktInterviewEventRepository extends JpaRepository<MktInterviewEvent, Long> {
    List<MktInterviewEvent> findByOrgIdAndKindAndOccurredAtGreaterThanEqualAndOccurredAtLessThan(Long orgId, String kind, Instant from, Instant to);

    List<MktInterviewEvent> findByOrgIdAndInterviewIdAndKindAndOccurredAtGreaterThanEqual(Long orgId, Long interviewId, String kind, Instant since);

    /** {occurredAt, consultantId} of every event of {@code kind} in the window, joined to its interview so the caller can apply the consultant scope. */
    @Query("select e.occurredAt, i.consultantId from MktInterviewEvent e, TalentInterview i where e.orgId = :orgId and i.orgId = :orgId and e.interviewId = i.id and e.kind = :kind and e.occurredAt >= :from and e.occurredAt < :to")
    List<Object[]> findOccurrencesWithConsultant(@Param("orgId") Long orgId, @Param("kind") String kind, @Param("from") Instant from, @Param("to") Instant to);

    long countByOrgId(Long orgId);
}
