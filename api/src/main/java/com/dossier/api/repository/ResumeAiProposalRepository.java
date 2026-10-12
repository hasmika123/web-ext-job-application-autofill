package com.dossier.api.repository;

import com.dossier.api.domain.ResumeAiProposal;
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

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ResumeAiProposal p where p.user.id = :userId")
    int deleteAllByUserId(@Param("userId") Long userId);
}
