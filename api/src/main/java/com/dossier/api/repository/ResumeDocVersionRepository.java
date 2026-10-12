package com.dossier.api.repository;

import com.dossier.api.domain.ResumeDocVersion;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Resume document version history (R0.1). Always read by the owning user's id. */
@Repository
public interface ResumeDocVersionRepository extends JpaRepository<ResumeDocVersion, Long> {
    Optional<ResumeDocVersion> findByIdAndUserId(Long id, Long userId);

    List<ResumeDocVersion> findByResumeIdAndUserIdOrderByVersionNoDesc(Long resumeId, Long userId);

    Optional<ResumeDocVersion> findByResumeIdAndUserIdAndVersionNo(Long resumeId, Long userId, int versionNo);

    Optional<ResumeDocVersion> findFirstByResumeIdAndUserIdOrderByVersionNoDesc(Long resumeId, Long userId);

    /** The newest row of the given reasons - the coalescing window for automatic rows starts at its time. */
    Optional<ResumeDocVersion> findFirstByResumeIdAndUserIdAndReasonInOrderByVersionNoDesc(
        Long resumeId,
        Long userId,
        Collection<String> reasons
    );

    /** Ids of the user's resumes that have a user-made checkpoint (MANUAL or NAMED): the Draft/Active split. */
    @Query("select distinct v.resumeId from ResumeDocVersion v where v.user.id = :userId and v.reason in ('MANUAL', 'NAMED')")
    Set<Long> findCheckpointResumeIds(@Param("userId") Long userId);

    /** Version rows without their (large) documents, newest first. */
    @Query(
        "select v.versionNo as versionNo, v.reason as reason, v.name as name, v.createdAt as createdAt, " +
        "v.contentHash as contentHash, v.createdByLogin as createdByLogin from ResumeDocVersion v " +
        "where v.resumeId = :resumeId and v.user.id = :userId order by v.versionNo desc"
    )
    List<VersionRow> findRows(@Param("resumeId") Long resumeId, @Param("userId") Long userId);

    interface VersionRow {
        int getVersionNo();

        String getReason();

        String getName();

        java.time.Instant getCreatedAt();

        String getContentHash();

        String getCreatedByLogin();
    }

    /** Ids of the automatic rows (everything but MANUAL and NAMED), newest first - what retention trims. */
    @Query(
        "select v.id from ResumeDocVersion v where v.resumeId = :resumeId and v.user.id = :userId " +
        "and v.reason not in ('MANUAL', 'NAMED') order by v.versionNo desc"
    )
    List<Long> findAutomaticIds(@Param("resumeId") Long resumeId, @Param("userId") Long userId);

    boolean existsByResumeIdAndUserIdAndReasonIn(Long resumeId, Long userId, Collection<String> reasons);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ResumeDocVersion v where v.resumeId = :resumeId and v.user.id = :userId")
    int deleteAllByResumeIdAndUserId(@Param("resumeId") Long resumeId, @Param("userId") Long userId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ResumeDocVersion v where v.user.id = :userId")
    int deleteAllByUserId(@Param("userId") Long userId);
}
