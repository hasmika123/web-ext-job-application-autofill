package com.dossier.api.repository;

import com.dossier.api.domain.InboxHold;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Status changes a mail proposed and the inbox held for the person (inbox-safety). */
@Repository
public interface InboxHoldRepository extends JpaRepository<InboxHold, Long> {
    Optional<InboxHold> findOneByIdAndUserId(Long id, Long userId);

    Optional<InboxHold> findFirstByUserIdAndMessageId(Long userId, Long messageId);

    /** Still waiting and not past its expiry, newest first. */
    List<InboxHold> findByUserIdAndStateAndExpiresAtAfterOrderByCreatedAtDesc(Long userId, String state, Instant now);

    long countByUserIdAndStateAndExpiresAtAfter(Long userId, String state, Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update InboxHold h set h.state = 'EXPIRED', h.resolvedAt = :now where h.state = 'PENDING' and h.expiresAt < :now")
    int expire(@Param("now") Instant now);
}
