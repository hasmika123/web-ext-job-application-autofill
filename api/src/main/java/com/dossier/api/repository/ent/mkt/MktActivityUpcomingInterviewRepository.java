package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.TalentInterview;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Activities "Upcoming" read of {@code talent_interview} (SCHEDULED slots in a window). Every method takes the organization id first. */
public interface MktActivityUpcomingInterviewRepository extends Repository<TalentInterview, Long> {

    /** {id, scheduledAt, consultantId, clientId, roundLabel} of SCHEDULED slots in {@code [from, to)}, soonest first, for the consultants in scope. */
    @Query("select i.id, i.scheduledAt, i.consultantId, i.clientId, i.roundLabel from TalentInterview i "
        + "where i.orgId = :orgId and (:all = true or i.consultantId in :ids) and i.status = 'SCHEDULED' and i.scheduledAt >= :from and i.scheduledAt < :to order by i.scheduledAt asc, i.id asc")
    List<Object[]> upcoming(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to, Pageable page);
}
