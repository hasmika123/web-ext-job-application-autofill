package com.dossier.api.repository;

import com.dossier.api.domain.JobMatch;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Postings scored for users (Phase 13.6b). */
@Repository
public interface JobMatchRepository extends JpaRepository<JobMatch, Long> {
    /** Postings already scored for this user — never sent again. */
    @Query("select m.posting.id from JobMatch m where m.user.id = :userId")
    List<Long> postingIdsForUser(@Param("userId") Long userId);

    /** A user's matches at or above {@code minScore} in one status, best first, with their postings. */
    @Query(
        "select m from JobMatch m join fetch m.posting where m.user.id = :userId and m.status = :status " +
        "and m.score >= :minScore order by m.score desc, m.createdAt desc"
    )
    List<JobMatch> findShown(@Param("userId") Long userId, @Param("status") String status, @Param("minScore") int minScore);

    Optional<JobMatch> findOneByIdAndUserId(Long id, Long userId);

    List<JobMatch> findByUserId(Long userId);
}
