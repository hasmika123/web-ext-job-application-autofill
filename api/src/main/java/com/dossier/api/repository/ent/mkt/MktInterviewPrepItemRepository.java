package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktInterviewPrepItem;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code mkt_interview_prep_item}; every method takes the organization id first. */
public interface MktInterviewPrepItemRepository extends JpaRepository<MktInterviewPrepItem, Long> {
    List<MktInterviewPrepItem> findByOrgIdAndInterviewIdOrderByPositionAsc(Long orgId, Long interviewId);

    Optional<MktInterviewPrepItem> findByOrgIdAndInterviewIdAndId(Long orgId, Long interviewId, Long id);

    long countByOrgIdAndInterviewId(Long orgId, Long interviewId);
}
