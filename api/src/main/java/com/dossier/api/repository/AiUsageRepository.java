package com.dossier.api.repository;

import com.dossier.api.domain.AiUsage;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Spring Data repository for the per-user monthly AI usage meter (Phase 5.1). */
@Repository
public interface AiUsageRepository extends JpaRepository<AiUsage, Long> {
    Optional<AiUsage> findByLoginAndPeriod(String login, String period);
}
