package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.TalentInterview;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Marketing "My Assigned Talent" reads of {@code talent_interview} (non-cancelled slots from a point in time). Every method takes the organization id first. */
public interface MktTalentInterviewRepository extends JpaRepository<TalentInterview, Long> {

    @Query("select i from TalentInterview i where i.orgId = :orgId and i.consultantId in :ids and i.status <> 'CANCELLED' and i.scheduledAt >= :from")
    List<TalentInterview> findLiveSince(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids, @Param("from") Instant from);

    @Query("select i from TalentInterview i where i.orgId = :orgId and i.consultantId = :consultantId and i.status = 'SCHEDULED' and i.scheduledAt >= :from order by i.scheduledAt asc")
    List<TalentInterview> findUpcomingForConsultant(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("from") Instant from);
}
