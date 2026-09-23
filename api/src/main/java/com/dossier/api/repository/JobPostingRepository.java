package com.dossier.api.repository;

import com.dossier.api.domain.JobPosting;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Fresh postings read from job boards (Phase 13.6a). */
@Repository
public interface JobPostingRepository extends JpaRepository<JobPosting, Long> {
    /** External ids already stored for one board — so a nightly read only adds what's new. */
    @Query("select p.externalId from JobPosting p where p.source.id = :sourceId")
    List<String> externalIdsForSource(@Param("sourceId") Long sourceId);

    /** Whether the same job (company + title + location) is already stored, from any board. */
    boolean existsByDedupKey(String dedupKey);

    long countByPublishedAtAfter(Instant since);

    /** Postings first published after {@code since} — the pool a night's matching draws from. */
    List<JobPosting> findByPublishedAtAfter(Instant since);

    /** Stored postings per board: rows of {@code [sourceId, count]}. */
    @Query("select p.source.id, count(p) from JobPosting p group by p.source.id")
    List<Object[]> countBySource();

    @Transactional
    @Modifying
    @Query("delete from JobPosting p where p.publishedAt < :before")
    int deletePublishedBefore(@Param("before") Instant before);
}
