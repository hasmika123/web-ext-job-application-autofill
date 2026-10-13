package com.dossier.api.repository.catalog;

import com.dossier.api.domain.ent.billing.FeatureDefinition;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Platform catalog access to {@code feature_definition} (no org_id: the catalog is shared; prices are org contract rows). */
public interface FeatureDefinitionRepository extends Repository<FeatureDefinition, String> {
    <S extends FeatureDefinition> S save(S entity);
    <S extends FeatureDefinition> List<S> saveAll(Iterable<S> entities);
    Optional<FeatureDefinition> findByFeatureKey(String featureKey);
    List<FeatureDefinition> findAllByOrderBySortOrderAsc();
    long count();
    List<FeatureDefinition> findByActiveTrueOrderBySortOrderAsc();

}
