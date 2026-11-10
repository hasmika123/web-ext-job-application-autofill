package com.dossier.api.repository;

import com.dossier.api.domain.OnboardingDraft;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** The onboarding draft, one row per user (Onboarding v2 R1.8). Always read by the owning user's id. */
@Repository
public interface OnboardingDraftRepository extends JpaRepository<OnboardingDraft, Long> {
    Optional<OnboardingDraft> findByUserId(Long userId);

    /** Start over, finish and account erasure: the user's draft row, if any. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from OnboardingDraft d where d.userId = :userId")
    int deleteByUserId(@Param("userId") Long userId);

    /** The nightly purge: drafts whose TTL ran out; returns how many went. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from OnboardingDraft d where d.expiresAt < :cutoff")
    int deleteByExpiresAtBefore(@Param("cutoff") Instant cutoff);
}
