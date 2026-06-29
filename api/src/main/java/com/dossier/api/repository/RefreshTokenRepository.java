package com.dossier.api.repository;

import com.dossier.api.domain.RefreshToken;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Spring Data repository for the {@link RefreshToken} denylist (1.11 rotation + revocation).
 */
@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    Optional<RefreshToken> findByJti(String jti);

    /** Admin sessions view (Phase 9.A2.3): all of a user's refresh tokens, grouped into families. */
    List<RefreshToken> findByUserId(Long userId);

    // flush pending entity changes first, and clear the persistence context after, so this
    // bulk update isn't shadowed by stale first-level-cache entities (reuse detection reads
    // the revoked flag back in the same transaction).
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update RefreshToken t set t.revoked = true where t.familyId = :familyId and t.revoked = false")
    int revokeFamily(@Param("familyId") String familyId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from RefreshToken t where t.userId = :userId")
    int deleteByUserId(@Param("userId") Long userId);

    // Force-logout (Phase 9.A1.4): revoke (keep the rows for forensics) every live token for a
    // user, so none can be rotated — they must sign in again.
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update RefreshToken t set t.revoked = true where t.userId = :userId and t.revoked = false")
    int revokeAllByUserId(@Param("userId") Long userId);
}
