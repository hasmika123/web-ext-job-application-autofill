package com.dossier.api.repository;

import com.dossier.api.domain.AiAnswer;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the AiAnswer entity.
 */
@Repository
public interface AiAnswerRepository extends JpaRepository<AiAnswer, Long> {
    @Query("select aiAnswer from AiAnswer aiAnswer where aiAnswer.user.login = ?#{authentication.name}")
    List<AiAnswer> findByUserIsCurrentUser();

    /** Server-side answer cache lookup (Phase 5.3): one entry per (user, question_hash). */
    Optional<AiAnswer> findOneByUserLoginAndQuestionHash(String login, String questionHash);

    default Optional<AiAnswer> findOneWithEagerRelationships(Long id) {
        return this.findOneWithToOneRelationships(id);
    }

    default List<AiAnswer> findAllWithEagerRelationships() {
        return this.findAllWithToOneRelationships();
    }

    default Page<AiAnswer> findAllWithEagerRelationships(Pageable pageable) {
        return this.findAllWithToOneRelationships(pageable);
    }

    @Query(
        value = "select aiAnswer from AiAnswer aiAnswer left join fetch aiAnswer.user",
        countQuery = "select count(aiAnswer) from AiAnswer aiAnswer"
    )
    Page<AiAnswer> findAllWithToOneRelationships(Pageable pageable);

    @Query("select aiAnswer from AiAnswer aiAnswer left join fetch aiAnswer.user")
    List<AiAnswer> findAllWithToOneRelationships();

    @Query("select aiAnswer from AiAnswer aiAnswer left join fetch aiAnswer.user where aiAnswer.id =:id")
    Optional<AiAnswer> findOneWithToOneRelationships(@Param("id") Long id);
}
