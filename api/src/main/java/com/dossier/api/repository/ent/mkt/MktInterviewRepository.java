package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.TalentInterview;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * The Interviews page's own org-scoped reads over {@code talent_interview} (the talent repository stays untouched). Cancelled slots are
 * never part of the board. Every method takes the organization id first.
 */
public interface MktInterviewRepository extends JpaRepository<TalentInterview, Long> {

    Optional<TalentInterview> findByOrgIdAndId(Long orgId, Long id);

    @Query("select i from TalentInterview i where i.orgId = :orgId and i.status <> 'CANCELLED' and i.scheduledAt >= :from and i.scheduledAt < :to order by i.scheduledAt asc")
    List<TalentInterview> findLiveInWindow(@Param("orgId") Long orgId, @Param("from") Instant from, @Param("to") Instant to);

    /** Every live slot that started before {@code before}: the candidates for "pending feedback". */
    @Query("select i from TalentInterview i where i.orgId = :orgId and i.status <> 'CANCELLED' and i.scheduledAt < :before order by i.scheduledAt desc")
    List<TalentInterview> findLiveStartedBefore(@Param("orgId") Long orgId, @Param("before") Instant before);

    @Query("select i from TalentInterview i where i.orgId = :orgId and i.status <> 'CANCELLED' and i.scheduledAt >= :from order by i.scheduledAt asc")
    List<TalentInterview> findLiveFrom(@Param("orgId") Long orgId, @Param("from") Instant from);

    /** {id, displayName, jobTitle} of the given consultants of this organization. {@code ids} must not be empty. */
    @Query("select c.id, c.displayName, c.jobTitle from ConsultantProfile c where c.orgId = :orgId and c.id in :ids")
    List<Object[]> findConsultantNames(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    /** {id, name} of the given clients of this organization. {@code ids} must not be empty. */
    @Query("select a.id, a.name from ClientAccount a where a.orgId = :orgId and a.id in :ids")
    List<Object[]> findClientNames(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    /** {applicationId, job title} for the given applications of this organization. {@code ids} must not be empty. */
    @Query("select a.id, r.title from TalentApplication a, ClientRequirement r where a.orgId = :orgId and r.orgId = :orgId and a.requirementId = r.id and a.id in :ids")
    List<Object[]> findRoleTitles(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);
}
