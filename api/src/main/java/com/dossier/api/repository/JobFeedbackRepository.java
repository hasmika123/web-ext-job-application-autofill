package com.dossier.api.repository;

import com.dossier.api.domain.JobFeedback;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** What users said about postings (E2E-U4.0). Every query is by the owner's id. */
@Repository
public interface JobFeedbackRepository extends JpaRepository<JobFeedback, Long> {
    Optional<JobFeedback> findOneByUserIdAndPostingIdAndSignal(Long userId, Long postingId, String signal);

    Optional<JobFeedback> findOneByUserIdAndCompanyKeyAndSignal(Long userId, String companyKey, String signal);

    List<JobFeedback> findByUserId(Long userId);

    List<JobFeedback> findByUserIdAndCompanyKeyAndSignal(Long userId, String companyKey, String signal);

    @Transactional
    @Modifying
    @Query("delete from JobFeedback f where f.userId = :userId")
    int deleteByUser(@Param("userId") Long userId);

    /** HIDE rows whose posting was purged (the FK set them to NULL): they hide nothing any more. */
    @Transactional
    @Modifying
    @Query("delete from JobFeedback f where f.postingId is null and f.signal = 'HIDE'")
    int deleteOrphanHides();
}
