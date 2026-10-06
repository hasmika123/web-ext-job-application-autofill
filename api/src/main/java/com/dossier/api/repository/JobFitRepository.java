package com.dossier.api.repository;

import com.dossier.api.domain.JobFit;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Cached job-fit reports (Phase 13.3), always read by the owning user's id. */
@Repository
public interface JobFitRepository extends JpaRepository<JobFit, Long> {
    Optional<JobFit> findFirstByUserIdAndCacheKeyOrderByCreatedAtDesc(Long userId, String cacheKey);

    List<JobFit> findByUserId(Long userId);
}
