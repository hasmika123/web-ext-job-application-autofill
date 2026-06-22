package com.dossier.api.repository;

import com.dossier.api.domain.Resume;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the Resume entity.
 */
@Repository
public interface ResumeRepository extends JpaRepository<Resume, Long> {
    @Query("select resume from Resume resume where resume.user.login = ?#{authentication.name}")
    List<Resume> findByUserIsCurrentUser();

    default Optional<Resume> findOneWithEagerRelationships(Long id) {
        return this.findOneWithToOneRelationships(id);
    }

    default List<Resume> findAllWithEagerRelationships() {
        return this.findAllWithToOneRelationships();
    }

    default Page<Resume> findAllWithEagerRelationships(Pageable pageable) {
        return this.findAllWithToOneRelationships(pageable);
    }

    @Query(value = "select resume from Resume resume left join fetch resume.user", countQuery = "select count(resume) from Resume resume")
    Page<Resume> findAllWithToOneRelationships(Pageable pageable);

    @Query("select resume from Resume resume left join fetch resume.user")
    List<Resume> findAllWithToOneRelationships();

    @Query("select resume from Resume resume left join fetch resume.user where resume.id =:id")
    Optional<Resume> findOneWithToOneRelationships(@Param("id") Long id);
}
