package com.dossier.api.repository;

import com.dossier.api.domain.Notification;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** In-app notifications (Phase 14.6). */
@Repository
public interface NotificationRepository extends JpaRepository<Notification, Long> {
    /** The bell: newest first, without the kinds the user switched off in-app. */
    List<Notification> findTop30ByUserIdAndInappMutedFalseOrderByCreatedAtDesc(Long userId);

    /** All of a user's notifications, for their data export (14.7). */
    List<Notification> findByUserIdOrderByCreatedAtDesc(Long userId);

    long countByUserIdAndReadAtIsNullAndInappMutedFalse(Long userId);

    boolean existsByUserIdAndDedupeKey(Long userId, String dedupeKey);

    boolean existsByUserIdAndApplicationIdAndStatus(Long userId, Long applicationId, String status);

    Optional<Notification> findOneByIdAndUserId(Long id, Long userId);

    @Transactional
    @Modifying
    @Query("update Notification n set n.readAt = :now where n.userId = :userId and n.readAt is null")
    int markAllRead(@Param("userId") Long userId, @Param("now") Instant now);

    @Transactional
    @Modifying
    @Query("delete from Notification n where n.userId = :userId")
    int deleteByUser(@Param("userId") Long userId);
}
