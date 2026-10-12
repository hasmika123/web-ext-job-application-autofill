package com.dossier.api.repository.org;

import com.dossier.api.domain.Application;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Read-only aggregates behind the org dashboard (O2.7): counts of the progress of the members who SHARE with an
 * organization. Every query names the organization first and joins through that org's own {@code org_member} and
 * {@code data_share} rows, so another org's members never count; a member who shares nothing ({@code NONE}, or no
 * {@code data_share} row) is not in any number. No query returns an employer, a title or a document: only counts.
 * {@code ownerId} narrows to the members one support owner looks after; {@link #ALL_OWNERS} means no narrowing.
 */
public interface OrgOverviewRepository extends Repository<Application, Long> {
    /** "Not narrowed to one support owner". */
    long ALL_OWNERS = -1L;

    /**
     * Rows of {@code [status, applications, appliedSince, accepted]} over the sharing members' un-archived applications:
     * how many there are in each status, how many of those were applied on or after {@code since}, and how many carry an
     * accepted outcome.
     */
    @Query(
        nativeQuery = true,
        value = "select a.status, count(*), coalesce(sum(case when a.applied_at >= :since then 1 else 0 end), 0), " +
        "coalesce(sum(case when a.outcome = 'ACCEPTED' then 1 else 0 end), 0) " +
        "from application a join org_member m on m.user_id = a.user_id join data_share s on s.member_id = m.id and s.org_id = m.org_id " +
        "where m.org_id = :orgId and m.status = 'ACTIVE' and m.role = 'MEMBER' and s.scope in ('SUMMARY', 'FULL') " +
        "and (a.archived is null or a.archived = false) and (:ownerId = -1 or m.support_owner_member_id = :ownerId) " +
        "group by a.status"
    )
    List<Object[]> stageCounts(@Param("orgId") Long orgId, @Param("ownerId") long ownerId, @Param("since") Instant since);

    /** ACTIVE members (role MEMBER) who share a SUMMARY or more. */
    @Query(
        nativeQuery = true,
        value = "select count(distinct m.id) from org_member m join data_share s on s.member_id = m.id and s.org_id = m.org_id " +
        "where m.org_id = :orgId and m.status = 'ACTIVE' and m.role = 'MEMBER' and s.scope in ('SUMMARY', 'FULL') " +
        "and (:ownerId = -1 or m.support_owner_member_id = :ownerId)"
    )
    long sharingMembers(@Param("orgId") Long orgId, @Param("ownerId") long ownerId);

    /** Sharing members with at least one accepted application. */
    @Query(
        nativeQuery = true,
        value = "select count(distinct m.id) from application a join org_member m on m.user_id = a.user_id " +
        "join data_share s on s.member_id = m.id and s.org_id = m.org_id " +
        "where m.org_id = :orgId and m.status = 'ACTIVE' and m.role = 'MEMBER' and s.scope in ('SUMMARY', 'FULL') " +
        "and a.outcome = 'ACCEPTED' and (:ownerId = -1 or m.support_owner_member_id = :ownerId)"
    )
    long placedMembers(@Param("orgId") Long orgId, @Param("ownerId") long ownerId);

    /** Interviews after {@code now} of the sharing members. */
    @Query(
        nativeQuery = true,
        value = "select count(*) from interview i join org_member m on m.user_id = i.user_id " +
        "join data_share s on s.member_id = m.id and s.org_id = m.org_id " +
        "where m.org_id = :orgId and m.status = 'ACTIVE' and m.role = 'MEMBER' and s.scope in ('SUMMARY', 'FULL') " +
        "and i.starts_at > :now and (:ownerId = -1 or m.support_owner_member_id = :ownerId)"
    )
    long upcomingInterviews(@Param("orgId") Long orgId, @Param("ownerId") long ownerId, @Param("now") Instant now);
}
