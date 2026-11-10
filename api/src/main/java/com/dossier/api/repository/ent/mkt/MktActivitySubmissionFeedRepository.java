package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktSubmissionEvent;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Activities feed read of {@code mkt_submission_event}, joined to its submission (consultant, client, job). Every method takes the organization id first. */
public interface MktActivitySubmissionFeedRepository extends Repository<MktSubmissionEvent, Long> {

    /** {id, kind, field, toValue, detail, consultantId, clientId, jobTitle, actorMemberId, occurredAt}, newest first, for the consultants in scope. */
    @Query("select e.id, e.kind, e.field, e.toValue, e.detail, s.consultantId, s.clientId, r.title, e.actorMemberId, e.occurredAt "
        + "from MktSubmissionEvent e join MktSubmission s on s.orgId = e.orgId and s.id = e.submissionId "
        + "left join ClientRequirement r on r.orgId = s.orgId and r.id = s.requirementId "
        + "where e.orgId = :orgId and (:all = true or s.consultantId in :ids) and e.occurredAt >= :from and e.occurredAt < :to order by e.occurredAt desc, e.id desc")
    List<Object[]> feed(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to, Pageable page);
}
