package com.dossier.api.repository;

import com.dossier.api.domain.AiUsage;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Spring Data repository for the per-user monthly AI usage meter (Phase 5.1). */
@Repository
public interface AiUsageRepository extends JpaRepository<AiUsage, Long> {
    Optional<AiUsage> findByLoginAndPeriod(String login, String period);

    // --- Admin AI-usage dashboard (Phase 9.A2.1) ---
    List<AiUsage> findByPeriodOrderByDraftCountDesc(String period);

    long countByPeriod(String period);

    @Query("select coalesce(sum(u.draftCount), 0) from AiUsage u where u.period = :period")
    long sumDraftsForPeriod(@Param("period") String period);
}
