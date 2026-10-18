package com.dossier.api.repository;

import com.dossier.api.domain.ExtConnectCode;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ExtConnectCodeRepository extends JpaRepository<ExtConnectCode, Long> {
    Optional<ExtConnectCode> findByCodeHash(String codeHash);

    /** The single-use gate: marks the code used only if it is still unused and unexpired. 1 = this caller won it, 0 = unknown, used or expired. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update ExtConnectCode c set c.usedAt = :now where c.codeHash = :hash and c.usedAt is null and c.expiresAt > :now")
    int consume(@Param("hash") String hash, @Param("now") Instant now);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from ExtConnectCode c where c.expiresAt < :cutoff")
    int deleteExpiredBefore(@Param("cutoff") Instant cutoff);

    /** Account erasure: the account's connect codes go with it (the foreign key to the user has no cascade). */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from ExtConnectCode c where c.userId = :userId")
    int deleteByUserId(@Param("userId") Long userId);
}
