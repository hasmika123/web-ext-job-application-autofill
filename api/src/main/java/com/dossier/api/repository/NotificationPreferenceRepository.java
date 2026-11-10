package com.dossier.api.repository;

import com.dossier.api.domain.NotificationPreference;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Notification switches, one row per user (E2E-U7.0). Always read by the owning user's id. */
@Repository
public interface NotificationPreferenceRepository extends JpaRepository<NotificationPreference, Long> {
    /** Account erasure: the user's preference row, if any. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from NotificationPreference p where p.userId = :userId")
    int deleteByUserId(@Param("userId") Long userId);
}
