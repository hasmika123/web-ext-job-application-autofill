package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.OrgMemberOffboarding;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Scheduled last days (X4.4). Every method names the organization first; the cross-organization "what is due" scan lives in the job, not here. */
public interface OrgMemberOffboardingRepository extends Repository<OrgMemberOffboarding, Long> {
    <S extends OrgMemberOffboarding> S save(S row);

    <S extends OrgMemberOffboarding> S saveAndFlush(S row);

    Optional<OrgMemberOffboarding> findByOrgIdAndId(Long orgId, Long id);

    @Query("select o from OrgMemberOffboarding o where o.orgId = :orgId and o.memberId = :memberId and o.status = 'PENDING'")
    Optional<OrgMemberOffboarding> findPendingByOrgIdAndMemberId(@Param("orgId") Long orgId, @Param("memberId") Long memberId);

    /** The organization's scheduled last days, soonest first. */
    @Query("select o from OrgMemberOffboarding o where o.orgId = :orgId and o.status = 'PENDING' order by o.effectiveAt asc, o.id asc")
    List<OrgMemberOffboarding> findPendingByOrgId(@Param("orgId") Long orgId);
}
