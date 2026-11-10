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

    List<JobPosting> findBySourceId(Long sourceId);

    /** Postings first published after {@code since} — the pool a night's matching draws from. */
    List<JobPosting> findByPublishedAtAfter(Instant since);

    /** Stored postings per board: rows of {@code [sourceId, count]}. */
    @Query("select p.source.id, count(p) from JobPosting p group by p.source.id")
    List<Object[]> countBySource();

    /** The columns a result list shows, for these postings (E2E-U4.0). */
    @Query(
        "select new com.dossier.api.repository.JobPostingCard(p.id, p.title, p.company, p.location, p.workplaceType, p.remote, " +
        "p.employmentType, p.publishedAt, s.ats) from JobPosting p join p.source s where p.id in :ids"
    )
    List<JobPostingCard> cards(@Param("ids") java.util.Collection<Long> ids);

    /** Open postings of one company (lower-cased name), for the detail view's "more at this company". */
    long countByCompanyIgnoreCase(String company);

    /**
     * Title suggestions: distinct titles (case-insensitive) that start with, or have a word that starts with, the typed
     * letters, most-posted first. {@code prefix} and {@code word} are the two LIKE patterns, already escaped.
     * Rows of {@code [title, count]}.
     */
    @Query(
        "select min(p.title), count(p) from JobPosting p where lower(p.title) like :prefix or lower(p.title) like :word " +
        "group by lower(p.title) order by count(p) desc, min(p.title)"
    )
    List<Object[]> suggestTitles(@Param("prefix") String prefix, @Param("word") String word, org.springframework.data.domain.Pageable page);

    @Transactional
    @Modifying
    @Query("delete from JobPosting p where p.publishedAt < :before")
    int deletePublishedBefore(@Param("before") Instant before);
}
