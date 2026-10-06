package com.dossier.api.repository;

import com.dossier.api.domain.ProfileSuggestion;
import com.dossier.api.domain.enumeration.SuggestionStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Profile suggestions (Phase 10.3c). Every read is scoped by the owning user's id. */
@Repository
public interface ProfileSuggestionRepository extends JpaRepository<ProfileSuggestion, Long> {
    List<ProfileSuggestion> findByUserId(Long userId);

    List<ProfileSuggestion> findByUserIdAndFieldKey(Long userId, String fieldKey);

    List<ProfileSuggestion> findByUserIdAndStatus(Long userId, SuggestionStatus status);

    long countByUserIdAndStatus(Long userId, SuggestionStatus status);

    Optional<ProfileSuggestion> findByIdAndUserId(Long id, Long userId);
}
