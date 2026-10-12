package com.dossier.api.repository;

import com.dossier.api.domain.Application;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the Application entity.
 */
@Repository
public interface ApplicationRepository extends JpaRepository<Application, Long>, JpaSpecificationExecutor<Application> {
    @Query("select application from Application application where application.user.login = ?#{authentication.name}")
    List<Application> findByUserIsCurrentUser();

    /** Admin-scoped lookup of a specific user's applications (Phase 9.A1.4 account erase). */
    List<Application> findByUserId(Long userId);

    /** One application by id AND owner: someone else's id finds nothing (the tracker's 404-not-403 rule). */
    Optional<Application> findOneByIdAndUserId(Long id, Long userId);

    /** How many applications reference this resume — the archive-guard check (3.5). */
    long countByResumeId(Long resumeId);

    // --- Admin analytics (Phase 9.A3) ---
    long countByStatus(com.dossier.api.domain.enumeration.ApplicationStatus status);

    @Query("select count(distinct application.user.id) from Application application")
    long countDistinctUsers();

    @Query("select count(distinct application.user.id) from Application application where application.status = :status")
    long countDistinctUsersByStatus(@Param("status") com.dossier.api.domain.enumeration.ApplicationStatus status);

    default Optional<Application> findOneWithEagerRelationships(Long id) {
        return this.findOneWithToOneRelationships(id);
    }

    default List<Application> findAllWithEagerRelationships() {
        return this.findAllWithToOneRelationships();
    }

    default Page<Application> findAllWithEagerRelationships(Pageable pageable) {
        return this.findAllWithToOneRelationships(pageable);
    }

    @Query(
        value = "select application from Application application left join fetch application.user left join fetch application.resume",
        countQuery = "select count(application) from Application application"
    )
    Page<Application> findAllWithToOneRelationships(Pageable pageable);

    @Query("select application from Application application left join fetch application.user left join fetch application.resume")
    List<Application> findAllWithToOneRelationships();

    @Query(
        "select application from Application application left join fetch application.user left join fetch application.resume where application.id =:id"
    )
    Optional<Application> findOneWithToOneRelationships(@Param("id") Long id);

    /**
     * Job links and company names from applications on Greenhouse, Lever or Ashby, across all users:
     * rows of {@code [jobUrl, company]}. 13.6a reads the board name out of each link to add that
     * company to the job-match pool. Only the link and company leave this query, never who applied.
     */
    @Query(
        "select distinct a.jobUrl, a.company from Application a where a.jobUrl like '%greenhouse.io%' " +
        "or a.jobUrl like '%lever.co%' or a.jobUrl like '%ashbyhq.com%'"
    )
    List<Object[]> findJobBoardLinks();

    /** Which of these postings the user already tracks (not archived): the "saved" flag on a search result. */
    @Query(
        "select a.postingId from Application a where a.user.id = :userId and a.postingId in :postingIds " +
        "and (a.archived is null or a.archived = false)"
    )
    List<Long> trackedPostingIds(@Param("userId") Long userId, @Param("postingIds") java.util.Collection<Long> postingIds);

    /** Whether the user ever tracked this posting (a purged posting then answers 410, not 404). */
    boolean existsByUserIdAndPostingId(Long userId, Long postingId);

    /** The user's SAVED, not-archived applications for a posting: hiding the job puts these away. */
    @Query(
        "select a from Application a where a.user.id = :userId and a.postingId = :postingId and a.status = " +
        "com.dossier.api.domain.enumeration.ApplicationStatus.SAVED and (a.archived is null or a.archived = false)"
    )
    List<Application> savedForPosting(@Param("userId") Long userId, @Param("postingId") Long postingId);
}
