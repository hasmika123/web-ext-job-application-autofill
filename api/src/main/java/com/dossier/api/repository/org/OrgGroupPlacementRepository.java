package com.dossier.api.repository.org;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Read-only placement facts for the Departments and Teams pages (X4.5): which seat sits in which group. Every query names the organization. */
public interface OrgGroupPlacementRepository extends Repository<OrgMember, Long> {
    /** One row {@code [memberId, status, groupId, departmentGroupId, teamGroupId, userId, primaryRoleId, inviteName]} per seat in these states. */
    @Query(
        "select m.id, m.status, m.groupId, m.departmentGroupId, m.teamGroupId, m.userId, m.primaryRoleId, m.inviteName " +
        "from OrgMember m where m.orgId = :orgId and m.status in :statuses order by m.id"
    )
    List<Object[]> placements(@Param("orgId") Long orgId, @Param("statuses") Collection<OrgMemberStatus> statuses);
}
