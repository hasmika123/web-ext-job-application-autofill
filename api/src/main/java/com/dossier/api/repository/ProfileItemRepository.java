package com.dossier.api.repository;

import com.dossier.api.domain.ProfileItem;
import com.dossier.api.domain.enumeration.ProfileSection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Common Profile items (Resume Builder R0.1). Always read by the owning user's id. */
@Repository
public interface ProfileItemRepository extends JpaRepository<ProfileItem, Long> {
    Optional<ProfileItem> findByIdAndUserId(Long id, Long userId);

    List<ProfileItem> findByUserIdAndSectionAndDeletedAtIsNullOrderByPosition(Long userId, ProfileSection section);

    List<ProfileItem> findByUserIdAndDeletedAtIsNullOrderBySectionAscPositionAsc(Long userId);

    /** Every row a user owns, soft-deleted included (account deletion). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ProfileItem p where p.user.id = :userId")
    int deleteAllByUserId(@Param("userId") Long userId);
}
