package com.dossier.api.repository;

import com.dossier.api.domain.Bio;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the Bio entity.
 */
@Repository
public interface BioRepository extends JpaRepository<Bio, Long> {
    @Query("select bio from Bio bio where bio.user.login = ?#{authentication.name}")
    List<Bio> findByUserIsCurrentUser();

    default Optional<Bio> findOneWithEagerRelationships(Long id) {
        return this.findOneWithToOneRelationships(id);
    }

    default List<Bio> findAllWithEagerRelationships() {
        return this.findAllWithToOneRelationships();
    }

    default Page<Bio> findAllWithEagerRelationships(Pageable pageable) {
        return this.findAllWithToOneRelationships(pageable);
    }

    @Query(value = "select bio from Bio bio left join fetch bio.user", countQuery = "select count(bio) from Bio bio")
    Page<Bio> findAllWithToOneRelationships(Pageable pageable);

    @Query("select bio from Bio bio left join fetch bio.user")
    List<Bio> findAllWithToOneRelationships();

    @Query("select bio from Bio bio left join fetch bio.user where bio.id =:id")
    Optional<Bio> findOneWithToOneRelationships(@Param("id") Long id);
}
