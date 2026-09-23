package com.dossier.api.repository;

import com.dossier.api.domain.ResumeTailor;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Checked tailoring proposals (Phase 13.4), always read by the owning user's id. */
@Repository
public interface ResumeTailorRepository extends JpaRepository<ResumeTailor, Long> {
    Optional<ResumeTailor> findFirstByUserIdAndCacheKeyOrderByCreatedAtDesc(Long userId, String cacheKey);

    List<ResumeTailor> findByUserId(Long userId);

    Optional<ResumeTailor> findByIdAndUserId(Long id, Long userId);
}
