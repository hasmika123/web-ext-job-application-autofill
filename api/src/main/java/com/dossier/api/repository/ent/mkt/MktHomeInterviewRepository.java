package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.TalentInterview;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Marketing Home board reads of {@code talent_interview}. Every method takes the organization id first; the scoped ones take the caller's visible consultants as
 * {@code all} (ORG scope) plus {@code ids} (never empty: callers pass a sentinel list).
 */
public interface MktHomeInterviewRepository extends Repository<TalentInterview, Long> {

    /** Non-cancelled slots starting in {@code [from, to)}. */
    @Query("select count(i) from TalentInterview i where i.orgId = :orgId and (:all = true or i.consultantId in :ids) and i.status <> 'CANCELLED' and i.scheduledAt >= :from and i.scheduledAt < :to")
    long countLiveBetween(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from, @Param("to") Instant to);

    /** Consultants with a SCHEDULED slot from {@code from} on. */
    @Query("select distinct i.consultantId from TalentInterview i where i.orgId = :orgId and (:all = true or i.consultantId in :ids) and i.status = 'SCHEDULED' and i.scheduledAt >= :from")
    List<Long> findConsultantIdsWithUpcoming(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") Instant from);
}
