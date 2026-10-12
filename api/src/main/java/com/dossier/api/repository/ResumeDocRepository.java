package com.dossier.api.repository;

import com.dossier.api.domain.ResumeDoc;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Resume Builder documents (R0.1). Keyed by resume id; always read with the owning user's id. */
@Repository
public interface ResumeDocRepository extends JpaRepository<ResumeDoc, Long> {
    Optional<ResumeDoc> findByResumeIdAndUserId(Long resumeId, Long userId);

    List<ResumeDoc> findByUserId(Long userId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ResumeDoc d where d.user.id = :userId")
    int deleteAllByUserId(@Param("userId") Long userId);
}
