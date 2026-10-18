package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Activities feed read of {@code talent_application_event}, joined to its application (consultant, client, job). Every method takes the organization id first. */
public interface MktActivityApplicationFeedRepository extends Repository<TalentApplicationEvent, Long> {

    /** {id, eventType, toStage, detail, consultantId, clientId, jobTitle, actorMemberId, occurredAt}, newest first, for the consultants in scope. */
    @Query("select e.id, e.eventType, e.toStage, e.detail, a.consultantId, a.clientId, r.title, e.actorMemberId, e.occurredAt "
        + "from TalentApplicationEvent e join TalentApplication a on a.orgId = e.orgId and a.id = e.applicationId "
        + "left join ClientRequirement r on r.orgId = a.orgId and r.id = a.requirementId "
        + "where e.orgId = :orgId and (:all = true or a.consultantId in :ids) and e.occurredAt >= :from and e.occurredAt < :to order by e.occurredAt desc, e.id desc")
    List<Object[]> feed(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to, Pageable page);
}
