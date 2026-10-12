package com.dossier.api.repository;

import com.dossier.api.domain.ResumeAccess;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Resume access grants (R3.11). Callers check ownership of the resume before they touch a grant. */
@Repository
public interface ResumeAccessRepository extends JpaRepository<ResumeAccess, Long> {
    /** A grant of this resume by id: a grant id from another resume never matches. */
    Optional<ResumeAccess> findByIdAndResumeId(Long id, Long resumeId);

    Optional<ResumeAccess> findByToken(String token);

    /** Every grant on the user's resumes (account export). */
    List<ResumeAccess> findByOwnerUserIdOrderByIdAsc(Long ownerUserId);

    /** The resume's grants that have not been revoked (expired ones included, so the owner can see and remove them). */
    List<ResumeAccess> findByResumeIdAndRevokedAtIsNullOrderByCreatedAtAscIdAsc(Long resumeId);

    /** A person's grants on one resume that have not been revoked. */
    List<ResumeAccess> findByResumeIdAndSubjectTypeAndSubjectLoginAndRevokedAtIsNull(Long resumeId, String subjectType, String subjectLogin);

    /** Grants of any resume made to this login (not revoked); the caller filters expiry. */
    List<ResumeAccess> findBySubjectTypeAndSubjectLoginAndRevokedAtIsNull(String subjectType, String subjectLogin);

    @Query(
        "select count(a) from ResumeAccess a where a.resumeId = :resumeId and a.subjectType = :type and a.revokedAt is null " +
        "and (a.expiresAt is null or a.expiresAt > :now)"
    )
    long countActive(@Param("resumeId") Long resumeId, @Param("type") String type, @Param("now") Instant now);

    /** Count one view on a grant without loading or re-writing the row. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ResumeAccess a set a.viewCount = a.viewCount + 1, a.lastViewedAt = :now where a.id = :id")
    int countView(@Param("id") Long id, @Param("now") Instant now);

    /** Revoke every live grant of a type on a resume at once. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ResumeAccess a set a.revokedAt = :now where a.resumeId = :resumeId and a.subjectType = :type and a.revokedAt is null")
    int revokeAll(@Param("resumeId") Long resumeId, @Param("type") String type, @Param("now") Instant now);

    /** Erasure of an owner's account: every grant on their resumes. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ResumeAccess a where a.ownerUserId = :userId")
    int deleteAllByOwner(@Param("userId") Long userId);

    /** Erasure of a grantee's account: the grants made to them go. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ResumeAccess a where a.subjectType = 'USER' and a.subjectLogin = :login")
    int deleteGrantsTo(@Param("login") String login);
}
