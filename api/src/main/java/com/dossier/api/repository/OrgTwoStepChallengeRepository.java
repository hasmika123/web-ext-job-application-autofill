package com.dossier.api.repository;

import com.dossier.api.domain.OrgTwoStepChallenge;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Pending second steps of organization sign-ins (gap D-2). Looked up by their opaque token; one live challenge per person. */
@Repository
public interface OrgTwoStepChallengeRepository extends JpaRepository<OrgTwoStepChallenge, Long> {
    Optional<OrgTwoStepChallenge> findByChallengeToken(String challengeToken);

    /** How many codes this person was sent since {@code since}: the per-person limit on new codes. */
    @Query("select count(c) from OrgTwoStepChallenge c where c.userId = :userId and c.createdAt >= :since")
    long countByUserIdSince(@Param("userId") Long userId, @Param("since") Instant since);

    /** A new code replaces any older one of the same person: only one code works at a time. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update OrgTwoStepChallenge c set c.expiresAt = :now where c.userId = :userId and c.expiresAt > :now")
    int expireLiveForUser(@Param("userId") Long userId, @Param("now") Instant now);

    /** Account erasure: removes everything keyed by this user id. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from OrgTwoStepChallenge c where c.userId = :v")
    int deleteByUserIdValue(@Param("v") Long v);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from OrgTwoStepChallenge c where c.expiresAt < :now")
    int deleteExpired(@Param("now") Instant now);
}
