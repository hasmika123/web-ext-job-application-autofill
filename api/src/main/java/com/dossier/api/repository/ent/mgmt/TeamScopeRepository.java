package com.dossier.api.repository.ent.mgmt;

import com.dossier.api.domain.org.OrgMember;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * The read-only facts {@code TeamScope} needs beyond what {@code ScopeDirectory} already answers: who holds a marketing role, who reports to a
 * manager and which consultants a set of marketers carries. Every method names the organization first.
 */
public interface TeamScopeRepository extends Repository<OrgMember, Long> {

    /** ACTIVE seats of the organization that hold one of the roles (by role key). */
    @Query(
        "select distinct m.id from OrgMember m, OrgMemberRole r, OrgRoleDefinition d where m.orgId = :orgId and m.status = com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE "
            + "and r.orgId = :orgId and r.memberId = m.id and r.endsAt is null and d.id = r.roleId and d.roleKey in :roleKeys"
    )
    List<Long> findActiveMemberIdsWithRoleKeys(@Param("orgId") Long orgId, @Param("roleKeys") Collection<String> roleKeys);

    /** ACTIVE seats whose line manager ({@code org_member.manager_member_id}) is {@code managerMemberId}. */
    @Query(
        "select m.id from OrgMember m where m.orgId = :orgId and m.managerMemberId = :managerMemberId and m.status = com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE"
    )
    List<Long> findActiveDirectReportIds(@Param("orgId") Long orgId, @Param("managerMemberId") Long managerMemberId);

    /** The consultant profiles carried by any of these marketers, as marketer or as backup (any assignment status: a paused one is still the team's). */
    @Query(
        "select distinct a.consultantId from MarketerAssignment a where a.orgId = :orgId and (a.marketerMemberId in :memberIds or a.backupMemberId in :memberIds)"
    )
    List<Long> findConsultantIdsCarriedBy(@Param("orgId") Long orgId, @Param("memberIds") Collection<Long> memberIds);
}
