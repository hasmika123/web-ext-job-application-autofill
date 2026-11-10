package com.dossier.api.repository.ent.mgmt;

import com.dossier.api.domain.ent.mgmt.MktEscalation;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
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

    /** The manager's filter: the team's rows (a row is the team's when its marketer or its consultant is), in these statuses, with the optional filters; {@code q} is a lower-cased LIKE pattern (escape !). */
    String TEAM_FILTER =
        "e.orgId = :orgId and (:all = true or e.marketerMemberId in :marketerIds or e.consultantId in :consultantIds) and e.status in :statuses "
            + "and (:severity is null or e.severity = :severity) and (:kind is null or e.kind = :kind) and (:marketer is null or e.marketerMemberId = :marketer) "
            + "and (:consultant is null or e.consultantId = :consultant) and (:q is null or lower(e.title) like :q escape '!')";

    /** Live rows: the most severe first, then the oldest. */
    @Query("select e from MktEscalation e where " + TEAM_FILTER + " order by case e.severity when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end, e.raisedAt asc, e.id asc")
    Page<MktEscalation> searchLive(
        @Param("orgId") Long orgId,
        @Param("all") boolean all,
        @Param("marketerIds") Collection<Long> marketerIds,
        @Param("consultantIds") Collection<Long> consultantIds,
        @Param("statuses") Collection<String> statuses,
        @Param("severity") String severity,
        @Param("kind") String kind,
        @Param("marketer") Long marketer,
        @Param("consultant") Long consultant,
        @Param("q") String q,
        Pageable page
    );

    /** Closed rows: the latest first. */
    @Query("select e from MktEscalation e where " + TEAM_FILTER + " order by e.updatedAt desc, e.id desc")
    Page<MktEscalation> searchClosed(
        @Param("orgId") Long orgId,
        @Param("all") boolean all,
        @Param("marketerIds") Collection<Long> marketerIds,
        @Param("consultantIds") Collection<Long> consultantIds,
        @Param("statuses") Collection<String> statuses,
        @Param("severity") String severity,
        @Param("kind") String kind,
        @Param("marketer") Long marketer,
        @Param("consultant") Long consultant,
        @Param("q") String q,
        Pageable page
    );

    /** {@code [severity, status, count]} of the team's live rows (OPEN, ACKNOWLEDGED, SNOOZED): the badge and the Home tile. */
    @Query(
        "select e.severity, e.status, count(e) from MktEscalation e where e.orgId = :orgId and (:all = true or e.marketerMemberId in :marketerIds or e.consultantId in :consultantIds) "
            + "and e.status in ('OPEN', 'ACKNOWLEDGED', 'SNOOZED') group by e.severity, e.status"
    )
    List<Object[]> liveCounts(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("marketerIds") Collection<Long> marketerIds, @Param("consultantIds") Collection<Long> consultantIds);

    /** The team's most severe live rows (OPEN or ACKNOWLEDGED), for the Home page's "needs you" list. */
    @Query(
        "select e from MktEscalation e where e.orgId = :orgId and (:all = true or e.marketerMemberId in :marketerIds or e.consultantId in :consultantIds) and e.status in ('OPEN', 'ACKNOWLEDGED') and e.severity = :severity "
            + "order by e.raisedAt asc, e.id asc"
    )
    List<MktEscalation> liveOfSeverity(
        @Param("orgId") Long orgId,
        @Param("all") boolean all,
        @Param("marketerIds") Collection<Long> marketerIds,
        @Param("consultantIds") Collection<Long> consultantIds,
        @Param("severity") String severity,
        Pageable page
    );

    /** Retention: closed escalations resolved or dismissed before {@code cutoff}. The trail goes with them (database cascade). */
    @Query("select e.id from MktEscalation e where e.orgId = :orgId and e.status in ('RESOLVED', 'DISMISSED') and e.updatedAt < :cutoff order by e.id")
    List<Long> purgeableIds(@Param("orgId") Long orgId, @Param("cutoff") Instant cutoff, Pageable page);

    @Modifying
    @Query("delete from MktEscalation e where e.orgId = :orgId and e.id in :ids")
    int deleteByOrgIdAndIdIn(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);
}
