package com.dossier.api.repository.ent;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * The read queries behind the Employees board (X4.3 / X4.6): batch loads for the table rows and the figures of the KPI tiles. Every method
 * names the organization first and every join stays inside it, so an id of another organization contributes nothing. The dynamic list query
 * (search, filters, sort) is assembled in {@code OrgMemberQueryService} with the same rule: {@code m.orgId = :orgId} always comes first.
 */
public interface OrgMemberDirectoryRepository extends Repository<OrgMember, Long> {

    @Query("select m from OrgMember m where m.orgId = :orgId and m.id in :memberIds")
    List<OrgMember> findByOrgIdAndIdIn(@Param("orgId") Long orgId, @Param("memberIds") Collection<Long> memberIds);

    @Query("select m from OrgMember m where m.orgId = :orgId and m.userId in :userIds")
    List<OrgMember> findByOrgIdAndUserIdIn(@Param("orgId") Long orgId, @Param("userIds") Collection<Long> userIds);

    /** Live role rows of these members: {@code [memberId, roleId, roleKey, roleName, primary]}, the primary first. */
    @Query(
        "select m.memberId, r.id, r.roleKey, r.name, m.primary from OrgMemberRole m, OrgRoleDefinition r " +
        "where m.orgId = :orgId and m.memberId in :memberIds and m.endsAt is null and r.id = m.roleId and (r.orgId is null or r.orgId = :orgId) " +
        "order by m.primary desc, m.id asc"
    )
    List<Object[]> findLiveRolesForMembers(@Param("orgId") Long orgId, @Param("memberIds") Collection<Long> memberIds);

    @Query("select g from OrgGroup g where g.orgId = :orgId and g.id in :groupIds")
    List<OrgGroup> findGroupsByOrgIdAndIdIn(@Param("orgId") Long orgId, @Param("groupIds") Collection<Long> groupIds);

    /** The people who report to a member, in the given states. */
    @Query("select m from OrgMember m where m.orgId = :orgId and m.managerMemberId = :managerId and m.status in :statuses order by m.id")
    List<OrgMember> findDirectReports(@Param("orgId") Long orgId, @Param("managerId") Long managerId, @Param("statuses") Collection<OrgMemberStatus> statuses);

    /** Every seat's life facts for the tiles: {@code [id, status, createdAt, joinedAt, leftAt, departmentGroupId, teamGroupId, groupId]}. */
    @Query("select m.id, m.status, m.createdAt, m.joinedAt, m.leftAt, m.departmentGroupId, m.teamGroupId, m.groupId from OrgMember m where m.orgId = :orgId")
    List<Object[]> findLifeFacts(@Param("orgId") Long orgId);

    /** Seat-state audit rows for the tiles' history: {@code [targetId, action, createdAt]}, oldest first. */
    @Query(
        "select a.targetId, a.action, a.createdAt from OrgAuditEvent a where a.orgId = :orgId and a.targetType = 'MEMBER' and a.action in :actions " +
        "order by a.createdAt asc, a.id asc"
    )
    List<Object[]> findMemberAuditTimeline(@Param("orgId") Long orgId, @Param("actions") Collection<String> actions);

    /** The latest time {@code action} was recorded against one member (null when never). */
    @Query("select max(a.createdAt) from OrgAuditEvent a where a.orgId = :orgId and a.targetType = 'MEMBER' and a.targetId = :targetId and a.action = :action")
    Instant findLatestAuditAt(@Param("orgId") Long orgId, @Param("targetId") String targetId, @Param("action") String action);

    /** {@code [kind, count]} of the organization's groups. */
    @Query("select g.kind, count(g) from OrgGroup g where g.orgId = :orgId group by g.kind")
    List<Object[]> countGroupsByKind(@Param("orgId") Long orgId);

    /** {@code [kind, count]} of the groups that already existed at {@code asOf}. */
    @Query("select g.kind, count(g) from OrgGroup g where g.orgId = :orgId and g.createdAt <= :asOf group by g.kind")
    List<Object[]> countGroupsByKindCreatedBefore(@Param("orgId") Long orgId, @Param("asOf") Instant asOf);

    /** How many group deletions the audit trail recorded after {@code since} (a deleted group leaves no row, so the earlier count is unknowable). */
    @Query("select count(a) from OrgAuditEvent a where a.orgId = :orgId and a.action = 'GROUP_DELETE' and a.createdAt > :since")
    long countGroupDeletionsSince(@Param("orgId") Long orgId, @Param("since") Instant since);
}
