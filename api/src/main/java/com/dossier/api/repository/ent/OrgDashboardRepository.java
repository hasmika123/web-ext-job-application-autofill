package com.dossier.api.repository.ent;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Read-only aggregates behind the Org Admin dashboard (X2.4). Every query names the organization first and returns plain
 * rows; nothing here writes. Kept apart from the entity repositories so the dashboard can be reasoned about, and tested, as
 * one reader.
 */
public interface OrgDashboardRepository extends Repository<OrgMember, Long> {
    /** One row per seat: {@code [id, status, joinedAt, leftAt, createdAt, inviteExpiresAt]}. */
    @Query("select s.id, s.status, s.joinedAt, s.leftAt, s.createdAt, s.inviteExpiresAt from OrgMember s where s.orgId = :orgId")
    List<Object[]> seatFacts(@Param("orgId") Long orgId);

    /** Ids of the seats (any status) that hold a live consultant role: the system template, or a custom role built from it. */
    @Query(
        "select distinct s.id from OrgMember s where s.orgId = :orgId and exists (select 1 from OrgMemberRole m, OrgRoleDefinition r " +
        "where m.orgId = :orgId and m.memberId = s.id and m.endsAt is null and r.id = m.roleId and (r.templateKey = :template or (r.system = true and r.roleKey = :template)))"
    )
    List<Long> seatIdsHoldingTemplate(@Param("orgId") Long orgId, @Param("template") String template);

    /** ACTIVE hostnames of the organization whose certificate failed. */
    @Query(
        "select count(h) from OrgHostname h where h.orgId = :orgId and h.status = com.dossier.api.domain.enumeration.OrgHostnameStatus.ACTIVE " +
        "and h.certState = com.dossier.api.domain.enumeration.HostnameCertState.FAILED"
    )
    long countActiveHostnamesWithFailedCertificate(@Param("orgId") Long orgId);

    /** The organization's newest audit rows (the whole trail). */
    @Query("select e from OrgAuditEvent e where e.orgId = :orgId order by e.createdAt desc, e.id desc")
    List<OrgAuditEvent> latestAudit(@Param("orgId") Long orgId, Pageable page);

    /** The newest audit rows whose action starts with one of four prefixes (a row-filtered audit.view: BILLING_OPS, HR). */
    @Query(
        "select e from OrgAuditEvent e where e.orgId = :orgId and (e.action like :p1 or e.action like :p2 or e.action like :p3 or e.action like :p4) order by e.createdAt desc, e.id desc"
    )
    List<OrgAuditEvent> latestAuditWithPrefixes(
        @Param("orgId") Long orgId,
        @Param("p1") String p1,
        @Param("p2") String p2,
        @Param("p3") String p3,
        @Param("p4") String p4,
        Pageable page
    );

    /** Seats of the organization in these statuses (ids only). */
    @Query("select s.id from OrgMember s where s.orgId = :orgId and s.status in :statuses")
    List<Long> seatIdsWithStatus(@Param("orgId") Long orgId, @Param("statuses") Collection<OrgMemberStatus> statuses);

    /** Live system/custom admin seats: ACTIVE seats holding OWNER or ORG_ADMIN by role row or by the legacy enum. */
    @Query(
        "select count(s) from OrgMember s where s.orgId = :orgId and s.status = com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE " +
        "and (s.role in (com.dossier.api.domain.enumeration.OrgRole.OWNER, com.dossier.api.domain.enumeration.OrgRole.ADMIN) or exists " +
        "(select 1 from OrgMemberRole m, OrgRoleDefinition r where m.orgId = :orgId and m.memberId = s.id and m.endsAt is null and r.id = m.roleId " +
        "and (r.templateKey in ('OWNER', 'ORG_ADMIN') or (r.system = true and r.roleKey in ('OWNER', 'ORG_ADMIN')))))"
    )
    long countActiveAdmins(@Param("orgId") Long orgId);

    /** Active dismissals of one member (the ones whose {@code untilAt} is after {@code now}). */
    @Query("select d.alertKey from OrgMemberDismissal d where d.orgId = :orgId and d.memberId = :memberId and d.untilAt > :now")
    List<String> activeDismissalKeys(@Param("orgId") Long orgId, @Param("memberId") Long memberId, @Param("now") Instant now);

    /* ── talent aggregates (talent-foundation.md section 5; every query is for one organization) ─────────────── */

    /** Active consultant profiles. */
    @Query("select count(c) from ConsultantProfile c where c.orgId = :orgId and c.status = 'ACTIVE'")
    long countActiveConsultantProfiles(@Param("orgId") Long orgId);

    /** Active consultant profiles that existed at {@code t} (created on or before it). */
    @Query("select count(c) from ConsultantProfile c where c.orgId = :orgId and c.status = 'ACTIVE' and c.createdAt <= :t")
    long countActiveConsultantProfilesCreatedBy(@Param("orgId") Long orgId, @Param("t") Instant t);

    /** Active consultant profiles by availability: {@code [availabilityStatus, count]}. */
    @Query("select c.availabilityStatus, count(c) from ConsultantProfile c where c.orgId = :orgId and c.status = 'ACTIVE' group by c.availabilityStatus")
    List<Object[]> consultantAvailability(@Param("orgId") Long orgId);

    /** Applications that are not closed. */
    @Query("select count(a) from TalentApplication a where a.orgId = :orgId and a.stage <> 'CLOSED'")
    long countOpenApplications(@Param("orgId") Long orgId);

    /** Applications that existed at {@code t} and had not been closed by then (the CLOSED event is the closing time). */
    @Query(
        "select count(a) from TalentApplication a where a.orgId = :orgId and a.createdAt <= :t and not exists " +
        "(select 1 from TalentApplicationEvent e where e.orgId = :orgId and e.applicationId = a.id and e.toStage = 'CLOSED' and e.occurredAt <= :t)"
    )
    long countOpenApplicationsAt(@Param("orgId") Long orgId, @Param("t") Instant t);

    /** {@code [stage, closedReason, count]} for every application. */
    @Query("select a.stage, a.closedReason, count(a) from TalentApplication a where a.orgId = :orgId group by a.stage, a.closedReason")
    List<Object[]> applicationStageCounts(@Param("orgId") Long orgId);

    @Query("select count(a) from TalentApplication a where a.orgId = :orgId and a.appliedOn >= :from and a.appliedOn <= :to")
    long countApplicationsApplied(@Param("orgId") Long orgId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("select count(a) from TalentApplication a where a.orgId = :orgId and a.createdAt >= :since")
    long countApplicationsCreatedSince(@Param("orgId") Long orgId, @Param("since") Instant since);

    /** When the newest application was created, among those created since {@code since}; null when none. */
    @Query("select max(a.createdAt) from TalentApplication a where a.orgId = :orgId and a.createdAt >= :since")
    Instant newestApplicationCreatedSince(@Param("orgId") Long orgId, @Param("since") Instant since);

    /** When the newest placement row was created, among those starting since {@code from}; null when none. */
    @Query("select max(p.createdAt) from TalentPlacement p where p.orgId = :orgId and p.startDate >= :from")
    Instant newestPlacementStartedSince(@Param("orgId") Long orgId, @Param("from") LocalDate from);

    @Query("select count(a) from TalentApplication a where a.orgId = :orgId and a.stage <> 'CLOSED' and a.nextActionDue is not null and a.nextActionDue < :today")
    long countOverdueApplications(@Param("orgId") Long orgId, @Param("today") LocalDate today);

    /** Interviews in {@code [from, to)} whose status is one of {@code statuses}. */
    @Query("select count(i) from TalentInterview i where i.orgId = :orgId and i.scheduledAt >= :from and i.scheduledAt < :to and i.status in :statuses")
    long countInterviews(@Param("orgId") Long orgId, @Param("from") Instant from, @Param("to") Instant to, @Param("statuses") Collection<String> statuses);

    /** Distinct clients with a scheduled interview in {@code [from, to)}. */
    @Query("select count(distinct i.clientId) from TalentInterview i where i.orgId = :orgId and i.scheduledAt >= :from and i.scheduledAt < :to and i.status = 'SCHEDULED'")
    long countInterviewClients(@Param("orgId") Long orgId, @Param("from") Instant from, @Param("to") Instant to);

    @Query("select count(p) from TalentPlacement p where p.orgId = :orgId and p.status = 'ACTIVE'")
    long countActivePlacements(@Param("orgId") Long orgId);

    /** Placements running on {@code day}. */
    @Query("select count(p) from TalentPlacement p where p.orgId = :orgId and p.startDate <= :day and (p.endDate is null or p.endDate > :day)")
    long countPlacementsActiveOn(@Param("orgId") Long orgId, @Param("day") LocalDate day);

    @Query("select count(p) from TalentPlacement p where p.orgId = :orgId and p.startDate >= :from and p.startDate <= :to")
    long countPlacementsStarted(@Param("orgId") Long orgId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** Spend recorded for months in {@code [from, to]}: {@code [monthStart, sum(amountMinor), currency]}, oldest first. */
    @Query("select s.monthStart, sum(s.amountMinor), min(s.currency) from OrgSpendEntry s where s.orgId = :orgId and s.monthStart >= :from and s.monthStart <= :to group by s.monthStart order by s.monthStart")
    List<Object[]> spendByMonth(@Param("orgId") Long orgId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("select count(c) from ConsultantProfile c where c.orgId = :orgId and c.status = 'ACTIVE' and c.licenseStatus in ('EXPIRING', 'NEEDS_REVIEW')")
    long countLicensesNeedingAttention(@Param("orgId") Long orgId);

    @Query("select count(r) from OrgResume r where r.orgId = :orgId and r.approvalStatus = 'PENDING'")
    long countResumesPendingApproval(@Param("orgId") Long orgId);

    @Query("select count(c) from ConsultantProfile c where c.orgId = :orgId and c.status = 'ACTIVE' and not exists (select 1 from MarketerAssignment a where a.orgId = :orgId and a.consultantId = c.id)")
    long countUnassignedConsultants(@Param("orgId") Long orgId);

    /** Active marketers whose assigned consultants reach {@code pct} percent of their capacity. */
    @Query(
        "select count(m) from MarketerCapacity m where m.orgId = :orgId and m.status = 'ACTIVE' and m.capacity > 0 and " +
        "(select count(a) from MarketerAssignment a where a.orgId = :orgId and a.marketerMemberId = m.memberId) * 100 >= :pct * m.capacity"
    )
    long countOverloadedMarketers(@Param("orgId") Long orgId, @Param("pct") int pct);

    /** Newest application events with their application: {@code [eventId, eventType, toStage, occurredAt, actorMemberId, applicationCode, consultantId, requirementId, closedReason]}. */
    @Query(
        "select e.id, e.eventType, e.toStage, e.occurredAt, e.actorMemberId, a.code, a.consultantId, a.requirementId, a.closedReason " +
        "from TalentApplicationEvent e, TalentApplication a where e.orgId = :orgId and a.orgId = :orgId and a.id = e.applicationId " +
        "and e.eventType in ('CREATED', 'STAGE_CHANGE', 'NOTE') order by e.occurredAt desc, e.id desc"
    )
    List<Object[]> latestApplicationEvents(@Param("orgId") Long orgId, Pageable page);

    @Query("select c.id, c.displayName from ConsultantProfile c where c.orgId = :orgId and c.id in :ids")
    List<Object[]> consultantNames(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    @Query("select r.id, r.title from ClientRequirement r where r.orgId = :orgId and r.id in :ids")
    List<Object[]> requirementTitles(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    /** Display names of seats: {@code [memberId, firstName, lastName, login]}. */
    @Query("select m.id, u.firstName, u.lastName, u.login from OrgMember m, User u where m.orgId = :orgId and m.id in :ids and u.id = m.userId")
    List<Object[]> memberNames(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    /* ── activation checklist (14 section 2.4): small existence counts, one organization each ─────────────── */

    /** 1 when the organization has published its branding at least once, else 0. */
    @Query("select count(b) from OrgBranding b where b.orgId = :orgId and b.publishedAt is not null")
    long countPublishedBranding(@Param("orgId") Long orgId);

    /** Active departments. */
    @Query("select count(g) from OrgGroup g where g.orgId = :orgId and g.kind = com.dossier.api.domain.enumeration.OrgGroupKind.DEPARTMENT and g.status = 'ACTIVE'")
    long countActiveDepartments(@Param("orgId") Long orgId);

    /** Ids of the seats in these statuses holding a live role other than the listed templates (a role built from nothing counts as other). */
    @Query(
        "select distinct s.id from OrgMember s where s.orgId = :orgId and s.status in :statuses and exists (select 1 from OrgMemberRole m, OrgRoleDefinition r " +
        "where m.orgId = :orgId and m.memberId = s.id and m.endsAt is null and r.id = m.roleId and coalesce(r.templateKey, r.roleKey) not in :excluded)"
    )
    List<Long> seatIdsHoldingOtherThan(@Param("orgId") Long orgId, @Param("statuses") Collection<OrgMemberStatus> statuses, @Param("excluded") Collection<String> excluded);

    /** Consultants with an active marketer assignment. */
    @Query("select count(a) from MarketerAssignment a where a.orgId = :orgId and a.status = 'ACTIVE'")
    long countActiveMarketerAssignments(@Param("orgId") Long orgId);
}
