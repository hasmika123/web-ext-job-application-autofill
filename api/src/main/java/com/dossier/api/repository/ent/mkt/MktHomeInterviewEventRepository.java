package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktInterviewEvent;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Marketing Home "Recent Activity" reads of {@code mkt_interview_event}. Every method takes the organization id first. */
public interface MktHomeInterviewEventRepository extends Repository<MktInterviewEvent, Long> {

    /** {eventId, kind, detail, occurredAt, consultantId, consultantName} newest first, for the consultants in scope ({@code all} = ORG scope, {@code ids} never empty). */
    @Query("select e.id, e.kind, e.detail, e.occurredAt, i.consultantId, c.displayName from MktInterviewEvent e, TalentInterview i, ConsultantProfile c "
        + "where e.orgId = :orgId and i.orgId = :orgId and c.orgId = :orgId and e.interviewId = i.id and c.id = i.consultantId and (:all = true or i.consultantId in :ids) "
        + "order by e.occurredAt desc, e.id desc")
    List<Object[]> findRecent(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, Pageable pageable);
}
