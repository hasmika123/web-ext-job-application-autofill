package com.dossier.api.repository;

import com.dossier.api.domain.InboxFolderState;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Where each connected folder's sync stands (Phase 14.3). */
@Repository
public interface InboxFolderStateRepository extends JpaRepository<InboxFolderState, Long> {
    Optional<InboxFolderState> findOneByUserIdAndFolder(Long userId, String folder);

    List<InboxFolderState> findByUserId(Long userId);

    @Transactional
    @Modifying
    @Query("delete from InboxFolderState s where s.userId = :userId")
    int deleteByUser(@Param("userId") Long userId);
}
