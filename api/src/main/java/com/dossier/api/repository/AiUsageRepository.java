package com.dossier.api.repository;

import com.dossier.api.domain.AiUsage;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Spring Data repository for the per-user monthly AI usage meter (Phase 5.1). */
@Repository
public interface AiUsageRepository extends JpaRepository<AiUsage, Long> {
    Optional<AiUsage> findByLoginAndPeriod(String login, String period);

    /**
     * Count one call, atomically, in the database (13.1a). The old read-increment-save lost a count
     * whenever two calls landed together (both read N, both wrote N+1), and two first-of-the-month
     * calls could both try to create the row and collide on {@code ux_ai_usage_login_period}. One
     * MySQL upsert does both jobs: it creates the row at 1, or adds 1 to it.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
        value = "insert into ai_usage (login, period, draft_count) values (:login, :period, 1) " +
        "on duplicate key update draft_count = draft_count + 1",
        nativeQuery = true
    )
    void increment(@Param("login") String login, @Param("period") String period);

    /** Account deletion: the login may be registered again, and must not inherit this month's count. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from AiUsage u where u.login = :login")
    int deleteByLoginValue(@Param("login") String login);

    // --- Admin AI-usage dashboard (Phase 9.A2.1) ---
    List<AiUsage> findByPeriodOrderByDraftCountDesc(String period);

    long countByPeriod(String period);

    @Query("select coalesce(sum(u.draftCount), 0) from AiUsage u where u.period = :period")
    long sumDraftsForPeriod(@Param("period") String period);
}
