package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktResumeEvent;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code mkt_resume_event}: every method takes the organization id first. */
public interface MktResumeEventRepository extends JpaRepository<MktResumeEvent, Long> {

    long countByOrgId(Long orgId);

    /** Every event of the given resumes, oldest first (the page derives "needs update" from the latest and "recent activity" from the newest). */
    @Query("select e from MktResumeEvent e where e.orgId = :orgId and e.resumeId in :resumeIds order by e.occurredAt asc, e.id asc")
    List<MktResumeEvent> forResumes(@Param("orgId") Long orgId, @Param("resumeIds") Collection<Long> resumeIds);
}
