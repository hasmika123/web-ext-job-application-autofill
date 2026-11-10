package com.dossier.api.repository.sub;

import com.dossier.api.domain.sub.ServiceLock;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Access to {@code service_lock}: the read-only overlay of a Free fallback. */
public interface ServiceLockRepository extends JpaRepository<ServiceLock, Long> {
    List<ServiceLock> findByUserIdAndReleasedAtIsNullOrderByIdAsc(Long userId);

    Optional<ServiceLock> findFirstByUserIdAndFeatureKeyAndReleasedAtIsNull(Long userId, String featureKey);

    long countByUserId(Long userId);

    /** Accounts that still have a live lock row (the hourly housekeeping closes the ones whose feature is held again). */
    @org.springframework.data.jpa.repository.Query("select distinct l.userId from ServiceLock l where l.releasedAt is null")
    List<Long> findUsersWithLiveLocks();
}
