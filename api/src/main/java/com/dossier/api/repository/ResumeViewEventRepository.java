package com.dossier.api.repository;

import com.dossier.api.domain.ResumeViewEvent;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** The "who viewed it" audit of a resume (R3.11). */
@Repository
public interface ResumeViewEventRepository extends JpaRepository<ResumeViewEvent, Long> {
    List<ResumeViewEvent> findByResumeIdOrderByViewedAtDescIdDesc(Long resumeId, Pageable page);

    long countByResumeId(Long resumeId);

    /** The retention job: drop events older than the cutoff; returns how many went. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ResumeViewEvent e where e.viewedAt < :cutoff")
    int deleteViewedBefore(@Param("cutoff") Instant cutoff);

    /** Erasure of an owner's account: every view of their resumes. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ResumeViewEvent e where e.ownerUserId = :userId")
    int deleteAllByOwner(@Param("userId") Long userId);

    /** Erasure of a viewer's account: events that name them go. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ResumeViewEvent e where e.viewerLogin = :login")
    int deleteByViewer(@Param("login") String login);
}
