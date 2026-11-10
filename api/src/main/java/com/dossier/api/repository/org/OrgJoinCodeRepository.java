package com.dossier.api.repository.org;

import com.dossier.api.domain.org.OrgJoinCode;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface OrgJoinCodeRepository extends Repository<OrgJoinCode, Long> {
    <S extends OrgJoinCode> S save(S code);

    Optional<OrgJoinCode> findByOrgIdAndId(Long orgId, Long id);

    List<OrgJoinCode> findByOrgIdOrderByCreatedAtDesc(Long orgId);

    /**
     * The code a join link carries. Like the invite-token lookup it cannot name the organization: the code is globally
     * unique and exists to FIND the org (allow-listed in OrgRepositoryContractTest). The row's own {@code orgId} is the tenant.
     */
    Optional<OrgJoinCode> findByCode(String code);

    /**
     * Counts one redemption, atomically: succeeds (1) only while the code is not revoked, not expired and has uses left, so
     * two people racing for the last place cannot both get it.
     */
    @Modifying(flushAutomatically = true)
    @Query(
        "update OrgJoinCode c set c.uses = c.uses + 1 where c.orgId = :orgId and c.id = :id and c.revokedAt is null "
        + "and (c.expiresAt is null or c.expiresAt > :now) and (c.maxUses is null or c.uses < c.maxUses)"
    )
    int redeem(@Param("orgId") Long orgId, @Param("id") Long id, @Param("now") java.time.Instant now);
}
