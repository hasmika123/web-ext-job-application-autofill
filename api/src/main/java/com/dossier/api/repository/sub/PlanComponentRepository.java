package com.dossier.api.repository.sub;

import com.dossier.api.domain.catalog.PlanComponent;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Platform access to {@code plan_component} (no org_id). */
public interface PlanComponentRepository extends Repository<PlanComponent, Long> {
    <S extends PlanComponent> S save(S entity);

    long count();

    List<PlanComponent> findByPlanVersionIdOrderBySortOrderAscIdAsc(Long planVersionId);

    <S extends PlanComponent> List<S> saveAll(Iterable<S> entities);

    void flush();

    /** Removes every component of one version (the full replacement of the components, or a discarded draft). */
    long deleteByPlanVersionId(Long planVersionId);

    List<PlanComponent> findByProductId(Long productId);
}
