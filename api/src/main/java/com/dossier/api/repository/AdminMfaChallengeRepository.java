package com.dossier.api.repository;

import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import com.dossier.api.domain.AdminMfaChallenge;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Spring Data repository for pending admin MFA challenges (Phase 9.X.3). */
@Repository
public interface AdminMfaChallengeRepository extends JpaRepository<AdminMfaChallenge, Long> {
    Optional<AdminMfaChallenge> findByMfaToken(String mfaToken);

    /** Account erasure: removes everything keyed by this user id. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from AdminMfaChallenge c where c.userId = :v")
    int deleteByUserIdValue(@Param("v") Long v);
}
