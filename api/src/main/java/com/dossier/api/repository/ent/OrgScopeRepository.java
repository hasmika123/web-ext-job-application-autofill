package com.dossier.api.repository.ent;

import com.dossier.api.domain.org.OrgMember;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * The read-only facts {@code ScopeEvaluator} needs about who sits where: a member's status, their team and department links and
 * the kind of their legacy group, who belongs to a set of teams, who leads which group and which teams sit under which
 * department. Every method names the organization first and joins the group on the same organization, so a group id of another
 * organization contributes nothing. X4.5 made the leads and the team to department tree real (the columns
 * {@code org_member.team_group_id / department_group_id}, {@code org_group.parent_group_id / lead_member_id}).
 */
public interface OrgScopeRepository extends Repository<OrgMember, Long> {
    /**
     * One row {@code [id, status, groupId, groupKind, departmentGroupId, teamGroupId, teamParentId]} per member of this organization
     * with this id ({@code groupKind} is null when the member has no legacy group, {@code teamParentId} is the department the member's
     * team sits under, when it has one).
     */
    @Query(
        "select m.id, m.status, m.groupId, g.kind, m.departmentGroupId, m.teamGroupId, t.parentGroupId " +
        "from OrgMember m left join OrgGroup g on g.id = m.groupId and g.orgId = m.orgId " +
        "left join OrgGroup t on t.id = m.teamGroupId and t.orgId = m.orgId " +
        "where m.orgId = :orgId and m.id = :memberId"
    )
    List<Object[]> findMemberFacts(@Param("orgId") Long orgId, @Param("memberId") Long memberId);

    /** The live (INVITED, ACTIVE, SUSPENDED) members whose team link, or legacy group, is one of these groups. */
    @Query(
        "select m.id from OrgMember m where m.orgId = :orgId and (m.teamGroupId in :groupIds or m.groupId in :groupIds) and m.status in " +
        "(com.dossier.api.domain.enumeration.OrgMemberStatus.INVITED, com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE, " +
        "com.dossier.api.domain.enumeration.OrgMemberStatus.SUSPENDED)"
    )
    List<Long> findLiveMemberIdsInGroups(@Param("orgId") Long orgId, @Param("groupIds") Collection<Long> groupIds);

    /** The ids of the groups of this kind that this member leads. */
    @Query(
        "select g.id from OrgGroup g where g.orgId = :orgId and g.leadMemberId = :memberId and g.kind = :kind"
    )
    List<Long> findGroupIdsLedBy(@Param("orgId") Long orgId, @Param("memberId") Long memberId, @Param("kind") com.dossier.api.domain.enumeration.OrgGroupKind kind);

    /** The leads of these groups (a lead counts as a member of the group). */
    @Query("select g.leadMemberId from OrgGroup g where g.orgId = :orgId and g.id in :groupIds and g.leadMemberId is not null")
    List<Long> findLeadsOf(@Param("orgId") Long orgId, @Param("groupIds") Collection<Long> groupIds);

    /** The teams that sit under any of these departments. */
    @Query(
        "select g.id from OrgGroup g where g.orgId = :orgId and g.kind = com.dossier.api.domain.enumeration.OrgGroupKind.TEAM and g.parentGroupId in :departmentIds"
    )
    List<Long> findTeamIdsUnder(@Param("orgId") Long orgId, @Param("departmentIds") Collection<Long> departmentIds);

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

    /** MM-01: every live (INVITED, ACTIVE, SUSPENDED) member of the organization (what an ORG scope reaches). */
    @Query(
        "select m.id from OrgMember m where m.orgId = :orgId and m.status in " +
        "(com.dossier.api.domain.enumeration.OrgMemberStatus.INVITED, com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE, com.dossier.api.domain.enumeration.OrgMemberStatus.SUSPENDED)"
    )
    List<Long> findLiveMemberIds(@Param("orgId") Long orgId);
}
