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
    List<Notification> findTop30ByUserIdOrderByCreatedAtDesc(Long userId);

    long countByUserIdAndReadAtIsNull(Long userId);

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
