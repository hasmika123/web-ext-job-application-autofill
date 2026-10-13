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
    /** One row {@code [id, status, groupId, groupKind]} per member of this organization with this id (groupId and groupKind are null when the member has no group). */
    @Query(
        "select m.id, m.status, m.groupId, g.kind from OrgMember m left join OrgGroup g on g.id = m.groupId and g.orgId = m.orgId " +
        "where m.orgId = :orgId and m.id = :memberId"
    )
    List<Object[]> findMemberFacts(@Param("orgId") Long orgId, @Param("memberId") Long memberId);

    /** The live (INVITED, ACTIVE, SUSPENDED) members of these groups. */
    @Query(
        "select m.id from OrgMember m where m.orgId = :orgId and m.groupId in :groupIds and m.status in " +
        "(com.dossier.api.domain.enumeration.OrgMemberStatus.INVITED, com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE, " +
        "com.dossier.api.domain.enumeration.OrgMemberStatus.SUSPENDED)"
    )
    List<Long> findLiveMemberIdsInGroups(@Param("orgId") Long orgId, @Param("groupIds") Collection<Long> groupIds);
}
