package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.talent.TalentApplication;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Read-only aggregates behind the Org Admin Reports page. Every query names the organization first, returns plain rows and writes
 * nothing; there is no money column anywhere in here and no personal contact data (names of people come from the seat directory).
 */
public interface OrgReportsRepository extends Repository<TalentApplication, Long> {
    /** Active consultant profiles: {@code [marketingStatus, availabilityStatus, count]}. */
    @Query("select c.marketingStatus, c.availabilityStatus, count(c) from ConsultantProfile c where c.orgId = :orgId and c.status = 'ACTIVE' group by c.marketingStatus, c.availabilityStatus")
    List<Object[]> roster(@Param("orgId") Long orgId);

    /** Applications applied on or after {@code from}: {@code [stage, count]}. */
    @Query("select a.stage, count(a) from TalentApplication a where a.orgId = :orgId and a.appliedOn >= :from group by a.stage")
    List<Object[]> stageCounts(@Param("orgId") Long orgId, @Param("from") LocalDate from);

    /** Applications applied in {@code [from, to)}: {@code [appliedOn, count]}. */
    @Query("select a.appliedOn, count(a) from TalentApplication a where a.orgId = :orgId and a.appliedOn >= :from and a.appliedOn < :to group by a.appliedOn")
    List<Object[]> appliedPerDay(@Param("orgId") Long orgId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("select count(a) from TalentApplication a where a.orgId = :orgId and a.appliedOn >= :from and a.appliedOn < :to")
    long countApplied(@Param("orgId") Long orgId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** How many applications entered each stage in {@code [from, to)}: {@code [toStage, count]}. */
    @Query(
        "select e.toStage, count(e) from TalentApplicationEvent e where e.orgId = :orgId and e.eventType in ('CREATED', 'STAGE_CHANGE') " +
        "and e.toStage is not null and e.occurredAt >= :from and e.occurredAt < :to group by e.toStage"
    )
    List<Object[]> stageEntries(@Param("orgId") Long orgId, @Param("from") Instant from, @Param("to") Instant to);

    /** Interviews scheduled in {@code [from, to)}: {@code [scheduledAt, status]}. */
    @Query("select i.scheduledAt, i.status from TalentInterview i where i.orgId = :orgId and i.scheduledAt >= :from and i.scheduledAt < :to")
    List<Object[]> interviews(@Param("orgId") Long orgId, @Param("from") Instant from, @Param("to") Instant to);

    @Query("select count(i) from TalentInterview i where i.orgId = :orgId and i.scheduledAt >= :from and i.scheduledAt < :to and i.status = 'COMPLETED'")
    long countCompletedInterviews(@Param("orgId") Long orgId, @Param("from") Instant from, @Param("to") Instant to);

    /** Placements that started or ended on or after {@code from}: {@code [startDate, endDate, status]}. */
    @Query("select p.startDate, p.endDate, p.status from TalentPlacement p where p.orgId = :orgId and (p.startDate >= :from or p.endDate >= :from)")
    List<Object[]> placementDates(@Param("orgId") Long orgId, @Param("from") LocalDate from);

    @Query("select count(p) from TalentPlacement p where p.orgId = :orgId and p.status = 'ACTIVE' and p.startDate <= :today and (p.endDate is null or p.endDate > :today)")
    long countActivePlacements(@Param("orgId") Long orgId, @Param("today") LocalDate today);

    /** Clients by their running placements: {@code [clientName, count]}, most first. */
    @Query(
        "select c.name, count(p) from TalentPlacement p, ClientAccount c where p.orgId = :orgId and c.orgId = :orgId and c.id = p.clientId and p.status = 'ACTIVE' " +
        "and p.startDate <= :today and (p.endDate is null or p.endDate > :today) group by c.id, c.name order by count(p) desc, c.name asc"
    )
    List<Object[]> topClients(@Param("orgId") Long orgId, @Param("today") LocalDate today, Pageable page);

    /** Consultants each marketer looks after: {@code [marketerMemberId, count]}. */
    @Query("select a.marketerMemberId, count(a) from MarketerAssignment a where a.orgId = :orgId and a.status = 'ACTIVE' group by a.marketerMemberId")
    List<Object[]> assignedConsultants(@Param("orgId") Long orgId);

    /** Opportunities still open, by the marketer who owns them: {@code [ownerMemberId, count]}. */
    @Query("select o.ownerMemberId, count(o) from MktOpportunity o where o.orgId = :orgId and o.ownerMemberId is not null and o.state not in :closed group by o.ownerMemberId")
    List<Object[]> openOpportunities(@Param("orgId") Long orgId, @Param("closed") Collection<String> closed);

    /** For applications created on or after {@code from} that reached SUBMITTED: {@code [createdAt, firstSubmittedAt]}. */
    @Query(
        "select a.createdAt, min(e.occurredAt) from TalentApplication a, TalentApplicationEvent e where a.orgId = :orgId and e.orgId = :orgId and e.applicationId = a.id " +
        "and e.toStage = 'SUBMITTED' and a.createdAt >= :from group by a.id, a.createdAt"
    )
    List<Object[]> firstSubmissions(@Param("orgId") Long orgId, @Param("from") Instant from);
}
