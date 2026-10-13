package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktInterviewMeta;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code mkt_interview_meta}; every method takes the organization id first. */
public interface MktInterviewMetaRepository extends JpaRepository<MktInterviewMeta, Long> {
    Optional<MktInterviewMeta> findByOrgIdAndInterviewId(Long orgId, Long interviewId);

    List<MktInterviewMeta> findByOrgIdAndInterviewIdIn(Long orgId, Collection<Long> interviewIds);

    long countByOrgId(Long orgId);
}
