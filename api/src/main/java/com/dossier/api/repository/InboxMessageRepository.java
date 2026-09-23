package com.dossier.api.repository;

import com.dossier.api.domain.InboxMessage;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Mail read from connected inboxes (Phase 14.3). */
@Repository
public interface InboxMessageRepository extends JpaRepository<InboxMessage, Long> {
    boolean existsByUserIdAndDedupKey(Long userId, String dedupKey);

    long countByUserId(Long userId);

    /** Messages not read by the parser yet (14.4a), oldest first — later mail should win. */
    List<InboxMessage> findTop500ByUserIdAndParsedAtIsNullOrderBySentAtAscIdAsc(Long userId);

    /** A user's suggestions in one state (14.4b), newest first. */
    List<InboxMessage> findByUserIdAndSuggestionOrderBySentAtDesc(Long userId, String suggestion);

    /** The mail about one application (14.4b), newest first. */
    List<InboxMessage> findByUserIdAndApplicationIdOrderBySentAtDesc(Long userId, Long applicationId);

    Optional<InboxMessage> findOneByIdAndUserId(Long id, Long userId);

    /** The message a reply answers, by its Message-ID — to follow a thread to its application. */
    Optional<InboxMessage> findFirstByUserIdAndMessageId(Long userId, String messageId);

    @Transactional
    @Modifying
    @Query("delete from InboxMessage m where m.userId = :userId")
    int deleteByUser(@Param("userId") Long userId);

    /** 14.7: mail past its retention — by when it was sent, or read if it carried no date. */
    @Transactional
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from InboxMessage m where coalesce(m.sentAt, m.createdAt) < :before")
    int deleteOlderThan(@Param("before") Instant before);

    /** Everything read from one user's inbox, for their data export (14.7). */
    List<InboxMessage> findByUserIdOrderBySentAtDesc(Long userId);
}
