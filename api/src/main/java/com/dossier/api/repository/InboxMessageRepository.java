package com.dossier.api.repository;

import com.dossier.api.domain.InboxMessage;
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

    @Transactional
    @Modifying
    @Query("delete from InboxMessage m where m.userId = :userId")
    int deleteByUser(@Param("userId") Long userId);
}
