package com.dossier.api.repository;

import com.dossier.api.domain.ResumeDocVersion;
import java.util.List;
import java.util.Optional;
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

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ResumeDocVersion v where v.resumeId = :resumeId and v.user.id = :userId")
    int deleteAllByResumeIdAndUserId(@Param("resumeId") Long resumeId, @Param("userId") Long userId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ResumeDocVersion v where v.user.id = :userId")
    int deleteAllByUserId(@Param("userId") Long userId);
}
