package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.OrgMemberDismissal;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Per-member dismissed dashboard alerts (X2.4). Every method names the organization and the member. */
public interface OrgMemberDismissalRepository extends Repository<OrgMemberDismissal, OrgMemberDismissal.Pk> {
    <S extends OrgMemberDismissal> S save(S row);

    @Query("select d from OrgMemberDismissal d where d.orgId = :orgId and d.memberId = :memberId and d.alertKey = :alertKey")
    Optional<OrgMemberDismissal> find(@Param("orgId") Long orgId, @Param("memberId") Long memberId, @Param("alertKey") String alertKey);
}
