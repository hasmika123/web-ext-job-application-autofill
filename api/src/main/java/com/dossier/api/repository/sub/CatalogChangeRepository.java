package com.dossier.api.repository.sub;

import com.dossier.api.domain.catalog.CatalogChange;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Append-only access to {@code catalog_change} (platform data, no org_id; the subscription module's repositories live in {@code repository.sub}). */
public interface CatalogChangeRepository extends Repository<CatalogChange, Long> {
    <S extends CatalogChange> S save(S entity);

    long count();

    List<CatalogChange> findByEntityAndEntityIdOrderByIdDesc(String entity, String entityId);

    List<CatalogChange> findByEntityOrderByIdDesc(String entity);
}
