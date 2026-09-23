package com.dossier.api.repository;

import com.dossier.api.domain.InboxMessage;
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

    /** The message a reply answers, by its Message-ID — to follow a thread to its application. */
    Optional<InboxMessage> findFirstByUserIdAndMessageId(Long userId, String messageId);

    @Transactional
    @Modifying
    @Query("delete from InboxMessage m where m.userId = :userId")
    int deleteByUser(@Param("userId") Long userId);
}
