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

    long countByOrgIdAndRoleAndStatus(Long orgId, OrgRole role, OrgMemberStatus status);

    long countByOrgIdAndGroupIdAndStatusIn(Long orgId, Long groupId, Collection<OrgMemberStatus> statuses);

    long countByOrgIdAndStatusIn(Long orgId, Collection<OrgMemberStatus> statuses);

    /** Every row (any status) that names this user, across organizations: the "my orgs" list and erasure. */
    @Query("select m from OrgMember m where m.userId = :userId order by m.id")
    List<OrgMember> findMine(@Param("userId") Long userId);
}
