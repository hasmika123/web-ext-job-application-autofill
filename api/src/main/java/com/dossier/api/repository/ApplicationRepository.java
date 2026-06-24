package com.dossier.api.repository;

import com.dossier.api.domain.Application;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the Application entity.
 */
@Repository
public interface ApplicationRepository extends JpaRepository<Application, Long>, JpaSpecificationExecutor<Application> {
    @Query("select application from Application application where application.user.login = ?#{authentication.name}")
    List<Application> findByUserIsCurrentUser();

    /** How many applications reference this resume — the archive-guard check (3.5). */
    long countByResumeId(Long resumeId);

    default Optional<Application> findOneWithEagerRelationships(Long id) {
        return this.findOneWithToOneRelationships(id);
    }

    default List<Application> findAllWithEagerRelationships() {
        return this.findAllWithToOneRelationships();
    }

    default Page<Application> findAllWithEagerRelationships(Pageable pageable) {
        return this.findAllWithToOneRelationships(pageable);
    }

    @Query(
        value = "select application from Application application left join fetch application.user left join fetch application.resume",
        countQuery = "select count(application) from Application application"
    )
    Page<Application> findAllWithToOneRelationships(Pageable pageable);

    @Query("select application from Application application left join fetch application.user left join fetch application.resume")
    List<Application> findAllWithToOneRelationships();

    @Query(
        "select application from Application application left join fetch application.user left join fetch application.resume where application.id =:id"
    )
    Optional<Application> findOneWithToOneRelationships(@Param("id") Long id);
}
