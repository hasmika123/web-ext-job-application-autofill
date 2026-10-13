package com.dossier.api.repository.ent;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import java.time.Instant;
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
}
