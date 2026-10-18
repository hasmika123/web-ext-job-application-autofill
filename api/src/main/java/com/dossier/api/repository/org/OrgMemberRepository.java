package com.dossier.api.repository.org;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Seats of an organization. Every finder takes {@code orgId} first, except {@link #findMine}. */
public interface OrgMemberRepository extends Repository<OrgMember, Long> {
    <S extends OrgMember> S save(S member);

    <S extends OrgMember> S saveAndFlush(S member);

    Optional<OrgMember> findByOrgIdAndId(Long orgId, Long id);

    List<OrgMember> findByOrgIdAndUserIdAndStatusIn(Long orgId, Long userId, Collection<OrgMemberStatus> statuses);

    List<OrgMember> findByOrgIdAndInviteEmailAndStatusIn(Long orgId, String inviteEmail, Collection<OrgMemberStatus> statuses);

    long countByOrgIdAndStatus(Long orgId, OrgMemberStatus status);

    /** The people holding one of {@code roles} in the organization with the given seat status (who is told when a policy is decided). */
    List<OrgMember> findByOrgIdAndRoleInAndStatus(Long orgId, Collection<OrgRole> roles, OrgMemberStatus status);

    long countByOrgIdAndRoleAndStatus(Long orgId, OrgRole role, OrgMemberStatus status);

    long countByOrgIdAndGroupIdAndStatusIn(Long orgId, Long groupId, Collection<OrgMemberStatus> statuses);

    long countByOrgIdAndStatusIn(Long orgId, Collection<OrgMemberStatus> statuses);

    long countByOrgIdAndRoleAndStatusIn(Long orgId, OrgRole role, Collection<OrgMemberStatus> statuses);

    /** Invite emails sent since {@code since} (first sends and re-sends): the per-org daily cap. */
    long countByOrgIdAndInviteSentAtAfter(Long orgId, java.time.Instant since);

    /** Seats invited in one paste / import batch, any state. */
    long countByOrgIdAndInviteBatchId(Long orgId, Long inviteBatchId);

    /**
     * The seat an invite link points at. The ONE finder that cannot name the organization: the token is a 190-bit secret,
     * only its SHA-256 is stored, and it exists to FIND the org (allow-listed in OrgRepositoryContractTest like the slug
     * lookups). The caller must then treat the row's own {@code orgId} as the tenant.
     */
    Optional<OrgMember> findByInviteTokenHash(String inviteTokenHash);

    /** Several seats of one organization by id (names on the Invitations list). */
    @Query("select m from OrgMember m where m.orgId = :orgId and m.id in :ids")
    List<OrgMember> findByOrgIdAndIdIn(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    /**
     * Invitations of one organization whose link has run out and that nobody has ended yet (X1.15): the expiry job's work list for
     * that tenant, oldest first, at most one page.
     */
    @Query(
        "select m from OrgMember m where m.orgId = :orgId and m.status = com.dossier.api.domain.enumeration.OrgMemberStatus.INVITED " +
        "and m.inviteExpiresAt is not null and m.inviteExpiresAt < :now order by m.inviteExpiresAt asc"
    )
    List<OrgMember> findExpiredInvites(@Param("orgId") Long orgId, @Param("now") java.time.Instant now, org.springframework.data.domain.Pageable page);

    /**
     * The organizations that have at least one expired, un-ended invitation: the ONE query that spans tenants, for the platform
     * job that then runs each organization's work inside {@code TenantScoped} (allow-listed in OrgRepositoryContractTest).
     */
    @Query(
        "select distinct m.orgId from OrgMember m where m.status = com.dossier.api.domain.enumeration.OrgMemberStatus.INVITED " +
        "and m.inviteExpiresAt is not null and m.inviteExpiresAt < :now order by m.orgId"
    )
    List<Long> findOrgIdsWithExpiredInvites(@Param("now") java.time.Instant now);

    /** Every row (any status) that names this user, across organizations: the "my orgs" list and erasure. */
    @Query("select m from OrgMember m where m.userId = :userId order by m.id")
    List<OrgMember> findMine(@Param("userId") Long userId);
}
