package com.dossier.api.repository;

import com.dossier.api.domain.ApplicationNote;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** The user's notes on their applications (APP-E2E U6.1). Callers prove the application is theirs first. */
@Repository
public interface ApplicationNoteRepository extends JpaRepository<ApplicationNote, Long> {
    /** Pinned first, then newest first. */
    List<ApplicationNote> findByApplicationIdOrderByPinnedDescCreatedAtDescIdDesc(Long applicationId);

    Optional<ApplicationNote> findOneByIdAndApplicationId(Long id, Long applicationId);

    long countByApplicationId(Long applicationId);

    /** Rows of {@code [applicationId, count]}. */
    @Query("select n.applicationId, count(n) from ApplicationNote n where n.applicationId in :ids group by n.applicationId")
    List<Object[]> countByApplicationIds(@Param("ids") Collection<Long> ids);

    @Query("select n from ApplicationNote n where n.applicationId in (select a.id from Application a where a.user.id = :userId) order by n.applicationId, n.createdAt, n.id")
    List<ApplicationNote> findAllByUser(@Param("userId") Long userId);

    @Transactional
    @Modifying
    @Query("delete from ApplicationNote n where n.applicationId in (select a.id from Application a where a.user.id = :userId)")
    int deleteByUser(@Param("userId") Long userId);
}
