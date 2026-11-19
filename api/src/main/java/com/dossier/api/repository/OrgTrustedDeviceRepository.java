package com.dossier.api.repository;

import com.dossier.api.domain.OrgTrustedDevice;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Browsers remembered after an organization's second step (gap D-2). Looked up by the SHA-256 of the device token the browser holds. */
@Repository
public interface OrgTrustedDeviceRepository extends JpaRepository<OrgTrustedDevice, Long> {
    Optional<OrgTrustedDevice> findByTokenHash(String tokenHash);

    /** A person's seat ended in that organization: none of their browsers counts there any more. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from OrgTrustedDevice d where d.orgId = :orgId and d.userId = :userId")
    int deleteByOrgIdAndUserId(@Param("orgId") Long orgId, @Param("userId") Long userId);

    /** Account erasure: removes everything keyed by this user id. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from OrgTrustedDevice d where d.userId = :v")
    int deleteByUserIdValue(@Param("v") Long v);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from OrgTrustedDevice d where d.expiresAt < :now")
    int deleteExpired(@Param("now") Instant now);
}
