package com.dossier.api.repository;

import com.dossier.api.domain.CustomerNote;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Spring Data repository for admin notes on customers (Phase 9.C1). */
@Repository
public interface CustomerNoteRepository extends JpaRepository<CustomerNote, Long> {
    List<CustomerNote> findAllByUserIdOrderByCreatedAtDesc(Long userId);

    @Modifying
    @Query("delete from CustomerNote n where n.userId = :userId")
    int deleteAllByUserId(@Param("userId") Long userId);
}
