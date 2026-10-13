package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.OrgMemberRole;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Which roles a member holds. Every method names the organization first; ended rows (ends_at set) are history. */
public interface OrgMemberRoleRepository extends Repository<OrgMemberRole, Long> {
    <S extends OrgMemberRole> S save(S memberRole);

    <S extends OrgMemberRole> S saveAndFlush(S memberRole);

    /** The member's live role rows (primary first). */
    @Query("select m from OrgMemberRole m where m.orgId = :orgId and m.memberId = :memberId and m.endsAt is null order by m.primary desc, m.id asc")
    List<OrgMemberRole> findLiveByOrgIdAndMemberId(@Param("orgId") Long orgId, @Param("memberId") Long memberId);

    /** The live role rows of several members at once (the Invitations list), primary first per member. */
    @Query("select m from OrgMemberRole m where m.orgId = :orgId and m.memberId in :memberIds and m.endsAt is null order by m.memberId asc, m.primary desc, m.id asc")
    List<OrgMemberRole> findLiveByOrgIdAndMemberIds(@Param("orgId") Long orgId, @Param("memberIds") java.util.Collection<Long> memberIds);

    /** How many live members hold {@code roleId} in this organization. */
    @Query("select count(m) from OrgMemberRole m where m.orgId = :orgId and m.roleId = :roleId and m.endsAt is null")
    long countLiveByOrgIdAndRoleId(@Param("orgId") Long orgId, @Param("roleId") Long roleId);

    /** The verification query of 41-database-design.md section 9: live seats with no live primary role row (must be 0 before the roles flag is flipped on). */
    @Query(
        "select count(s) from OrgMember s where s.orgId = :orgId and s.status in (com.dossier.api.domain.enumeration.OrgMemberStatus.INVITED, " +
        "com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE, com.dossier.api.domain.enumeration.OrgMemberStatus.SUSPENDED) " +
        "and s.role <> com.dossier.api.domain.enumeration.OrgRole.COACH " +
        "and not exists (select 1 from OrgMemberRole m where m.orgId = s.orgId and m.memberId = s.id and m.primary = true and m.endsAt is null)"
    )
    long countLiveSeatsWithoutPrimaryRole(@Param("orgId") Long orgId);
}
