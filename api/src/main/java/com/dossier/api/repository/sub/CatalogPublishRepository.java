package com.dossier.api.repository.sub;

import com.dossier.api.domain.catalog.CatalogPublish;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

/** Append-only access to {@code catalog_publish}; the id IS the catalog_version. */
public interface CatalogPublishRepository extends Repository<CatalogPublish, Integer> {
    <S extends CatalogPublish> S save(S entity);

    <S extends CatalogPublish> S saveAndFlush(S entity);

    long count();

    Optional<CatalogPublish> findById(Integer id);

    List<CatalogPublish> findAllByOrderByIdDesc();

    /** The current catalog version: the highest published id, 0 before the first publish. */
    @Query("select coalesce(max(p.id), 0) from CatalogPublish p")
    int currentVersion();
}
