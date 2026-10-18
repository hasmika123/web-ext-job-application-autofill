package com.dossier.api.repository.ent.mgmt;

import com.dossier.api.domain.ent.mgmt.MktEscalation;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code mkt_escalation}: every method takes the organization id first. */
public interface MktEscalationRepository extends Repository<MktEscalation, Long> {

    <S extends MktEscalation> S save(S entity);

    <S extends MktEscalation> S saveAndFlush(S entity);

    Optional<MktEscalation> findByOrgIdAndId(Long orgId, Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from MktEscalation e where e.orgId = :orgId and e.id = :id")
    Optional<MktEscalation> lockByOrgIdAndId(@Param("orgId") Long orgId, @Param("id") Long id);

    /** The still-live escalation a rule raised for a subject (OPEN, ACKNOWLEDGED or SNOOZED), if any. */
    @Query(
        "select e from MktEscalation e where e.orgId = :orgId and e.ruleKey = :ruleKey and e.subjectType = :subjectType and e.subjectId = :subjectId "
            + "and e.status in ('OPEN', 'ACKNOWLEDGED', 'SNOOZED')"
    )
    Optional<MktEscalation> findLive(@Param("orgId") Long orgId, @Param("ruleKey") String ruleKey, @Param("subjectType") String subjectType, @Param("subjectId") Long subjectId);

    /** Every live escalation a rule raised (the rule re-checks them to auto-resolve or bump severity). */
    @Query("select e from MktEscalation e where e.orgId = :orgId and e.ruleKey = :ruleKey and e.status in ('OPEN', 'ACKNOWLEDGED', 'SNOOZED') order by e.id")
    List<MktEscalation> findLiveByRule(@Param("orgId") Long orgId, @Param("ruleKey") String ruleKey);

    /** SNOOZED escalations whose snooze has run out (they come back as OPEN). */
    @Query("select e from MktEscalation e where e.orgId = :orgId and e.status = 'SNOOZED' and e.snoozedUntil <= :now order by e.id")
    List<MktEscalation> findWokenSnoozes(@Param("orgId") Long orgId, @Param("now") Instant now);

    long countByOrgIdAndStatus(Long orgId, String status);

    /** Retention: closed escalations resolved or dismissed before {@code cutoff}. The trail goes with them (database cascade). */
    @Query("select e.id from MktEscalation e where e.orgId = :orgId and e.status in ('RESOLVED', 'DISMISSED') and e.updatedAt < :cutoff order by e.id")
    List<Long> purgeableIds(@Param("orgId") Long orgId, @Param("cutoff") Instant cutoff, Pageable page);

    @Modifying
    @Query("delete from MktEscalation e where e.orgId = :orgId and e.id in :ids")
    int deleteByOrgIdAndIdIn(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);
}
