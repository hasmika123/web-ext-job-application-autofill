package com.dossier.api.repository.sub;

import com.dossier.api.domain.catalog.Plan;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Platform access to {@code plan} (no org_id). */
public interface PlanRepository extends Repository<Plan, Long> {
    <S extends Plan> S save(S entity);

    long count();

    Optional<Plan> findById(Long id);

    Optional<Plan> findByPlanKey(String planKey);

    List<Plan> findAllByOrderBySortOrderAscIdAsc();

    List<Plan> findByAudienceOrderBySortOrderAscIdAsc(String audience);
}
