package com.dossier.api.repository.ent;

import com.dossier.api.domain.org.OrgMember;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * The read-only facts {@code ScopeEvaluator} needs about who sits where: a member's status and the kind of group they belong to,
 * and who belongs to a set of groups. Every method names the organization first and joins the group on the same organization, so
 * a group id of another organization contributes nothing. Reads {@code org_member.group_id} and {@code org_group.kind}, which are
 * all that exist before X4 adds the separate team and department links, leads and the group tree.
 */
public interface OrgScopeRepository extends Repository<OrgMember, Long> {
    /**
     * One row {@code [id, status, groupId, groupKind, teamGroupId, departmentGroupId]} per member of this organization with this id (groupId and
     * groupKind are null when the member has no legacy group; the last two are the X4.3 links, null until the member is placed).
     */
    @Query(
        "select m.id, m.status, m.groupId, g.kind, m.teamGroupId, m.departmentGroupId from OrgMember m left join OrgGroup g on g.id = m.groupId and g.orgId = m.orgId " +
        "where m.orgId = :orgId and m.id = :memberId"
    )
    List<Object[]> findMemberFacts(@Param("orgId") Long orgId, @Param("memberId") Long memberId);

    /** The live (INVITED, ACTIVE, SUSPENDED) members of these groups. */
    @Query(
        "select m.id from OrgMember m where m.orgId = :orgId and (m.groupId in :groupIds or m.teamGroupId in :groupIds) and m.status in " +
        "(com.dossier.api.domain.enumeration.OrgMemberStatus.INVITED, com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE, " +
        "com.dossier.api.domain.enumeration.OrgMemberStatus.SUSPENDED)"
    )
    List<Long> findLiveMemberIdsInGroups(@Param("orgId") Long orgId, @Param("groupIds") Collection<Long> groupIds);

    /** X4.3: the teams (kind TEAM) of this organization that belong to any of these departments. */
    @Query("select g.id from OrgGroup g where g.orgId = :orgId and g.kind = com.dossier.api.domain.enumeration.OrgGroupKind.TEAM and g.parentGroupId in :departmentGroupIds")
    List<Long> findTeamIdsUnder(@Param("orgId") Long orgId, @Param("departmentGroupIds") Collection<Long> departmentGroupIds);

    /** X4.3: live members linked to any of these groups by any of the three links (the candidates a TEAM or DEPARTMENT scope can reach). */
    @Query(
        "select m.id from OrgMember m where m.orgId = :orgId and (m.groupId in :groupIds or m.teamGroupId in :groupIds or m.departmentGroupId in :groupIds) and m.status in " +
        "(com.dossier.api.domain.enumeration.OrgMemberStatus.INVITED, com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE, com.dossier.api.domain.enumeration.OrgMemberStatus.SUSPENDED)"
    )
    List<Long> findLiveMemberIdsLinkedToGroups(@Param("orgId") Long orgId, @Param("groupIds") Collection<Long> groupIds);

    /** X4.3: consultants that have at least one effective assignment (the candidates ASSIGNED scope, and the assignment half of TEAM scope, can reach). */
    @Query(
        "select distinct a.consultantMemberId from OrgAssignment a where a.orgId = :orgId and a.startsAt <= :now and (a.endsAt is null or a.endsAt > :now) " +
        "and a.health = com.dossier.api.domain.enumeration.AssignmentHealth.OK"
    )
    List<Long> findConsultantIdsWithEffectiveAssignments(@Param("orgId") Long orgId, @Param("now") java.time.Instant now);
}
