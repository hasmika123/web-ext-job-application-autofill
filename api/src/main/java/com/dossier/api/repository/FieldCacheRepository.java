package com.dossier.api.repository;

import com.dossier.api.domain.FieldCache;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the FieldCache entity.
 */
@Repository
public interface FieldCacheRepository extends JpaRepository<FieldCache, Long> {
    @Query("select fieldCache from FieldCache fieldCache where fieldCache.user.login = ?#{authentication.name}")
    List<FieldCache> findByUserIsCurrentUser();

    default Optional<FieldCache> findOneWithEagerRelationships(Long id) {
        return this.findOneWithToOneRelationships(id);
    }

    default List<FieldCache> findAllWithEagerRelationships() {
        return this.findAllWithToOneRelationships();
    }

    default Page<FieldCache> findAllWithEagerRelationships(Pageable pageable) {
        return this.findAllWithToOneRelationships(pageable);
    }

    @Query(
        value = "select fieldCache from FieldCache fieldCache left join fetch fieldCache.user",
        countQuery = "select count(fieldCache) from FieldCache fieldCache"
    )
    Page<FieldCache> findAllWithToOneRelationships(Pageable pageable);

    @Query("select fieldCache from FieldCache fieldCache left join fetch fieldCache.user")
    List<FieldCache> findAllWithToOneRelationships();

    @Query("select fieldCache from FieldCache fieldCache left join fetch fieldCache.user where fieldCache.id =:id")
    Optional<FieldCache> findOneWithToOneRelationships(@Param("id") Long id);
}
