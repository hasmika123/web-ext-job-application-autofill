package com.dossier.api.repository;

import com.dossier.api.domain.ResumeMatch;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Cached resume-vs-job scores (Phase 13.2), always read by the owning user's id. */
@Repository
public interface ResumeMatchRepository extends JpaRepository<ResumeMatch, Long> {
    Optional<ResumeMatch> findFirstByUserIdAndCacheKeyOrderByCreatedAtDesc(Long userId, String cacheKey);

    List<ResumeMatch> findByUserId(Long userId);
}
