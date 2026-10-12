package com.dossier.api.repository;

import com.dossier.api.domain.ResumeAiProposal;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Checked AI proposals against builder documents (R0.1). Always read by the owning user's id. */
@Repository
public interface ResumeAiProposalRepository extends JpaRepository<ResumeAiProposal, Long> {
    Optional<ResumeAiProposal> findByIdAndUserId(Long id, Long userId);

    Optional<ResumeAiProposal> findFirstByUserIdAndCacheKeyOrderByCreatedAtDesc(Long userId, String cacheKey);

    /** The open proposal a repeated request is answered with (R4.1): same user, resume and cache key, still OPEN. */
    Optional<ResumeAiProposal> findFirstByUserIdAndResumeIdAndCacheKeyAndStatusOrderByCreatedAtDesc(Long userId, Long resumeId, String cacheKey, String status);

    /** A resume's proposals in one status, newest first (the open cards and diffs). */
    List<ResumeAiProposal> findByUserIdAndResumeIdAndStatusOrderByCreatedAtDesc(Long userId, Long resumeId, String status);

    /** A user's proposals in one status, oldest first (trimming the open ones to the cap). */
    List<ResumeAiProposal> findByUserIdAndStatusOrderByCreatedAtAsc(Long userId, String status);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ResumeAiProposal p where p.resumeId = :resumeId and p.user.id = :userId")
    int deleteAllByResumeIdAndUserId(@Param("resumeId") Long resumeId, @Param("userId") Long userId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ResumeAiProposal p where p.user.id = :userId")
    int deleteAllByUserId(@Param("userId") Long userId);
}
