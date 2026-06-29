package com.dossier.api.repository;

import com.dossier.api.domain.AdminMfaChallenge;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Spring Data repository for pending admin MFA challenges (Phase 9.X.3). */
@Repository
public interface AdminMfaChallengeRepository extends JpaRepository<AdminMfaChallenge, Long> {
    Optional<AdminMfaChallenge> findByMfaToken(String mfaToken);
}
