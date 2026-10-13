package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.OrgMemberRole;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Modifying;
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

    /** X1.14: how many live seats (statuses given) hold {@code roleId}. */
    @Query(
        "select count(distinct m.memberId) from OrgMemberRole m, OrgMember s where m.orgId = :orgId and m.roleId = :roleId and m.endsAt is null " +
        "and s.orgId = :orgId and s.id = m.memberId and s.status in :statuses"
    )
    long countSeatsHoldingRole(@Param("orgId") Long orgId, @Param("roleId") Long roleId, @Param("statuses") Collection<com.dossier.api.domain.enumeration.OrgMemberStatus> statuses);

    /** X1.14: how many distinct seats (statuses given) hold at least one live role (the board's "Active Users"). */
    @Query(
        "select count(distinct m.memberId) from OrgMemberRole m, OrgMember s where m.orgId = :orgId and m.endsAt is null " +
        "and s.orgId = :orgId and s.id = m.memberId and s.status in :statuses"
    )
    long countSeatsWithAnyRole(@Param("orgId") Long orgId, @Param("statuses") Collection<com.dossier.api.domain.enumeration.OrgMemberStatus> statuses);

    /** X1.14: (roleId, seats) for every role held by a live seat of the organization. */
    @Query(
        "select m.roleId, count(distinct m.memberId) from OrgMemberRole m, OrgMember s where m.orgId = :orgId and m.endsAt is null " +
        "and s.orgId = :orgId and s.id = m.memberId and s.status in :statuses group by m.roleId"
    )
    List<Object[]> countSeatsByRole(@Param("orgId") Long orgId, @Param("statuses") Collection<com.dossier.api.domain.enumeration.OrgMemberStatus> statuses);

    /**
     * X1.14 last-admin guard: ACTIVE seats of the organization, other than {@code exceptMemberId}, that hold a role whose key or
     * template is one of {@code templateKeys} (live role rows), or whose legacy enum value is in {@code enumRoles} (a seat that has no
     * role rows yet still reads the enum).
     */
    @Query(
        "select count(s) from OrgMember s where s.orgId = :orgId and s.id <> :exceptMemberId and s.status = com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE " +
        "and (s.role in :enumRoles or exists (select 1 from OrgMemberRole m, OrgRoleDefinition r where m.orgId = :orgId and m.memberId = s.id and m.endsAt is null " +
        "and r.id = m.roleId and (r.templateKey in :templateKeys or (r.system = true and r.roleKey in :templateKeys))))"
    )
    long countOtherActiveSeatsHolding(
        @Param("orgId") Long orgId,
        @Param("exceptMemberId") Long exceptMemberId,
        @Param("templateKeys") Collection<String> templateKeys,
        @Param("enumRoles") Collection<com.dossier.api.domain.enumeration.OrgRole> enumRoles
    );

    /** X1.14: every row (live and ended) of one of the organization's OWN roles, before the role is deleted. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from OrgMemberRole m where m.orgId = :orgId and m.roleId = :roleId")
    int deleteAllForRole(@Param("orgId") Long orgId, @Param("roleId") Long roleId);

    /** X1.14: clear the denormalised primary-role pointer of seats that still name a role about to be deleted. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update OrgMember s set s.primaryRoleId = null where s.orgId = :orgId and s.primaryRoleId = :roleId")
    int clearPrimaryRolePointer(@Param("orgId") Long orgId, @Param("roleId") Long roleId);
}
