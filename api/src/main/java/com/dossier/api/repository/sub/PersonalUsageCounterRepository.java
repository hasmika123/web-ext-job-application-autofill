package com.dossier.api.repository.sub;

import com.dossier.api.domain.usage.PersonalUsageCounter;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** The personal usage counters (story K7.5): one row per account, service, limit and period, row-locked while a reservation is decided. */
public interface PersonalUsageCounterRepository extends Repository<PersonalUsageCounter, Long> {
    <S extends PersonalUsageCounter> S save(S entity);

    long count();

    /** The row, locked FOR UPDATE: two concurrent reservations of the last unit queue here and only the first wins. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
        "select c from PersonalUsageCounter c where c.userId = :userId and c.featureKey = :feature and c.limitKey = :limit and c.periodKey = :period"
    )
    Optional<PersonalUsageCounter> findForUpdate(
        @Param("userId") Long userId,
        @Param("feature") String feature,
        @Param("limit") String limit,
        @Param("period") String period
    );

    /** Create the counter row if it does not exist yet (a lost race is a no-op, the unique key decides). */
    @Modifying
    @Query(
        value = "INSERT IGNORE INTO personal_usage_counter (user_id, feature_key, limit_key, period_key, used, allowance, updated_at) " +
        "VALUES (:userId, :feature, :limit, :period, 0, :allowance, :now)",
        nativeQuery = true
    )
    int insertIgnore(
        @Param("userId") Long userId,
        @Param("feature") String feature,
        @Param("limit") String limit,
        @Param("period") String period,
        @Param("allowance") long allowance,
        @Param("now") Instant now
    );
}
